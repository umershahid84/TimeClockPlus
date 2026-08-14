import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ClockEvent } from "@prisma/client";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { recordAudit } from "../services/audit";
import { resolveScheduleForDate } from "./schedules";
import { calculateDecimalHours, resolveShiftTimes, splitRegularAndOvertime } from "../utils/time";
import { getPayPeriodForDate } from "../utils/payPeriod";
import { realInstantToWallClockContainer } from "../utils/timezone";

/**
 * Public employee time clock ("kiosk"): a walk-up terminal where an
 * employee types their Employee ID and clocks in/out or takes a break.
 * Deliberately unauthenticated (no password) to match how a physical
 * break-room kiosk works - the tradeoff is that anyone who knows or
 * guesses a valid Employee ID could punch on someone else's behalf. This
 * is mitigated (not eliminated) by rate limiting below and by every punch
 * being permanently logged with a real timestamp and visible to
 * supervisors/administrators via the timesheet and audit log - it is NOT
 * a substitute for physically securing the kiosk device/location.
 */
export const kioskRouter = Router();

const kioskLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment and try again." },
});
kioskRouter.use(kioskLimiter);

const employeeCodeSchema = z.object({ employeeCode: z.string().trim().min(1).max(50) });

type ClockState = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

/** The minimal shape deriveState/sumBreakMinutes/buildStatus actually need - narrower than the full Prisma ClockEvent row, so callers (and tests) don't have to fabricate id/employeeId/createdAt. */
type ClockEventLike = Pick<ClockEvent, "type" | "timestamp">;

/** All ClockEvents since the employee's most recent CLOCK_OUT (or all events, if they've never clocked out). */
async function getOpenSessionEvents(employeeId: number): Promise<ClockEvent[]> {
  const lastClockOut = await prisma.clockEvent.findFirst({
    where: { employeeId, type: "CLOCK_OUT" },
    orderBy: { timestamp: "desc" },
  });
  return prisma.clockEvent.findMany({
    where: { employeeId, ...(lastClockOut ? { timestamp: { gt: lastClockOut.timestamp } } : {}) },
    orderBy: { timestamp: "asc" },
  });
}

export function deriveState(events: ClockEventLike[]): ClockState {
  if (events.length === 0) return "CLOCKED_OUT";
  return events[events.length - 1].type === "BREAK_START" ? "ON_BREAK" : "CLOCKED_IN";
}

async function findActiveEmployee(employeeCode: string) {
  return prisma.employee.findUnique({
    where: { employeeCode },
    include: { lineOfBusiness: true },
  });
}

function buildStatus(employee: { id: number; employeeCode: string; firstName: string; lastName: string; lineOfBusiness: { name: string } }, events: ClockEventLike[]) {
  const state = deriveState(events);
  const clockIn = events.find((e) => e.type === "CLOCK_IN");
  const lastBreakStart = [...events].reverse().find((e) => e.type === "BREAK_START");
  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    lineOfBusiness: employee.lineOfBusiness.name,
    state,
    clockedInAt: state === "CLOCKED_OUT" ? null : clockIn?.timestamp ?? null,
    onBreakSinceAt: state === "ON_BREAK" ? lastBreakStart?.timestamp ?? null : null,
  };
}

kioskRouter.post("/lookup", asyncHandler(async (req, res) => {
  const parsed = employeeCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID is required" });

  const employee = await findActiveEmployee(parsed.data.employeeCode);
  if (!employee || employee.status !== "ACTIVE") {
    return res.status(404).json({ error: "Employee ID not found" });
  }

  const events = await getOpenSessionEvents(employee.id);
  res.json(buildStatus(employee, events));
}));

