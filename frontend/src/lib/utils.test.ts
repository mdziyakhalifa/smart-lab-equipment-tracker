import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatCurrency,
  humanize,
  percent,
  todayInput,
  addDaysInput,
} from "@/lib/utils";

describe("formatDate", () => {
  it("formats a full ISO timestamp", () => {
    expect(formatDate("2026-03-15T09:00:00Z")).toBe("Mar 15, 2026");
  });
  it("formats a date-only string", () => {
    expect(formatDate("2026-03-15")).toBe("Mar 15, 2026");
  });
  it("returns fallback for null", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate(null, "n/a")).toBe("n/a");
  });
  it("returns fallback for invalid", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("formats a datetime", () => {
    expect(formatDateTime("2026-03-15T09:30:00Z")).toMatch(/Mar 15, 2026/);
  });
  it("returns fallback for empty", () => {
    expect(formatDateTime("")).toBe("—");
  });
});

describe("formatTime", () => {
  it("converts 24h to 12h", () => {
    expect(formatTime("14:00")).toMatch(/2:00 PM/);
  });
  it("returns fallback for empty", () => {
    expect(formatTime("")).toBe("—");
  });
});

describe("formatCurrency", () => {
  it("formats USD", () => {
    expect(formatCurrency(1250.5)).toBe("$1,250.50");
  });
  it("returns dash for null", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
  });
});

describe("humanize", () => {
  it("capitalizes and replaces underscores", () => {
    expect(humanize("return_requested")).toBe("Return Requested");
    expect(humanize("low_stock")).toBe("Low Stock");
  });
  it("returns dash for empty", () => {
    expect(humanize("")).toBe("—");
    expect(humanize(null)).toBe("—");
  });
});

describe("percent", () => {
  it("computes percentage", () => {
    expect(percent(3, 10)).toBe(30);
    expect(percent(0, 10)).toBe(0);
    expect(percent(10, 10)).toBe(100);
  });
  it("clamps and guards zero total", () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(150, 100)).toBe(100);
  });
});

describe("todayInput / addDaysInput", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayInput()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("adds days", () => {
    const future = addDaysInput(7);
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(future).toBe(expected.toISOString().slice(0, 10));
  });
});
