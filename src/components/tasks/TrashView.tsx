import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PRSTask } from "@/lib/task-types";

interface TrashViewProps {
  tasks: PRSTask[];
  loading: boolean;
  canRestore: (task: PRSTask) => boolean;
  onRestore: (task: PRSTask) => void;
  getTaskKey: (task: PRSTask) => string;
}

function TrashViewBase({ tasks, loading, canRestore, onRestore, getTaskKey }: TrashViewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trash</CardTitle>
        <CardDescription>Deleted tasks are kept here. Creators and admins can restore them.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading trash…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Trash is empty.</p>
        ) : (
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>S/N</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={getTaskKey(task)}>
                  <TableCell>{task.serialNumber}</TableCell>
                  <TableCell className="font-medium">{task.taskTitle}</TableCell>
                  <TableCell>{task.unit}</TableCell>
                  <TableCell>{task.assignee}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {task.deletedAt ? new Date(task.deletedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    {canRestore(task) ? (
                      <Button size="sm" variant="outline" onClick={() => onRestore(task)}>Restore</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No access</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(TrashViewBase);