kioskRouter.post("/clock-in", asyncHandler(async (req, res) => {
  const parsed = employeeCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID is required" });
  const employee = await findActiveEmployee(parsed.data.employeeCode);
  if (!employee || employee.status !== "ACTIVE") return res.status(404).json({ error: "Employee ID not found" });

  const events = await getOpenSessionEvents(employee.id);
  if (deriveState(events) !== "CLOCKED_OUT") {
    return res.status(409).json({ error: "Already clocked in." });
  }

  const timestamp = new Date();
  const event = await prisma.clockEvent.create({ data: { employeeId: employee.id, type: "CLOCK_IN", timestamp } });
  await recordAudit({ actorUserId: null, action: "CREATE", entityType: "CLOCK_EVENT", entityId: event.id, employeeId: employee.id, newValue: { type: "CLOCK_IN", timestamp } });

  res.json(buildStatus(employee, [event]));
}));

kioskRouter.post("/break-start", asyncHandler(async (req, res) => {
  const parsed = employeeCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID is required" });
  const employee = await findActiveEmployee(parsed.data.employeeCode);
  if (!employee || employee.status !== "ACTIVE") return res.status(404).json({ error: "Employee ID not found" });

  const events = await getOpenSessionEvents(employee.id);
  if (deriveState(events) !== "CLOCKED_IN") {
    return res.status(409).json({ error: "You must be clocked in (and not already on break) to start a break." });
  }

  const timestamp = new Date();
  const event = await prisma.clockEvent.create({ data: { employeeId: employee.id, type: "BREAK_START", timestamp } });
  await recordAudit({ actorUserId: null, action: "CREATE", entityType: "CLOCK_EVENT", entityId: event.id, employeeId: employee.id, newValue: { type: "BREAK_START", timestamp } });

  res.json(buildStatus(employee, [...events, event]));
}));

kioskRouter.post("/break-end", asyncHandler(async (req, res) => {
  const parsed = employeeCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID is required" });
  const employee = await findActiveEmployee(parsed.data.employeeCode);
  if (!employee || employee.status !== "ACTIVE") return res.status(404).json({ error: "Employee ID not found" });

  const events = await getOpenSessionEvents(employee.id);
  if (deriveState(events) !== "ON_BREAK") {
    return res.status(409).json({ error: "You are not currently on break." });
  }

  const timestamp = new Date();
  const event = await prisma.clockEvent.create({ data: { employeeId: employee.id, type: "BREAK_END", timestamp } });
  await recordAudit({ actorUserId: null, action: "CREATE", entityType: "CLOCK_EVENT", entityId: event.id, employeeId: employee.id, newValue: { type: "BREAK_END", timestamp } });

  res.json(buildStatus(employee, [...events, event]));
}));

/** Total minutes spent on break across a session's paired BREAK_START/BREAK_END events. */
export function sumBreakMinutes(events: ClockEventLike[]): number {
  let totalMs = 0;
  let openBreakStart: Date | null = null;
  for (const event of events) {
    if (event.type === "BREAK_START") {
      openBreakStart = event.timestamp;
    } else if (event.type === "BREAK_END" && openBreakStart) {
      totalMs += event.timestamp.getTime() - openBreakStart.getTime();
      openBreakStart = null;
    }
  }
  return Math.round(totalMs / 60000);
}

