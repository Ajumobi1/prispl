import { describe, it, expect } from "vitest";
import { safeSheetName } from "@/lib/exports";

describe("safeSheetName", () => {
  it("strips characters Excel forbids in sheet names", () => {
    expect(safeSheetName("Sales/2024")).toBe("Sales_2024");
    expect(safeSheetName("Q1:Report*")).toBe("Q1_Report_");
    expect(safeSheetName("[Draft]?")).toBe("_Draft__");
  });

  it("truncates to 31 characters (Excel's hard limit)", () => {
    const long = "A".repeat(60);
    expect(safeSheetName(long)).toHaveLength(31);
  });

  it("leaves safe names untouched", () => {
    expect(safeSheetName("January 2025")).toBe("January 2025");
  });
});
