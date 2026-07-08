import { describe, it, expect } from "vitest";
import { statusColumns, type TaskStatus } from "@/lib/task-types";

describe("statusColumns", () => {
  it("contains all task statuses in the expected board order", () => {
    expect(statusColumns).toEqual<TaskStatus[]>([
      "Not Started",
      "In Progress",
      "Awaiting Review",
      "Completed",
      "Delayed",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(statusColumns).size).toBe(statusColumns.length);
  });
});
