import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, user, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [userId, setUserId] = useState(() => localStorage.getItem("tcp_saved_userid") ?? "");
  const [password, setPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(Boolean(localStorage.getItem("tcp_saved_userid")));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user && !mustChangePassword) return <Navigate to="/" replace />;
  if (user && mustChangePassword) return <Navigate to="/change-password" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(userId, password);
      if (rememberUsername) localStorage.setItem("tcp_saved_userid", userId);
      else localStorage.removeItem("tcp_saved_userid");
      navigate("/");
    } catch {
      setError("Invalid User ID or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>TimeClockPlus</h2>
        {/* autoComplete attributes let the browser/OS password manager offer to save credentials,
            per the "saved credentials" requirement, without the app storing plaintext passwords itself. */}
        <form onSubmit={handleSubmit} autoComplete="on">
          <div className="field">
            <label htmlFor="userId">User ID</label>
            <input id="userId" name="username" autoComplete="username" value={userId} onChange={(e) => setUserId(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" name="current-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={rememberUsername} onChange={(e) => setRememberUsername(e.target.checked)} />
              Remember my User ID on this device
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link to="/forgot-password">Forgot password?</Link> &nbsp;|&nbsp;{" "}
          <Link to="/forgot-username">Forgot User ID?</Link>
        </p>
      </div>
    </div>
  );
}
