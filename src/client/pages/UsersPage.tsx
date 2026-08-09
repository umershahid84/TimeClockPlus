import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { LineOfBusiness } from "../api/types";

interface UserRow {
  id: number;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdministrator: boolean;
  isActive: boolean;
  linesOfBusiness: { id: number; name: string }[];
}

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [u, l] = await Promise.all([
      api.get<UserRow[]>("/users"),
      api.get<LineOfBusiness[]>("/lines-of-business"),
    ]);
    setUsers(u);
    setLines(l);
  }

  useEffect(() => {
    load();
  }, []);

  const [form, setForm] = useState({
    userId: "",
    firstName: "",
    lastName: "",
    email: "",
    lineOfBusinessIds: [] as number[],
    grantAdministrator: false,
  });

  function toggleLob(id: number) {
    setForm((f) => ({
      ...f,
      lineOfBusinessIds: f.lineOfBusinessIds.includes(id)
        ? f.lineOfBusinessIds.filter((x) => x !== id)
        : [...f.lineOfBusinessIds, id],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api.post("/users/supervisors", form);
      setMessage(`Supervisor account created. A welcome email with login details was sent to ${form.email}.`);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create supervisor.");
    }
  }

  async function toggleAdmin(user: UserRow) {
    await api.post(`/users/${user.id}/administrator`, { grant: !user.isAdministrator });
    await load();
  }

  return (
    <div>
      <div className="topbar">
        <h2>Supervisors / Users</h2>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Add Supervisor"}</button>
      </div>

      {message && <p className="muted">{message}</p>}

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-4">
              <div className="field">
                <label>User ID</label>
                <input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} required />
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
                <label>Email Address</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            <div className="field">
              <label>Line(s) of Business</label>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {lines.map((l) => (
                  <label key={l.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", width: "auto" }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={form.lineOfBusinessIds.includes(l.id)} onChange={() => toggleLob(l.id)} />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={form.grantAdministrator} onChange={(e) => setForm({ ...form, grantAdministrator: e.target.checked })} />
                Grant Administrator privileges (in addition to supervisory access)
              </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn" type="submit">Create Supervisor</button>
          </form>
        </div>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>User ID</th><th>Name</th><th>Email</th><th>Lines of Business</th><th>Administrator</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.userId}</td>
                <td>{u.firstName} {u.lastName}</td>
                <td>{u.email}</td>
                <td>{u.linesOfBusiness.map((l) => l.name).join(", ")}</td>
                <td>{u.isAdministrator ? "Yes" : "No"}</td>
                <td><button className="btn secondary" onClick={() => toggleAdmin(u)}>{u.isAdministrator ? "Revoke Admin" : "Grant Admin"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
