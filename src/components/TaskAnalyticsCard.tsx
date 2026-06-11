import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

type GroupMode = "unit" | "status" | "priority";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const UNIT_COLORS: Record<string, string> = {
  Planning: "hsl(var(--primary))",
  Research: "hsl(var(--chart-2, 173 58% 39%))",
  Statistics: "hsl(var(--chart-3, 12 76% 61%))",
  "M&E": "hsl(var(--chart-4, 43 74% 49%))",
};
const STATUS_COLORS: Record<string, string> = {
  "Not Started": "hsl(var(--muted-foreground))",
  "In Progress": "hsl(var(--primary))",
  Completed: "hsl(142 71% 45%)",
  Blocked: "hsl(var(--destructive))",
};
const PRIORITY_COLORS: Record<string, string> = {
  Low: "hsl(142 71% 45%)",
  Medium: "hsl(43 74% 49%)",
  "Urgent/High": "hsl(var(--destructive))",
  High: "hsl(var(--destructive))",
  Critical: "hsl(var(--destructive))",
};

interface TaskRow {
  date_assigned: string;
  unit: string;
  status: string;
  priority: string;
}

export default function TaskAnalyticsCard() {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [groupBy, setGroupBy] = useState<GroupMode>("unit");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("tasks")
        .select("date_assigned, unit, status, priority");
      if (!active) return;
      if (err) setError(err.message);
      else setRows((data ?? []) as TaskRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const r of rows) {
      if (r.date_assigned) years.add(Number(r.date_assigned.slice(0, 4)));
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [rows]);

  const { chartData, keys, colorMap, total } = useMemo(() => {
    const filtered = rows.filter((r) => r.date_assigned?.startsWith(String(year)));
    const keySet = new Set<string>();
    const buckets: Record<number, Record<string, number>> = {};
    for (let m = 0; m < 12; m++) buckets[m] = {};

    for (const r of filtered) {
      const monthIdx = Number(r.date_assigned.slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const key = String(
        groupBy === "unit" ? r.unit : groupBy === "status" ? r.status : r.priority,
      ) || "Unknown";
      keySet.add(key);
      buckets[monthIdx][key] = (buckets[monthIdx][key] ?? 0) + 1;
    }

    const colorMap =
      groupBy === "unit" ? UNIT_COLORS : groupBy === "status" ? STATUS_COLORS : PRIORITY_COLORS;
    const keys = Array.from(keySet).sort();
    const chartData = MONTH_LABELS.map((label, idx) => {
      const row: Record<string, string | number> = { month: label };
      let monthTotal = 0;
      for (const k of keys) {
        const v = buckets[idx][k] ?? 0;
        row[k] = v;
        monthTotal += v;
      }
      row.total = monthTotal;
      return row;
    });

    return { chartData, keys, colorMap, total: filtered.length };
  }, [rows, year, groupBy]);

  const peak = useMemo(() => {
    let best = { month: "—", value: 0 };
    for (const d of chartData) {
      const t = Number(d.total) || 0;
      if (t > best.value) best = { month: String(d.month), value: t };
    }
    return best;
  }, [chartData]);

  const handleExport = () => {
    const headers = ["Month", ...keys, "Total"];
    const lines = [headers.join(",")];
    for (const row of chartData) {
      const values = headers.map((h) => {
        const v = row[h];
        if (v === undefined || v === null) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });
      lines.push(values.join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-analytics-${year}-${groupBy}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPng = async () => {
    const container = chartRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    // Inline computed styles so text/colors render in the raster
    const inlineStyles = (src: Element, dst: Element) => {
      const cs = window.getComputedStyle(src);
      const props = ["fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight", "opacity", "color"];
      let style = "";
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (v) style += `${p}:${v};`;
      }
      (dst as HTMLElement).setAttribute("style", style);
      const srcChildren = src.children;
      const dstChildren = dst.children;
      for (let i = 0; i < srcChildren.length; i++) {
        inlineStyles(srcChildren[i], dstChildren[i]);
      }
    };
    inlineStyles(svg, clone);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = svgUrl;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(svgUrl);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `task-analytics-${year}-${groupBy}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span>Yearly Task Analytics</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupMode)}>
              <TabsList>
                <TabsTrigger value="unit">Unit</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
                <TabsTrigger value="priority">Priority</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={loading || chartData.length === 0}>
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPng} disabled={loading || chartData.length === 0}>
              Export PNG
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          {loading
            ? "Loading…"
            : `${total} task${total === 1 ? "" : "s"} in ${year} · peak month: ${peak.month} (${peak.value})`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="h-72 w-full" ref={chartRef}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((k) => (
                <Bar
                  key={k}
                  dataKey={k}
                  stackId="a"
                  fill={colorMap[k] ?? "hsl(var(--primary))"}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
