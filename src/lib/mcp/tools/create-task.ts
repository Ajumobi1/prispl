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
  name: "create_task",
  title: "Create task",
  description: "Create a new PR&S task owned by the signed-in user.",
  inputSchema: {
    unit: z.enum(["Planning", "Research", "Statistics", "M&E"]),
    task_title: z.string().min(1),
    task_description: z.string().default(""),
    assignee: z.string().min(1),
    date_assigned: z.string().describe("ISO date (YYYY-MM-DD)."),
    due_date: z.string().describe("ISO date (YYYY-MM-DD)."),
    status: z
      .enum(["Not Started", "In Progress", "Awaiting Review", "Completed", "Delayed"])
      .default("Not Started"),
    priority: z.enum(["Urgent/High", "Medium", "Low"]).default("Medium"),
    deliverable: z.string().default(""),
    checklist: z.string().default(""),
    remarks: z.string().default(""),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("tasks")
      .insert({
        unit: input.unit,
        task_title: input.task_title,
        task_description: input.task_description,
        assignee: input.assignee,
        date_assigned: input.date_assigned,
        due_date: input.due_date,
        status: input.status,
        priority: input.priority,
        deliverable: input.deliverable,
        checklist: input.checklist,
        remarks: input.remarks,
        created_by: ctx.getUserId(),
      })
      .select()
      .single();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Created task ${data.id}` }],
      structuredContent: { task: data },
    };
  },
});
