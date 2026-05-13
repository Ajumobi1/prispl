import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TG_CHAT = Deno.env.get("TELEGRAM_CHAT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function tgUrl(method: string) {
  return `https://api.telegram.org/bot${TG_TOKEN}/${method}`;
}

async function sendDocument(filename: string, bytes: Uint8Array, caption: string, mime: string) {
  const form = new FormData();
  form.append("chat_id", TG_CHAT!);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("document", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(tgUrl("sendDocument"), { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendDocument failed: ${JSON.stringify(data)}`);
  return data;
}

async function sendMessage(text: string) {
  const res = await fetch(tgUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${JSON.stringify(data)}`);
  return data;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthKey(dateStr: string | null | undefined): { key: string; label: string } {
  if (!dateStr) return { key: "0000-00", label: "Undated" };
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { key: "0000-00", label: "Undated" };
  const y = d.getFullYear();
  const m = d.getMonth();
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[m]} ${y}` };
}

function toRow(t: any) {
  return {
    "S/N": t.serial_number,
    Unit: t.unit,
    Task: t.task_title,
    Description: t.task_description,
    Assignee: t.assignee,
    "Start Date": t.date_assigned,
    "End Date": t.due_date,
    Status: t.status,
    Priority: t.priority,
    Deliverable: t.deliverable,
    Checklist: t.checklist,
    Remarks: t.remarks,
  };
}

const MONTH_ABBR = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function monthFileTag(key: string, label: string): string {
  // key format: "YYYY-MM" -> "JAN2025"; fallback for "Undated"
  if (key === "0000-00") return "UNDATED";
  const [y, m] = key.split("-");
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return label.replace(/\s+/g, "");
  return `${MONTH_ABBR[idx]}${y}`;
}

function buildSingleMonthXlsx(rows: any[], sheetLabel: string): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  const safeName = sheetLabel.replace(/[:\\/?*\[\]]/g, "").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeName || "Tasks");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(buf);
}

function groupTasksByMonth(tasks: any[]) {
  const groups = new Map<string, { label: string; rows: any[] }>();
  for (const t of tasks) {
    const { key, label } = monthKey(t.date_assigned);
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key)!.rows.push(toRow(t));
  }
  return groups;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!TG_TOKEN || !TG_CHAT) {
      throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured");
    }

    // Require an authenticated, approved caller. This endpoint can dump tasks
    // and download arbitrary attachments via the service-role key, so it must
    // never be callable anonymously.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Approval check (uses service-role to bypass RLS on profiles).
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("status")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!callerProfile || callerProfile.status !== "approved") {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const nowStr = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });

    if (body.type === "task") {
      // Fetch all tasks, group by month-year, send a separate file per group
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("*")
        .order("serial_number", { ascending: true });
      if (error) throw error;

      const t = body.task ?? {};
      const uploader = body.uploader ?? "Unknown";

      const newTaskMonth = monthKey(t.dateAssigned ?? t.date_assigned ?? null);
      const newTaskTag = monthFileTag(newTaskMonth.key, newTaskMonth.label);

      const headerMsg =
        `🆕 <b>New Task Added</b>\n` +
        `<b>By:</b> ${uploader}\n` +
        `<b>When:</b> ${nowStr}\n` +
        `<b>Unit:</b> ${t.unit ?? "-"}\n` +
        `<b>Title:</b> ${t.taskTitle ?? "-"}\n` +
        `<b>Assignee:</b> ${t.assignee ?? "-"}\n` +
        `<b>Start:</b> ${t.dateAssigned ?? "-"}\n` +
        `<b>Due:</b> ${t.dueDate ?? "-"}\n` +
        `<b>Month:</b> ${newTaskTag}\n\n` +
        `📊 Backup files (one per month) follow.`;
      await sendMessage(headerMsg);

      const groups = groupTasksByMonth(tasks ?? []);
      const sortedKeys = [...groups.keys()].sort();

      if (sortedKeys.length === 0) {
        await sendMessage("ℹ️ No tasks to back up yet.");
      } else {
        for (const key of sortedKeys) {
          const { label, rows } = groups.get(key)!;
          const tag = monthFileTag(key, label);
          const xlsx = buildSingleMonthXlsx(rows, label);
          const filename = `prs-tasks-${tag}.xlsx`;
          const isNewTaskMonth = key === newTaskMonth.key;
          const caption =
            `📅 <b>${label}</b> ${isNewTaskMonth ? "⭐" : ""}\n` +
            `<b>Month tag:</b> ${tag}\n` +
            `<b>Tasks in file:</b> ${rows.length}`;
          await sendDocument(
            filename,
            xlsx,
            caption,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
        }
      }

      return new Response(JSON.stringify({ ok: true, groups: sortedKeys.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.type === "file") {
      const { taskId, attachmentId, uploader } = body;
      const { data: att, error: attErr } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("id", attachmentId)
        .single();
      if (attErr) throw attErr;

      const { data: task } = await supabase
        .from("tasks")
        .select("task_title, unit, serial_number")
        .eq("id", taskId)
        .single();

      const { data: fileBlob, error: dlErr } = await supabase.storage
        .from("task-attachments")
        .download(att.file_path);
      if (dlErr) throw dlErr;

      const bytes = new Uint8Array(await fileBlob.arrayBuffer());
      const caption =
        `📎 <b>New File Uploaded</b>\n` +
        `<b>By:</b> ${uploader ?? "Unknown"}\n` +
        `<b>When:</b> ${nowStr}\n` +
        `<b>Task:</b> #${task?.serial_number ?? "-"} — ${task?.task_title ?? "-"}\n` +
        `<b>Unit:</b> ${task?.unit ?? "-"}\n` +
        `<b>File:</b> ${att.file_name}`;

      await sendDocument(att.file_name, bytes, caption, att.content_type || "application/octet-stream");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.type === "ping") {
      await sendMessage(`✅ PR&S Tracker connected at ${nowStr}`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("telegram-backup error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