kioskRouter.post("/clock-out", asyncHandler(async (req, res) => {
  const parsed = employeeCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID is required" });
  const employee = await findActiveEmployee(parsed.data.employeeCode);
  if (!employee || employee.status !== "ACTIVE") return res.status(404).json({ error: "Employee ID not found" });

  let events = await getOpenSessionEvents(employee.id);
  const state = deriveState(events);
  if (state === "CLOCKED_OUT") {
    return res.status(409).json({ error: "You are not currently clocked in." });
  }

  const now = new Date();

  // Clocking out while on break auto-ends the break at the same instant,
  // so the employee doesn't have to remember to press "End Break" first.
  if (state === "ON_BREAK") {
    const breakEnd = await prisma.clockEvent.create({ data: { employeeId: employee.id, type: "BREAK_END", timestamp: now } });
    await recordAudit({ actorUserId: null, action: "CREATE", entityType: "CLOCK_EVENT", entityId: breakEnd.id, employeeId: employee.id, newValue: { type: "BREAK_END", timestamp: now, autoEnded: true } });
    events = [...events, breakEnd];
  }

  const clockOutEvent = await prisma.clockEvent.create({ data: { employeeId: employee.id, type: "CLOCK_OUT", timestamp: now } });
  await recordAudit({ actorUserId: null, action: "CREATE", entityType: "CLOCK_EVENT", entityId: clockOutEvent.id, employeeId: employee.id, newValue: { type: "CLOCK_OUT", timestamp: now } });
  events = [...events, clockOutEvent];

  // Fold the completed session into the day's TimesheetEntry so it's
  // immediately visible to supervisors/administrators - this is the
  // "record automatically" half of the feature. The punch log above is
  // always saved regardless of what happens here.
  const sessionStart = events.find((e) => e.type === "CLOCK_IN")?.timestamp ?? now;
  const unpaidBreakMins = sumBreakMinutes(events);

  let clockInWall = realInstantToWallClockContainer(sessionStart);
  let clockOutWall = realInstantToWallClockContainer(now);
  if (clockOutWall.getTime() <= clockInWall.getTime()) {
    // Guards against the rare DST-transition edge case where converting
    // two real instants independently could make the wall-clock pair
    // appear to go backward - roll forward a day, same convention used
    // for overnight shifts elsewhere (see utils/time.ts resolveShiftTimes).
    clockOutWall = new Date(clockOutWall.getTime() + 24 * 60 * 60 * 1000);
  }
  const workDate = new Date(Date.UTC(clockInWall.getUTCFullYear(), clockInWall.getUTCMonth(), clockInWall.getUTCDate()));

  const schedule = await resolveScheduleForDate(employee.id, workDate);
  const scheduledShift = schedule ? resolveShiftTimes(workDate, schedule.shiftStartTime, schedule.shiftEndTime) : null;
  const scheduledHours = scheduledShift
    ? calculateDecimalHours(scheduledShift.start, scheduledShift.end, unpaidBreakMins)
    : null;
  const decimalHours = calculateDecimalHours(clockInWall, clockOutWall, unpaidBreakMins);
  const { regularHours, otHours } = splitRegularAndOvertime(decimalHours, scheduledHours);

  const { start: periodStart, end: periodEnd } = getPayPeriodForDate(workDate);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const timesheet = await tx.timesheet.upsert({
        where: { employeeId_periodStart_periodEnd: { employeeId: employee.id, periodStart, periodEnd } },
        update: {},
        create: { employeeId: employee.id, periodStart, periodEnd },
      });
      if (timesheet.status === "APPROVED") {
        throw new Error("APPROVED_LOCKED");
      }

      return tx.timesheetEntry.upsert({
        where: { timesheetId_workDate: { timesheetId: timesheet.id, workDate } },
        update: {
          clockIn: clockInWall,
          clockOut: clockOutWall,
          unpaidBreakMins,
          regularHours,
          otHours,
          decimalHours,
          source: "KIOSK",
        },
        create: {
          timesheetId: timesheet.id,
          workDate,
          scheduledClockIn: scheduledShift?.start ?? null,
          scheduledClockOut: scheduledShift?.end ?? null,
          clockIn: clockInWall,
          clockOut: clockOutWall,
          unpaidBreakMins,
          regularHours,
          otHours,
          decimalHours,
          source: "KIOSK",
        },
      });
    });

    await recordAudit({
      actorUserId: null,
      action: "UPDATE",
      entityType: "TIMESHEET_ENTRY",
      entityId: entry.id,
      employeeId: employee.id,
      newValue: { source: "KIOSK", clockIn: clockInWall, clockOut: clockOutWall, unpaidBreakMins, regularHours, otHours, decimalHours },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "APPROVED_LOCKED") {
      return res.status(200).json({
        ...buildStatus(employee, []),
        warning: "Your clock-out was recorded, but this pay period has already been approved and could not be updated automatically. Please see your supervisor.",
      });
    }
    throw err;
  }

  res.json(buildStatus(employee, []));
}));
