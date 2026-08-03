import { memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRSTask, TaskPriority, TaskStatus, statusColumns } from "@/lib/task-types";

const priorityClasses: Record<TaskPriority, string> = {
  "Urgent/High": "bg-destructive/10 text-destructive border-destructive/20",
  Medium: "bg-accent text-accent-foreground border-accent",
  Low: "bg-secondary text-secondary-foreground border-secondary",
};

interface KanbanBoardProps {
  groupedByStatus: Record<TaskStatus, PRSTask[]>;
  getTaskKey: (task: PRSTask) => string;
}

function KanbanBoardBase({ groupedByStatus, getTaskKey }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {statusColumns.map((status) => (
        <Card key={status}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{status}</CardTitle>
            <CardDescription>{(groupedByStatus[status] ?? []).length} tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(groupedByStatus[status] ?? []).map((task) => (
              <div key={getTaskKey(task)} className="rounded-md border bg-card p-2 text-sm">
                <div className="font-medium text-foreground">{task.taskTitle}</div>
                <div className="text-xs text-muted-foreground">{task.unit} · {task.assignee}</div>
                <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-xs ${priorityClasses[task.priority]}`}>{task.priority}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default memo(KanbanBoardBase);
