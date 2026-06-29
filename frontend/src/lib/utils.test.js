import { describe, it, expect } from "vitest";
import { formatDateBR, toDateInput } from "./utils";

describe("formatDateBR", () => {
  it("formats an ISO date-only string without timezone shift", () => {
    expect(formatDateBR("2026-06-30")).toBe("30/06/2026");
  });

  it("uses the calendar date from a UTC datetime, not the local-shifted day", () => {
    // A API devolve datetime com fuso (timestamptz). new Date() converteria
    // 30/06 00:00Z para 29/06 em UTC-3 — o helper deve preservar o dia 30.
    expect(formatDateBR("2026-06-30T00:00:00+00:00")).toBe("30/06/2026");
    expect(formatDateBR("2026-06-30T00:00:00Z")).toBe("30/06/2026");
  });

  it("returns empty string for nullish input", () => {
    expect(formatDateBR(null)).toBe("");
    expect(formatDateBR(undefined)).toBe("");
  });
});

describe("toDateInput", () => {
  it("extracts the calendar date part for a date input", () => {
    expect(toDateInput("2026-06-30T00:00:00+00:00")).toBe("2026-06-30");
  });

  it("returns empty string for nullish input", () => {
    expect(toDateInput(null)).toBe("");
  });
});
