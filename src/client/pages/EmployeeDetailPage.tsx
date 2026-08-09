import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Employee, EmployeeSchedule } from "../api/types";
import { formatDate } from "../utils/time";
import { useAuth } from "../context/AuthContext";

const DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const emp = await api.get<Employee>(`/employees/${id}`);
    setEmployee(emp);
    const sched = await api.get<EmployeeSchedule[]>(`/schedules/employee/${id}`);
    setSchedules(sched);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [form, setForm] = useState({
    employmentStatus: "FULL_TIME",
    shiftStartTime: "09:00",
    shiftEndTime: "17:00",
    daysOff: ["SAT", "SUN"] as string[],
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      daysOff: f.daysOff.includes(day) ? f.daysOff.filter((d) => d !== day) : [...f.daysOff, day],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/schedules/employee/${id}`, { ...form, daysOff: form.daysOff.join(",") });
      setShowScheduleForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save schedule.");
    }
  }

  async function archive() {
    if (!confirm("Archive this employee?")) return;
    await api.post(`/employees/${id}/archive`);
    await load();
  }

  if (!employee) return <p>Loading...</p>;

  return (
    <div>
      <h2>{employee.firstName} {employee.lastName} <span className="badge">{employee.employeeCode}</span></h2>
      <div className="card">
        <p><strong>Line of Business:</strong> {employee.lineOfBusiness?.name}</p>
        <p><strong>Phone:</strong> {employee.phoneNumber}</p>
        <p><strong>Date of Hire:</strong> {formatDate(employee.dateOfHire)}</p>
        <p><strong>Status:</strong> {employee.status}</p>
        {user?.isAdministrator && employee.status === "ACTIVE" && (
          <button className="btn danger" onClick={archive}>Archive Employee</button>
        )}
      </div>

      <div className="topbar">
        <h3>Schedule History</h3>
        {user?.isAdministrator && (
          <button className="btn" onClick={() => setShowScheduleForm((s) => !s)}>
            {showScheduleForm ? "Cancel" : "Change Schedule"}
          </button>
        )}
      </div>

      {showScheduleForm && user?.isAdministrator && (
        <div className="card">
          <p className="muted">
            Saving creates a new effective-dated schedule. The prior schedule is preserved and will
            automatically end the day before this effective date — historical reports will still show it correctly.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-4">
              <div className="field">
                <label>Employment Status</label>
                <select value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}>
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PART_TIME">Part-Time</option>
                </select>
              </div>
              <div className="field">
                <label>Shift Start Time</label>
                <input type="time" value={form.shiftStartTime} onChange={(e) => setForm({ ...form, shiftStartTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>Shift End Time</label>
                <input type="time" value={form.shiftEndTime} onChange={(e) => setForm({ ...form, shiftEndTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>Effective Date</label>
                <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>Days Off</label>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {DAY_OPTIONS.map((day) => (
                  <label key={day} style={{ display: "flex", alignItems: "center", gap: "0.3rem", width: "auto" }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={form.daysOff.includes(day)} onChange={() => toggleDay(day)} />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit">Save New Schedule</button>
          </form>
        </div>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Effective Date</th><th>End Date</th><th>Status</th><th>Shift</th><th>Days Off</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td>{formatDate(s.effectiveDate)}</td>
                <td>{s.endDate ? formatDate(s.endDate) : "Present"}</td>
                <td>{s.employmentStatus === "FULL_TIME" ? "Full-Time" : "Part-Time"}</td>
                <td>{s.shiftStartTime} - {s.shiftEndTime}</td>
                <td>{s.daysOff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
