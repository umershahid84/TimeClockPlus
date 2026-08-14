import { describe, expect, it } from "vitest";
import { deriveState, sumBreakMinutes } from "./kiosk";

type FakeEvent = { type: "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT"; timestamp: Date };

function ev(type: FakeEvent["type"], isoMinutesFromMidnight: number): FakeEvent {
  return { type, timestamp: new Date(2026, 0, 1, 0, isoMinutesFromMidnight) };
}

describe("deriveState", () => {
  it("is CLOCKED_OUT when there are no events in the open session", () => {
    expect(deriveState([])).toBe("CLOCKED_OUT");
  });

  it("is CLOCKED_IN right after a CLOCK_IN", () => {
    expect(deriveState([ev("CLOCK_IN", 0)])).toBe("CLOCKED_IN");
  });

  it("is ON_BREAK right after a BREAK_START", () => {
    expect(deriveState([ev("CLOCK_IN", 0), ev("BREAK_START", 120)])).toBe("ON_BREAK");
  });

  it("returns to CLOCKED_IN after a BREAK_END", () => {
    expect(deriveState([ev("CLOCK_IN", 0), ev("BREAK_START", 120), ev("BREAK_END", 150)])).toBe("CLOCKED_IN");
  });
});

describe("sumBreakMinutes", () => {
  it("sums a single paired break", () => {
    const events = [ev("CLOCK_IN", 0), ev("BREAK_START", 120), ev("BREAK_END", 150)];
    expect(sumBreakMinutes(events)).toBe(30);
  });

  it("sums multiple paired breaks in one session", () => {
    const events = [
      ev("CLOCK_IN", 0),
      ev("BREAK_START", 60),
      ev("BREAK_END", 75), // 15 min
      ev("BREAK_START", 240),
      ev("BREAK_END", 270), // 30 min
    ];
    expect(sumBreakMinutes(events)).toBe(45);
  });

  it("ignores a break that was never ended (still in progress)", () => {
    const events = [ev("CLOCK_IN", 0), ev("BREAK_START", 60), ev("BREAK_END", 75), ev("BREAK_START", 200)];
    expect(sumBreakMinutes(events)).toBe(15);
  });

  it("is zero when no breaks were taken", () => {
    expect(sumBreakMinutes([ev("CLOCK_IN", 0)])).toBe(0);
  });
});
