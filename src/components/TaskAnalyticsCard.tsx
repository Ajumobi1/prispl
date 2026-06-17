import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type GroupMode = "unit" | "status" | "priority";
type ChartType = "stacked" | "line" | "percent" | "donut";

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
};

interface TaskRow {
  date_assigned: string;
  due_date: string | null;
  updated_at: string | null;
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
  const [chartType, setChartType] = useState<ChartType>("stacked");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("tasks")
        .select("date_assigned, due_date, updated_at, unit, status, priority");
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

  const kpis = useMemo(() => {
    const yearRows = rows.filter((r) => r.date_assigned?.startsWith(String(year)));
    const total = yearRows.length;
    const completed = yearRows.filter((r) => r.status === "Completed").length;
    const blocked = yearRows.filter((r) => r.status === "Blocked").length;
    const today = new Date().toISOString().slice(0, 10);
    const overdue = yearRows.filter(
      (r) => r.status !== "Completed" && r.due_date && r.due_date < today,
    ).length;
    let durSum = 0;
    let durCount = 0;
    for (const r of yearRows) {
      if (r.status === "Completed" && r.updated_at && r.date_assigned) {
        const start = new Date(r.date_assigned).getTime();
        const end = new Date(r.updated_at).getTime();
        if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
          durSum += (end - start) / 86_400_000;
          durCount += 1;
        }
      }
    }
    const avgDays = durCount > 0 ? durSum / durCount : null;
    const completedPct = total > 0 ? (completed / total) * 100 : 0;
    return { total, completed, completedPct, blocked, overdue, avgDays };
  }, [rows, year]);

  const percentData = useMemo(() => {
    return chartData.map((row) => {
      const total = Number(row.total) || 0;
      const next: Record<string, string | number> = { month: row.month };
      for (const k of keys) {
        const v = Number(row[k]) || 0;
        next[k] = total > 0 ? Number(((v / total) * 100).toFixed(1)) : 0;
      }
      next.total = total;
      return next;
    });
  }, [chartData, keys]);

  const donutData = useMemo(() => {
    return keys
      .map((k) => {
        let sum = 0;
        for (const row of chartData) sum += Number(row[k]) || 0;
        return { name: k, value: sum };
      })
      .filter((d) => d.value > 0);
  }, [chartData, keys]);

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

  const renderPngBlob = async (): Promise<Blob | null> => {
    const container = chartRef.current;
    if (!container) return null;
    const svg = container.querySelector("svg");
    if (!svg) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const chartW = Math.ceil(rect.width);
    const chartH = Math.ceil(rect.height);
    clone.setAttribute("width", String(chartW));
    clone.setAttribute("height", String(chartH));
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

    // Layout: title, [y-axis title][chart], legend, x-axis title
    const scale = 2;
    const padding = 16;
    const titleH = 28;
    const yAxisTitleW = 20;
    const xAxisTitleH = 22;

    // Measure legend wrapping
    const legendFont = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    const titleFont = "bold 16px system-ui, -apple-system, Segoe UI, sans-serif";
    const axisTitleFont = "italic 12px system-ui, -apple-system, Segoe UI, sans-serif";
    const swatch = 12;
    const itemGap = 16;
    const rowH = 20;

    const totalW = chartW + yAxisTitleW + padding * 2;
    // First pass to compute legend height
    const measureCanvas = document.createElement("canvas");
    const mctx = measureCanvas.getContext("2d")!;
    mctx.font = legendFont;
    const availW = totalW - padding * 2;
    let curX = 0;
    let rows = 1;
    for (const k of keys) {
      const w = swatch + 6 + mctx.measureText(k).width + itemGap;
      if (curX + w > availW && curX > 0) {
        rows += 1;
        curX = 0;
      }
      curX += w;
    }
    const legendH = keys.length ? rows * rowH + 8 : 0;

    const totalH = padding + titleH + chartH + legendH + xAxisTitleH + padding;

    const canvas = document.createElement("canvas");
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      return null;
    }
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalW, totalH);

    // Title
    ctx.fillStyle = "#111827";
    ctx.font = titleFont;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(
      `Yearly Task Analytics — ${year} (by ${groupBy})`,
      padding,
      padding,
    );

    // Y-axis title (rotated)
    ctx.save();
    ctx.fillStyle = "#374151";
    ctx.font = axisTitleFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.translate(padding, padding + titleH + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Number of tasks", 0, 0);
    ctx.restore();

    // Chart
    ctx.drawImage(img, padding + yAxisTitleW, padding + titleH, chartW, chartH);
    URL.revokeObjectURL(svgUrl);

    // X-axis title
    ctx.fillStyle = "#374151";
    ctx.font = axisTitleFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      "Month",
      padding + yAxisTitleW + chartW / 2,
      padding + titleH + chartH + legendH + 2,
    );

    // Resolve CSS-variable colors (e.g. "hsl(var(--primary))") to concrete RGB
    const colorProbe = document.createElement("div");
    colorProbe.style.position = "absolute";
    colorProbe.style.visibility = "hidden";
    colorProbe.style.pointerEvents = "none";
    document.body.appendChild(colorProbe);
    const resolveColor = (c: string | undefined): string => {
      if (!c) return "#3b82f6";
      colorProbe.style.color = "";
      colorProbe.style.color = c;
      const resolved = window.getComputedStyle(colorProbe).color;
      return resolved && resolved !== "" ? resolved : "#3b82f6";
    };

    // Legend
    ctx.font = legendFont;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let lx = padding;
    let ly = padding + titleH + chartH + 8;
    for (const k of keys) {
      const labelW = ctx.measureText(k).width;
      const itemW = swatch + 6 + labelW + itemGap;
      if (lx + itemW > totalW - padding && lx > padding) {
        lx = padding;
        ly += rowH;
      }
      ctx.fillStyle = resolveColor(colorMap[k]);
      ctx.fillRect(lx, ly + rowH / 2 - swatch / 2, swatch, swatch);
      ctx.fillStyle = "#111827";
      ctx.fillText(k, lx + swatch + 6, ly + rowH / 2);
      lx += itemW;
    }
    document.body.removeChild(colorProbe);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    return blob;
  };

  const handlePreviewPng = async () => {
    setPreviewBusy(true);
    try {
      const blob = await renderPngBlob();
      if (!blob) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleConfirmDownload = () => {
    if (!previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-analytics-${year}-${groupBy}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    closePreview();
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
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
            <Tabs value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
              <TabsList>
                <TabsTrigger value="stacked">Stacked</TabsTrigger>
                <TabsTrigger value="line">Line</TabsTrigger>
                <TabsTrigger value="percent">100%</TabsTrigger>
                <TabsTrigger value="donut">Donut</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={loading || chartData.length === 0}>
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePreviewPng}
              disabled={loading || chartData.length === 0 || previewBusy}
            >
              {previewBusy ? "Preparing…" : "Export PNG"}
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

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Total tasks", value: kpis.total.toLocaleString() },
            {
              label: "Completed",
              value: `${kpis.completed.toLocaleString()} (${kpis.completedPct.toFixed(0)}%)`,
            },
            {
              label: "Overdue",
              value: kpis.overdue.toLocaleString(),
              tone: kpis.overdue > 0 ? "text-destructive" : "",
            },
            {
              label: "Blocked",
              value: kpis.blocked.toLocaleString(),
              tone: kpis.blocked > 0 ? "text-destructive" : "",
            },
            {
              label: "Avg time to complete",
              value: kpis.avgDays == null ? "—" : `${kpis.avgDays.toFixed(1)}d`,
            },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-lg border bg-card/50 p-3"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div className={`mt-1 text-lg font-semibold ${k.tone ?? ""}`}>
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {!loading && chartData.every((d) => Number(d.total) === 0) ? (
          <div className="flex h-72 w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            No tasks recorded for {year}.
          </div>
        ) : (
        <div
          className="h-72 w-full"
          ref={chartRef}
          role="img"
          aria-label={`Yearly task analytics for ${year} grouped by ${groupBy}, shown as ${chartType} chart`}
        >
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "donut" ? (
              <PieChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {donutData.map((d) => (
                    <Cell key={d.name} fill={colorMap[d.name] ?? "hsl(var(--primary))"} />
                  ))}
                </Pie>
              </PieChart>
            ) : chartType === "line" ? (
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={colorMap[k] ?? "hsl(var(--primary))"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            ) : (
              <BarChart
                data={chartType === "percent" ? percentData : chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                stackOffset={chartType === "percent" ? "expand" : undefined}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={
                    chartType === "percent"
                      ? (v: number) => `${Math.round(v * 100)}%`
                      : undefined
                  }
                  domain={chartType === "percent" ? [0, 1] : undefined}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={
                    chartType === "percent"
                      ? (value: number) => `${value}%`
                      : undefined
                  }
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
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>

      <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>PNG export preview</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded border bg-muted/30 p-2">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Task analytics PNG preview"
                className="mx-auto h-auto w-full"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePreview}>Cancel</Button>
            <Button onClick={handleConfirmDownload}>Download PNG</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
