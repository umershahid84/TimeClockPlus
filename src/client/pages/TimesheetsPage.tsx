import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AttendanceAdjustment, Employee, PayPeriodTimesheet, SupplementalTimeType, TimeType, TimesheetEntry } from "../api/types";
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

export function TimesheetsPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState<PayPeriodTimesheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addDayDate, setAddDayDate] = useState(new Date().toISOString().slice(0, 10));
  const [editingEntry, setEditingEntry] = useState<TimesheetEntry | null>(null);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((emp) => {
      setEmployees(emp);
      if (emp.length > 0) setEmployeeId(String(emp[0].id));
    });
  }, []);

  async function load() {
    if (!employeeId) return;
    setError(null);
    const data = await api.get<PayPeriodTimesheet>(`/timesheets/employee/${employeeId}/pay-period?date=${anchorDate}`);
    setPeriod(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, anchorDate]);

  function navigate(direction: 1 | -1) {
    if (!period) return;
    setAnchorDate(shiftDate(period.periodStart, direction * 14));
  }

  async function addDay() {
    setError(null);
    try {
      const entry = await api.post<TimesheetEntry & { hasSchedule: boolean }>(`/timesheets/employee/${employeeId}/entries`, {
        workDate: addDayDate,
      });
      await load();
      setEditingEntry(entry);
      if (!entry.hasSchedule) {
        setError("No schedule was found for this employee on this date - enter the actual time worked manually below.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add day.");
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
      <h2>Timesheets</h2>
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
              <button className="btn" onClick={addDay}>Add Day</button>
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

      {editingEntry && (
        <AddDayEditor
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={async () => {
            setEditingEntry(null);
            await load();
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
