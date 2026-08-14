import { describe, expect, it } from "vitest";
import { realInstantToWallClockContainer } from "./timezone";

describe("realInstantToWallClockContainer", () => {
  it("converts a winter (PST, UTC-8) instant to the LA wall-clock container", () => {
    const instant = new Date("2026-01-15T20:30:00.000Z");
    const container = realInstantToWallClockContainer(instant, "America/Los_Angeles");
    expect(container.toISOString()).toBe("2026-01-15T12:30:00.000Z");
  });

  it("converts a summer (PDT, UTC-7) instant to the LA wall-clock container, accounting for DST", () => {
    const instant = new Date("2026-07-15T20:30:00.000Z");
    const container = realInstantToWallClockContainer(instant, "America/Los_Angeles");
    expect(container.toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });

  it("rolls the wall-clock date forward across a UTC midnight boundary", () => {
    // 11:30 PM Eastern is 03:30 UTC the next day.
    const instant = new Date("2026-03-02T03:30:00.000Z");
    const container = realInstantToWallClockContainer(instant, "America/New_York");
    expect(container.toISOString()).toBe("2026-03-01T22:30:00.000Z");
  });
});
