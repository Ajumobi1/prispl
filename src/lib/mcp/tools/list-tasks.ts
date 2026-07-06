import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "List PR&S tasks visible to the signed-in user. Optionally filter by status, unit, or assignee.",
  inputSchema: {
    status: z
      .enum(["Not Started", "In Progress", "Awaiting Review", "Completed", "Delayed"])
      .optional()
      .describe("Filter by task status."),
    unit: z
      .enum(["Planning", "Research", "Statistics", "M&E"])
      .optional()
      .describe("Filter by unit."),
    assignee: z.string().optional().describe("Filter by assignee name (exact match)."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, unit, assignee, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let query = supabaseForUser(ctx)
      .from("tasks")
      .select(
        "id, serial_number, unit, task_title, assignee, status, priority, due_date, date_assigned",
      )
      .order("serial_number", { ascending: false })
      .limit(limit ?? 50);
    if (status) query = query.eq("status", status);
    if (unit) query = query.eq("unit", unit);
    if (assignee) query = query.eq("assignee", assignee);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { tasks: data ?? [] },
    };
  },
});
