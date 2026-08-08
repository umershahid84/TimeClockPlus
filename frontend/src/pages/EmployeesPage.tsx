import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Employee, LineOfBusiness } from "../api/types";
import { useAuth } from "../context/AuthContext";

const DAY_OPTIONS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [emp, lob] = await Promise.all([
      api.get<Employee[]>("/employees"),
      api.get<LineOfBusiness[]>("/lines-of-business"),
    ]);
    setEmployees(emp);
    setLines(lob);
  }

  useEffect(() => {
    load();
  }, []);

  const [form, setForm] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    dateOfHire: "",
    lineOfBusinessId: "",
    employmentStatus: "FULL_TIME",
    shiftStartTime: "09:00",
    shiftEndTime: "17:00",
    daysOff: ["SAT", "SUN"] as string[],
    effectiveDate: new Date().toISOString().slice(0, 10),
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
      await api.post("/employees", {
        ...form,
        lineOfBusinessId: Number(form.lineOfBusinessId),
        daysOff: form.daysOff.join(","),
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create employee.");
    }
  }

  return (
    <div>
      <div className="topbar">
        <h2>Employees</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add Employee"}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-4">
              <div className="field">
                <label>Employee ID</label>
                <input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} required />
              </div>
              <div className="field">
                <label>First Name</label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </div>
              <div className="field">
                <label>Phone Number</label>
                <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} required />
              </div>
              <div className="field">
                <label>Date of Hire</label>
                <input type="date" value={form.dateOfHire} onChange={(e) => setForm({ ...form, dateOfHire: e.target.value })} required />
              </div>
              <div className="field">
                <label>Line of Business</label>
                <select value={form.lineOfBusinessId} onChange={(e) => setForm({ ...form, lineOfBusinessId: e.target.value })} required>
                  <option value="">Select...</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Employment Status</label>
                <select value={form.employmentStatus} onChange={(e) => setForm({ ...form, employmentStatus: e.target.value })}>
                  <option value="FULL_TIME">Full-Time</option>
                  <option value="PART_TIME">Part-Time</option>
                </select>
              </div>
              <div className="field">
                <label>Effective Date of Schedule</label>
                <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} required />
              </div>
              <div className="field">
                <label>Shift Start Time</label>
                <input type="time" value={form.shiftStartTime} onChange={(e) => setForm({ ...form, shiftStartTime: e.target.value })} required />
              </div>
              <div className="field">
                <label>Shift End Time</label>
                <input type="time" value={form.shiftEndTime} onChange={(e) => setForm({ ...form, shiftEndTime: e.target.value })} required />
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
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit">Create Employee</button>
          </form>
        </div>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Line of Business</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id}>
                <td>{emp.employeeCode}</td>
                <td>{emp.firstName} {emp.lastName}</td>
                <td>{emp.lineOfBusiness?.name}</td>
                <td>{emp.status}</td>
                <td><Link to={`/employees/${emp.id}`}>View / Edit</Link></td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5} className="muted">No employees found for {user?.isAdministrator ? "any line of business" : "your assigned line(s) of business"}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
