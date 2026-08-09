import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Employee, EmployeeSchedule, LineOfBusiness } from "../api/types";
import { formatDate } from "../utils/time";

interface BoardRow {
  employee: Employee;
  schedule: EmployeeSchedule | null;
}

export function SchedulesPage() {
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [lineOfBusinessId, setLineOfBusinessId] = useState<string>("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<BoardRow[]>([]);

  useEffect(() => {
    api.get<LineOfBusiness[]>("/lines-of-business").then((lob) => {
      setLines(lob);
      if (lob.length > 0) setLineOfBusinessId(String(lob[0].id));
    });
  }, []);

  useEffect(() => {
    if (!lineOfBusinessId) return;
    api
      .get<BoardRow[]>(`/schedules/lineOfBusiness/${lineOfBusinessId}?date=${date}`)
      .then(setRows);
  }, [lineOfBusinessId, date]);

  const lineOfBusinessName = lines.find((l) => String(l.id) === lineOfBusinessId)?.name ?? "";

  return (
    <div>
      <div className="topbar no-print">
        <h2>Schedules</h2>
        <button className="btn secondary" onClick={() => window.print()}>Print</button>
      </div>
      <div className="card grid grid-4 no-print">
        <div className="field">
          <label>Line of Business</label>
          <select value={lineOfBusinessId} onChange={(e) => setLineOfBusinessId(e.target.value)}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>As of Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="card table-wrap print-area">
        <div className="print-only">
          <h2>Schedule &mdash; {lineOfBusinessName}</h2>
          <p className="muted">As of {formatDate(date)}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Employee ID</th><th>Name</th><th>Status</th><th>Shift</th><th>Days Off</th><th>Effective Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ employee, schedule }) => (
              <tr key={employee.id}>
                <td>{employee.employeeCode}</td>
                <td>{employee.firstName} {employee.lastName}</td>
                <td>{schedule ? (schedule.employmentStatus === "FULL_TIME" ? "Full-Time" : "Part-Time") : "—"}</td>
                <td>{schedule ? `${schedule.shiftStartTime} - ${schedule.shiftEndTime}` : "No schedule"}</td>
                <td>{schedule?.daysOff ?? "—"}</td>
                <td>{schedule ? formatDate(schedule.effectiveDate) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">No employees found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
