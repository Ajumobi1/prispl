import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";
import updateTaskStatusTool from "./tools/update-task-status";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "prs-platform-mcp",
  title: "PR&S Platform MCP",
  version: "0.1.0",
  instructions:
    "Tools for the PR&S Department Platform. Use `whoami` to confirm the signed-in user, `list_tasks` to browse tasks (optionally filtered by status, unit, or assignee), `create_task` to add a new task, and `update_task_status` to move a task between statuses.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listTasksTool, createTaskTool, updateTaskStatusTool],
});
