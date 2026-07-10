import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface ClientError {
  id: string;
  user_id: string | null;
  source: string;
  message: string;
  stack: string | null;
  component_stack: string | null;
  url: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function ClientErrorsCard() {
  const [errors, setErrors] = useState<ClientError[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("client_errors")
        .select("id,user_id,source,message,stack,component_stack,url,user_agent,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setErrors((data ?? []) as ClientError[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load errors.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const clearAll = async () => {
    if (!confirm("Delete ALL client error reports? This cannot be undone.")) return;
    const { error } = await supabase
      .from("client_errors")
      .delete()
      .gte("created_at", "1970-01-01");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setErrors([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Client Errors ({errors.length})</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
            {errors.length > 0 && (
              <Button size="sm" variant="outline" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No client errors recorded. The app is running cleanly.
          </p>
        ) : (
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>URL</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((e) => (
                <Fragment key={e.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{e.source}</TableCell>
                    <TableCell className="max-w-[280px] text-xs">
                      <span className="break-words">{e.message}</span>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {e.url ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        {expanded === e.id ? "Hide" : "Details"}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded === e.id && (
                    <TableRow key={`${e.id}-details`}>
                      <TableCell colSpan={5} className="bg-muted/30">
                        <div className="space-y-2 py-2 text-xs">
                          {e.user_id && (
                            <div>
                              <span className="font-medium">User:</span>{" "}
                              <span className="font-mono">{e.user_id}</span>
                            </div>
                          )}
                          {e.user_agent && (
                            <div>
                              <span className="font-medium">Agent:</span> {e.user_agent}
                            </div>
                          )}
                          {e.stack && (
                            <div>
                              <p className="font-medium">Stack:</p>
                              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
                                {e.stack}
                              </pre>
                            </div>
                          )}
                          {e.component_stack && (
                            <div>
                              <p className="font-medium">Component stack:</p>
                              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
                                {e.component_stack}
                              </pre>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
