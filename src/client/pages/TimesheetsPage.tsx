import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import {
  AttendanceAdjustment,
  Employee,
  LineOfBusiness,
  PayPeriodTimesheet,
  RosterRow,
  SupplementalTimeType,
  TimeType,
  TimesheetEntry,
} from "../api/types";
import { formatDate, formatTime, toDateInputValue, toTimeInputValue } from "../utils/time";
import { useAuth } from "../context/AuthContext";

const ATTENDANCE_OPTIONS: { value: AttendanceAdjustment; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "TARDY", label: "Tardy" },
  { value: "LEFT_EARLY", label: "Left Early" },
  { value: "ARRIVED_LATE", label: "Arrived Late" },
];

const SUPPLEMENTAL_OPTIONS: { value: SupplementalTimeType; label: string }[] = [
  { value: "NONE", label: "None" },
  { value: "SICK", label: "Sick" },
  { value: "PTO", label: "PTO" },
  { value: "FCA", label: "FCA" },
  { value: "FMLA", label: "FMLA" },
  { value: "LWOP", label: "LWOP" },
];

const TIME_TYPE_OPTIONS: { value: TimeType; label: string }[] = [
  { value: "REGULAR_SHIFT", label: "Regular Shift" },
  { value: "SICK", label: "Sick" },
  { value: "FCA", label: "FCA" },
  { value: "FMLA", label: "FMLA" },
  { value: "NO_CALL_NO_SHOW", label: "No Call - No Show" },
  { value: "BEREAVEMENT", label: "Bereavement" },
  { value: "LWOP", label: "LWOP" },
  { value: "PTO", label: "PTO" },
  { value: "PERSONAL_HOLIDAY", label: "Personal Holiday" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "JURY_DUTY", label: "Jury Duty" },
  { value: "MATERNITY", label: "Maternity" },
  { value: "PATERNITY", label: "Paternity" },
  { value: "MILITARY", label: "Military" },
  { value: "OTHERS", label: "Others" },
];

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimesheetsPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"roster" | "period">("roster");

  // --- Daily Roster ---
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [rosterDate, setRosterDate] = useState(today());
  const [rosterLineOfBusinessId, setRosterLineOfBusinessId] = useState("");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // --- Employee Pay Period ---
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [anchorDate, setAnchorDate] = useState(today());
  const [period, setPeriod] = useState<PayPeriodTimesheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addDayDate, setAddDayDate] = useState(today());
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((emp) => {
      setEmployees(emp);
      if (emp.length > 0 && !employeeId) setEmployeeId(String(emp[0].id));
    });
    api.get<LineOfBusiness[]>("/lines-of-business").then(setLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRoster() {
    setRosterError(null);
    const params = new URLSearchParams({ date: rosterDate });
    if (rosterLineOfBusinessId) params.set("lineOfBusinessId", rosterLineOfBusinessId);
    const rows = await api.get<RosterRow[]>(`/timesheets/roster?${params.toString()}`);
    setRoster(rows);
  }

  useEffect(() => {
    if (mode === "roster") loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rosterDate, rosterLineOfBusinessId]);

  async function load() {
    if (!employeeId) return;
    setError(null);
    const data = await api.get<PayPeriodTimesheet>(`/timesheets/employee/${employeeId}/pay-period?date=${anchorDate}`);
    setPeriod(data);
  }

  useEffect(() => {
    if (mode === "period") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, employeeId, anchorDate]);

  function navigate(direction: 1 | -1) {
    if (!period) return;
    setAnchorDate(shiftDate(period.periodStart, direction * 14));
  }

  async function addDay(empId: string, workDate: string) {
    const entry = await api.post<TimesheetEntry & { hasSchedule: boolean }>(`/timesheets/employee/${empId}/entries`, {
      workDate,
    });
    return entry;
  }

  async function handleAddDay() {
    setError(null);
    try {
      const entry = await addDay(employeeId, addDayDate);
      await load();
      setEditingEntry(entry);
      if (!entry.hasSchedule) {
        setError("No schedule was found for this employee on this date - enter the actual time worked manually below.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add day.");
    }
  }

  // Jump from the Daily Roster straight into adding/editing that
  // employee's entry for the selected date, without hunting through their
  // pay period by hand. Uses row.employee.id directly (not the employeeId
  // state var, which wouldn't have updated yet within this same handler).
  async function openRosterRow(row: RosterRow) {
    setRosterError(null);
    setMode("period");
    setEmployeeId(String(row.employee.id));
    setAnchorDate(rosterDate);
    try {
      if (row.entry) {
        setEditingEntry(row.entry);
      } else {
        const entry = await addDay(String(row.employee.id), rosterDate);
        setEditingEntry(entry);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to open timesheet entry.");
    }
  }

  async function deleteEntry(id: number) {
    if (!confirm("Remove this day from the timesheet?")) return;
    await api.delete(`/timesheets/entries/${id}`);
    await load();
  }

  async function submitTimesheet() {
    if (!period?.timesheetId) return;
    await api.post(`/timesheets/${period.timesheetId}/submit`);
    await load();
  }

  async function approveTimesheet() {
    if (!period?.timesheetId) return;
    await api.post(`/timesheets/${period.timesheetId}/approve`);
    await load();
  }

  const canEdit = period?.status !== "APPROVED";

  return (
    <div>
      <div className="topbar">
        <h2>Timesheets</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className={`btn ${mode === "roster" ? "" : "secondary"}`} onClick={() => setMode("roster")}>Daily Roster</button>
          <button className={`btn ${mode === "period" ? "" : "secondary"}`} onClick={() => setMode("period")}>Employee Pay Period</button>
        </div>
      </div>

      {mode === "roster" && (
        <div>
          <div className="card grid grid-4">
            <div className="field">
              <label>Date</label>
              <input type="date" value={rosterDate} onChange={(e) => setRosterDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Line of Business</label>
              <select value={rosterLineOfBusinessId} onChange={(e) => setRosterLineOfBusinessId(e.target.value)}>
                <option value="">All authorized</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          {rosterError && <p className="error-text">{rosterError}</p>}

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th><th>Name</th><th>Line of Business</th><th>Scheduled</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {roster.map((row) => (
                  <tr key={row.employee.id}>
                    <td>{row.employee.employeeCode}</td>
                    <td>{row.employee.firstName} {row.employee.lastName}</td>
                    <td>{row.employee.lineOfBusiness?.name}</td>
                    <td>{row.schedule.shiftStartTime} - {row.schedule.shiftEndTime}</td>
                    <td>
                      {row.entry ? (
                        <span className="badge">Regular {row.entry.regularHours.toFixed(2)}{row.entry.otHours > 0 ? ` / OT ${row.entry.otHours.toFixed(2)}` : ""}</span>
                      ) : (
                        <span className="muted">Not entered</span>
                      )}
                    </td>
                    <td>
                      <button className="btn secondary" onClick={() => openRosterRow(row)}>
                        {row.entry ? "Edit Entry" : "Add Entry"}
                      </button>
                    </td>
                  </tr>
                ))}
                {roster.length === 0 && (
                  <tr><td colSpan={6} className="muted">No employees are scheduled to work on this date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === "period" && (
        <div>
          <div className="card grid grid-4">
            <div className="field">
              <label>Employee</label>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
                ))}
              </select>
            </div>
          </div>

          {period && (
            <div className="card">
              <div className="topbar">
                <div>
                  <div className="muted">Pay Period</div>
                  <h3 style={{ margin: "0.2rem 0" }}>{formatDate(period.periodStart)} &ndash; {formatDate(period.periodEnd)}</h3>
                  <span className="badge">{period.status}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button className="btn secondary" onClick={() => navigate(-1)}>&larr; Previous Period</button>
                  <button className="btn secondary" onClick={() => navigate(1)}>Next Period &rarr;</button>
                  <button className="btn secondary" onClick={() => window.print()}>Print</button>
                </div>
              </div>

              {canEdit && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", margin: "1rem 0" }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Date</label>
                    <input
                      type="date"
                      value={addDayDate}
                      min={toDateInputValue(period.periodStart)}
                      max={toDateInputValue(period.periodEnd)}
                      onChange={(e) => setAddDayDate(e.target.value)}
                    />
                  </div>
                  <button className="btn" onClick={handleAddDay}>Add Day</button>
                </div>
              )}
              {error && <p className="error-text">{error}</p>}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th><th>Scheduled</th><th>Actual</th><th>Regular</th><th>OT</th>
                      <th>Attendance</th><th>Supplemental</th><th>Time Type</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.workDate)}</td>
                        <td>{entry.scheduledClockIn ? `${formatTime(entry.scheduledClockIn)} - ${formatTime(entry.scheduledClockOut)}` : "No schedule"}</td>
                        <td>{formatTime(entry.clockIn)} - {formatTime(entry.clockOut)}</td>
                        <td>{entry.regularHours.toFixed(2)}</td>
                        <td>{entry.otHours.toFixed(2)}</td>
                        <td>{ATTENDANCE_OPTIONS.find((o) => o.value === entry.attendanceAdjustment)?.label ?? "—"}</td>
                        <td>{entry.supplementalType !== "NONE" ? `${entry.supplementalType} ${entry.supplementalHours.toFixed(2)}` : "—"}</td>
                        <td>{TIME_TYPE_OPTIONS.find((o) => o.value === entry.timeType)?.label}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {canEdit && (
                            <>
                              <button className="btn secondary" onClick={() => setEditingEntry(entry)}>Edit</button>{" "}
                              <button className="btn danger" onClick={() => deleteEntry(entry.id)}>Remove</button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {period.entries.length === 0 && (
                      <tr><td colSpan={9} className="muted">No days added for this pay period yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-4" style={{ marginTop: "1rem" }}>
                <div><div className="muted">Regular</div><strong>{period.totals.regularHours.toFixed(2)}</strong></div>
                <div><div className="muted">OT</div><strong>{period.totals.otHours.toFixed(2)}</strong></div>
                <div><div className="muted">Supplemental</div><strong>{period.totals.supplementalHours.toFixed(2)}</strong></div>
                <div><div className="muted">Total Credited</div><strong>{period.totals.totalCredited.toFixed(2)}</strong></div>
              </div>

              <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                {period.status === "OPEN" && period.timesheetId && (
                  <button className="btn" onClick={submitTimesheet}>Submit Timesheet</button>
                )}
                {user?.isAdministrator && period.status === "SUBMITTED" && (
                  <button className="btn" onClick={approveTimesheet}>Approve Timesheet</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {editingEntry && (
        <AddDayEditor
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={async () => {
            setEditingEntry(null);
            await load();
            if (mode === "roster") await loadRoster();
          }}
        />
      )}
    </div>
  );
}

function AddDayEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: TimesheetEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clockInTime, setClockInTime] = useState(toTimeInputValue(entry.clockIn));
  const [clockOutTime, setClockOutTime] = useState(toTimeInputValue(entry.clockOut));
  const [unpaidBreakMins, setUnpaidBreakMins] = useState(entry.unpaidBreakMins);
  const [attendanceAdjustment, setAttendanceAdjustment] = useState<AttendanceAdjustment>(entry.attendanceAdjustment);
  const [supplementalType, setSupplementalType] = useState<SupplementalTimeType>(entry.supplementalType);
  const [supplementalHours, setSupplementalHours] = useState(entry.supplementalHours);
  const [timeType, setTimeType] = useState<TimeType>(entry.timeType);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState({ regularHours: entry.regularHours, otHours: entry.otHours, total: entry.decimalHours });

  async function save() {
    setError(null);
    try {
      const updated = await api.put<TimesheetEntry>(`/timesheets/entries/${entry.id}`, {
        clockInTime,
        clockOutTime,
        unpaidBreakMins,
        attendanceAdjustment,
        supplementalType,
        supplementalHours,
        timeType,
        notes,
      });
      setPreview({ regularHours: updated.regularHours, otHours: updated.otHours, total: updated.decimalHours });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Employee Timesheet &mdash; Add Day</h3>
      <p className="muted">Date: {formatDate(entry.workDate)}</p>

      <h4>Scheduled Shift</h4>
      <div className="grid grid-4">
        <div><div className="muted">Scheduled Clock In</div><strong>{entry.scheduledClockIn ? formatTime(entry.scheduledClockIn) : "—"}</strong></div>
        <div><div className="muted">Scheduled Clock Out</div><strong>{entry.scheduledClockOut ? formatTime(entry.scheduledClockOut) : "—"}</strong></div>
      </div>

      <h4>Actual Time</h4>
      <div className="grid grid-4">
        <div className="field">
          <label>Actual Clock In</label>
          <input type="time" value={clockInTime} onChange={(e) => setClockInTime(e.target.value)} />
        </div>
        <div className="field">
          <label>Actual Clock Out</label>
          <input type="time" value={clockOutTime} onChange={(e) => setClockOutTime(e.target.value)} />
        </div>
        <div className="field">
          <label>Unpaid Break (minutes)</label>
          <input type="number" min={0} value={unpaidBreakMins} onChange={(e) => setUnpaidBreakMins(Number(e.target.value))} />
        </div>
      </div>
      <div className="grid grid-4">
        <div><div className="muted">Regular Hours</div><strong>{preview.regularHours.toFixed(2)}</strong></div>
        <div><div className="muted">OT Hours</div><strong>{preview.otHours.toFixed(2)}</strong></div>
        <div><div className="muted">Total Worked</div><strong>{preview.total.toFixed(2)}</strong></div>
      </div>

      <h4>Attendance</h4>
      <div className="field">
        <label>Attendance Adjustment</label>
        <select value={attendanceAdjustment} onChange={(e) => setAttendanceAdjustment(e.target.value as AttendanceAdjustment)}>
          {ATTENDANCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <h4>Supplemental Time</h4>
      <div className="grid grid-4">
        <div className="field">
          <label>Supplemental Type</label>
          <select value={supplementalType} onChange={(e) => setSupplementalType(e.target.value as SupplementalTimeType)}>
            {SUPPLEMENTAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Supplemental Hours</label>
          <input type="number" min={0} step={0.25} value={supplementalHours} onChange={(e) => setSupplementalHours(Number(e.target.value))} />
        </div>
      </div>

      <h4>Time Classification</h4>
      <div className="field">
        <label>Time Type</label>
        <select value={timeType} onChange={(e) => setTimeType(e.target.value as TimeType)}>
          {TIME_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn secondary" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
