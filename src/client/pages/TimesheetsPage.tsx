import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { Employee, Timesheet, TimesheetEntry } from "../api/types";

function biweeklyRange(anchor: Date): { start: string; end: string } {
  // Biweekly period anchored to the most recent Sunday, 14 days.
  const day = anchor.getDay();
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 13);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimesheetsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [{ start, end }, setRange] = useState(biweeklyRange(new Date()));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [status, setStatus] = useState<Timesheet["status"]>("OPEN");
  const [totalHours, setTotalHours] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Employee[]>("/employees").then((emp) => {
      setEmployees(emp);
      if (emp.length > 0) setEmployeeId(String(emp[0].id));
    });
  }, []);

  async function load() {
    if (!employeeId) return;
    const ts = await api.get<Timesheet>(`/timesheets/employee/${employeeId}?periodStart=${start}&periodEnd=${end}`);
    setEntries(ts.entries.map((e) => ({ ...e, clockIn: toLocalInputValue(e.clockIn), clockOut: toLocalInputValue(e.clockOut) })));
    setStatus(ts.status);
    setTotalHours(ts.totalHours);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, start, end]);

  function addRow() {
    setEntries((rows) => [
      ...rows,
      { workDate: start, clockIn: `${start}T09:00`, clockOut: `${start}T17:00`, unpaidBreakMins: 30 },
    ]);
  }

  function updateRow(index: number, patch: Partial<TimesheetEntry>) {
    setEntries((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setEntries((rows) => rows.filter((_, i) => i !== index));
  }

  const previewTotal = useMemo(() => {
    // Client-side preview only; the server recomputes authoritatively on save.
    let total = 0;
    for (const e of entries) {
      const inMs = new Date(e.clockIn).getTime();
      let outMs = new Date(e.clockOut).getTime();
      if (outMs <= inMs) outMs += 24 * 60 * 60 * 1000;
      const hours = Math.max(0, (outMs - inMs) / 60000 - (e.unpaidBreakMins || 0)) / 60;
      total += hours;
    }
    return Math.round(total * 100) / 100;
  }, [entries]);

  async function save() {
    setError(null);
    try {
      const ts = await api.put<Timesheet>(`/timesheets/employee/${employeeId}`, {
        periodStart: start,
        periodEnd: end,
        entries: entries.map((e) => ({
          workDate: e.workDate,
          clockIn: new Date(e.clockIn).toISOString(),
          clockOut: new Date(e.clockOut).toISOString(),
          unpaidBreakMins: e.unpaidBreakMins,
          notes: e.notes,
        })),
      });
      setTotalHours(ts.totalHours);
      setStatus(ts.status);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save timesheet.");
    }
  }

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
        <div className="field">
          <label>Period Start</label>
          <input type="date" value={start} onChange={(e) => setRange({ start: e.target.value, end })} />
        </div>
        <div className="field">
          <label>Period End</label>
          <input type="date" value={end} onChange={(e) => setRange({ start, end: e.target.value })} />
        </div>
        <div className="field">
          <label>Status</label>
          <input value={status} disabled />
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Work Date</th><th>Clock In</th><th>Clock Out</th><th>Unpaid Break (min)</th><th>Hours</th><th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td><input type="date" value={e.workDate} onChange={(ev) => updateRow(i, { workDate: ev.target.value })} /></td>
                <td><input type="datetime-local" value={e.clockIn} onChange={(ev) => updateRow(i, { clockIn: ev.target.value })} /></td>
                <td><input type="datetime-local" value={e.clockOut} onChange={(ev) => updateRow(i, { clockOut: ev.target.value })} /></td>
                <td><input type="number" min={0} value={e.unpaidBreakMins} onChange={(ev) => updateRow(i, { unpaidBreakMins: Number(ev.target.value) })} /></td>
                <td>{e.decimalHours?.toFixed(2) ?? "—"}</td>
                <td><input value={e.notes ?? ""} onChange={(ev) => updateRow(i, { notes: ev.target.value })} /></td>
                <td><button className="btn danger" type="button" onClick={() => removeRow(i)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn secondary" type="button" onClick={addRow} style={{ marginTop: "0.75rem" }}>Add Day</button>
      </div>

      <div className="card">
        <p><strong>Preview Total (unsaved):</strong> {previewTotal.toFixed(2)} hours</p>
        <p><strong>Saved Total:</strong> {totalHours.toFixed(2)} hours</p>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn" onClick={save}>Save Timesheet</button>
          <button className="btn secondary" onClick={() => window.print()}>Print</button>
        </div>
      </div>
    </div>
  );
}
