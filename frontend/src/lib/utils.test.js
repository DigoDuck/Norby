import { describe, it, expect } from "vitest";
import { formatDateBR, toDateInput, parseDateOnly } from "./utils";

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

describe("parseDateOnly", () => {
  it("builds a LOCAL date from a date-only string, without UTC shift", () => {
    // new Date("2026-07-01") seria meia-noite UTC → em UTC-3 cairia em 30/06
    // (mês 5). O helper deve devolver 01/07 (mês 6) em horário LOCAL, seja
    // qual for o fuso da máquina que roda o teste.
    const d = parseDateOnly("2026-07-01");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julho (0-indexado)
    expect(d.getDate()).toBe(1);
  });

  it("ignores a datetime suffix and uses only the calendar date", () => {
    const d = parseDateOnly("2026-07-01T00:00:00Z");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(1);
  });

  it("returns null for nullish input", () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
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
