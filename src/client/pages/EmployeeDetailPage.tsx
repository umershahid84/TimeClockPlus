import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Employee, EmployeeSchedule, LineOfBusiness } from "../api/types";
import { formatDate, toDateInputValue } from "../utils/time";
import { useAuth } from "../context/AuthContext";

const DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function load() {
    const emp = await api.get<Employee>(`/employees/${id}`);
    setEmployee(emp);
    const sched = await api.get<EmployeeSchedule[]>(`/schedules/employee/${id}`);
    setSchedules(sched);
    const lob = await api.get<LineOfBusiness[]>("/lines-of-business");
    setLines(lob);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [editForm, setEditForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    dateOfHire: "",
    lineOfBusinessId: "",
  });

  function openEditForm() {
    if (!employee) return;
    setEditForm({
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      phoneNumber: employee.phoneNumber,
      dateOfHire: toDateInputValue(employee.dateOfHire),
      lineOfBusinessId: String(employee.lineOfBusinessId),
    });
    setEditError(null);
    setShowEditForm(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setEditError(null);
    try {
      await api.put(`/employees/${id}`, {
        ...editForm,
        lineOfBusinessId: Number(editForm.lineOfBusinessId),
      });
      setShowEditForm(false);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to save employee.");
    }
  }

  const [scheduleForm, setScheduleForm] = useState({
    employmentStatus: "FULL_TIME",
    shiftStartTime: "09:00",
    shiftEndTime: "17:00",
    daysOff: ["SAT", "SUN"] as string[],
    effectiveDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  function toggleDay(day: string) {
    setScheduleForm((f) => ({
      ...f,
      daysOff: f.daysOff.includes(day) ? f.daysOff.filter((d) => d !== day) : [...f.daysOff, day],
    }));
  }

  async function handleScheduleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/schedules/employee/${id}`, { ...scheduleForm, daysOff: scheduleForm.daysOff.join(",") });
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

  async function reactivate() {
    await api.post(`/employees/${id}/reactivate`);
    await load();
  }

  if (!employee) return <p>Loading...</p>;

  return (
    <div>
      <div className="topbar">
        <h2>{employee.firstName} {employee.lastName} <span className="badge">{employee.employeeCode}</span></h2>
        {user?.isAdministrator && (
          <button className="btn secondary" onClick={() => (showEditForm ? setShowEditForm(false) : openEditForm())}>
            {showEditForm ? "Cancel" : "Edit Employee"}
          </button>
        )}
      </div>

      {showEditForm && user?.isAdministrator && (
        <div className="card">
          <form onSubmit={saveEdit}>
            <div className="grid grid-4">
              <div className="field">
                <label>Employee ID</label>
                <input value={editForm.employeeCode} onChange={(e) => setEditForm({ ...editForm, employeeCode: e.target.value })} required />
              </div>
              <div className="field">
                <label>First Name</label>
                <input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Phone Number</label>
                <input value={editForm.phoneNumber} onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })} required />
              </div>
              <div className="field">
                <label>Date of Hire</label>
                <input type="date" value={editForm.dateOfHire} onChange={(e) => setEditForm({ ...editForm, dateOfHire: e.target.value })} required />
              </div>
              <div className="field">
                <label>Line of Business</label>
                <select value={editForm.lineOfBusinessId} onChange={(e) => setEditForm({ ...editForm, lineOfBusinessId: e.target.value })} required>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {editError && <p className="error-text">{editError}</p>}
            <button className="btn" type="submit">Save Changes</button>
          </form>
        </div>
      )}

      <div className="card">
        <p><strong>Line of Business:</strong> {employee.lineOfBusiness?.name}</p>
        <p><strong>Phone:</strong> {employee.phoneNumber}</p>
        <p><strong>Date of Hire:</strong> {formatDate(employee.dateOfHire)}</p>
        <p><strong>Status:</strong> {employee.status}</p>
        {user?.isAdministrator && employee.status === "ACTIVE" && (
          <button className="btn danger" onClick={archive}>Archive Employee</button>
        )}
        {user?.isAdministrator && employee.status !== "ACTIVE" && (
          <button className="btn" onClick={reactivate}>Reactivate Employee</button>
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
          <form onSubmit={handleScheduleSubmit}>
            <div className="grid grid-4">
              <div className="field">
                <label>Employment Status</label>
                <select value={scheduleForm.employmentStatus} onChange={(e) => setScheduleForm({ ...scheduleForm, employmentStatus: e.target.value })}>
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PART_TIME">Part-Time</option>
                </select>
              </div>
              <div className="field">
                <label>Shift Start Time</label>
                <input type="time" value={scheduleForm.shiftStartTime} onChange={(e) => setScheduleForm({ ...scheduleForm, shiftStartTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>Shift End Time</label>
                <input type="time" value={scheduleForm.shiftEndTime} onChange={(e) => setScheduleForm({ ...scheduleForm, shiftEndTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>Effective Date</label>
                <input type="date" value={scheduleForm.effectiveDate} onChange={(e) => setScheduleForm({ ...scheduleForm, effectiveDate: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>Days Off</label>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                {DAY_OPTIONS.map((day) => (
                  <label key={day} className="checkbox-label" style={{ width: "auto" }}>
                    <input type="checkbox" checked={scheduleForm.daysOff.includes(day)} onChange={() => toggleDay(day)} />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} rows={2} />
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
