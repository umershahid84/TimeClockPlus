export interface LineOfBusiness {
  id: number;
  code: string;
  name: string;
}

export interface Employee {
  id: number;
  employeeCode: string;
  dateOfHire: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  lineOfBusinessId: number;
  lineOfBusiness: LineOfBusiness;
  status: "ACTIVE" | "ARCHIVED" | "REMOVED";
  schedules?: EmployeeSchedule[];
}

export interface EmployeeSchedule {
  id: number;
  employeeId: number;
  employmentStatus: "FULL_TIME" | "PART_TIME";
  shiftStartTime: string;
  shiftEndTime: string;
  daysOff: string;
  effectiveDate: string;
  endDate: string | null;
  notes?: string | null;
}

export type AttendanceAdjustment = "NONE" | "TARDY" | "LEFT_EARLY" | "ARRIVED_LATE";
export type SupplementalTimeType = "NONE" | "SICK" | "PTO" | "FCA" | "FMLA" | "LWOP";
export type TimeType =
  | "REGULAR_SHIFT"
  | "SICK"
  | "FCA"
  | "FMLA"
  | "NO_CALL_NO_SHOW"
  | "BEREAVEMENT"
  | "LWOP"
  | "PTO"
  | "PERSONAL_HOLIDAY"
  | "HOLIDAY"
  | "JURY_DUTY"
  | "MATERNITY"
  | "PATERNITY"
  | "MILITARY"
  | "OTHERS";

export interface TimesheetEntry {
  id: number;
  timesheetId: number;
  workDate: string;
  scheduledClockIn: string | null;
  scheduledClockOut: string | null;
  clockIn: string;
  clockOut: string;
  unpaidBreakMins: number;
  regularHours: number;
  otHours: number;
  decimalHours: number;
  attendanceAdjustment: AttendanceAdjustment;
  supplementalType: SupplementalTimeType;
  supplementalHours: number;
  timeType: TimeType;
  notes: string | null;
}

export interface PayPeriodTotals {
  regularHours: number;
  otHours: number;
  supplementalHours: number;
  totalWorked: number;
  totalCredited: number;
}

export interface PayPeriodTimesheet {
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  timesheetId: number | null;
  status: "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED";
  entries: TimesheetEntry[];
  totals: PayPeriodTotals;
}

export interface RosterRow {
  employee: Employee;
  schedule: EmployeeSchedule;
  entry: TimesheetEntry | null;
}
