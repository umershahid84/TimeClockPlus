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

export interface TimesheetEntry {
  id?: number;
  workDate: string;
  clockIn: string;
  clockOut: string;
  unpaidBreakMins: number;
  decimalHours?: number;
  notes?: string;
}

export interface Timesheet {
  id?: number;
  employeeId: number;
  periodStart: string;
  periodEnd: string;
  status: "OPEN" | "SUBMITTED" | "APPROVED" | "REJECTED";
  entries: TimesheetEntry[];
  totalHours: number;
}
