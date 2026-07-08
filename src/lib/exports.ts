import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PRSTask } from "./task-types";
import { fetchTasks } from "./api";

const HEADERS = [
  "S/N", "Unit", "Task", "Description", "Assignee",
  "Start Date", "End Date", "Status", "Priority",
  "Deliverable", "Checklist", "Remarks",
];

function toRow(t: PRSTask): (string | number)[] {
  return [
    t.serialNumber, t.unit, t.taskTitle, t.taskDescription, t.assignee,
    t.dateAssigned, t.dueDate, t.status, t.priority,
    t.deliverable, t.checklist, t.remarks,
  ];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function groupByMonth(tasks: PRSTask[]): Map<string, { label: string; tasks: PRSTask[] }> {
  const groups = new Map<string, { label: string; tasks: PRSTask[] }>();
  for (const t of tasks) {
    const date = t.dateAssigned ? new Date(t.dateAssigned) : null;
    let key = "Undated";
    let label = "Undated";
    if (date && !isNaN(date.getTime())) {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthName = date.toLocaleString("en-US", { month: "long" });
      label = `${monthName} ${date.getFullYear()}`;
    }
    if (!groups.has(key)) groups.set(key, { label, rows: [], tasks: [] } as any);
    groups.get(key)!.tasks.push(t);
  }
  return new Map([...groups.entries()].sort());
}

export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
}

export async function downloadTasks(format: "csv" | "xlsx" | "pdf", month?: string): Promise<void> {
  const allTasks = await fetchTasks();
  const tasks = month ? allTasks.filter((t) => t.dateAssigned.startsWith(month)) : allTasks;
  const today = new Date().toISOString().slice(0, 10);
  const suffix = month ? `-${month}` : "";
  const filename = `prs-task-tracker${suffix}-${today}`;
  const groups = groupByMonth(tasks);

  if (format === "csv") {
    const lines: string[] = [];
    for (const [, { label, tasks: monthTasks }] of groups) {
      lines.push(`# ${label}`);
      lines.push(HEADERS.join(","));
      for (const t of monthTasks) {
        lines.push(toRow(t).map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
      }
      lines.push("");
    }
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
    return;
  }

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    if (groups.size === 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS]), "Tasks");
    } else {
      for (const [, { label, tasks: monthTasks }] of groups) {
        const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...monthTasks.map(toRow)]);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label));
      }
    }
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    downloadBlob(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `${filename}.xlsx`
    );
    return;
  }

  // PDF
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  let firstPage = true;
  for (const [, { label, tasks: monthTasks }] of groups) {
    if (!firstPage) doc.addPage();
    firstPage = false;
    doc.setFontSize(14);
    doc.text(`PR&S Task Tracker — ${label}`, 40, 30);
    autoTable(doc, {
      head: [HEADERS],
      body: monthTasks.map((t) => toRow(t).map(String)),
      startY: 50,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [40, 60, 100] },
    });
  }
  if (firstPage) {
    doc.setFontSize(14);
    doc.text("PR&S Task Tracker — No tasks", 40, 30);
  }
  doc.save(`${filename}.pdf`);
}
