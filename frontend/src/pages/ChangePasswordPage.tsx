import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function ChangePasswordPage() {
  const { user, mustChangePassword, clearMustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return <Navigate to="/login" replace />;
  if (!mustChangePassword) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      clearMustChangePassword();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update password.");
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Set a New Password</h2>
        <p className="muted">You must change your temporary password before continuing.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Temporary / Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>New Password (min 10 characters)</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" style={{ width: "100%" }}>Update Password</button>
        </form>
      </div>
    </div>
  );
}
