import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.post<{ message: string }>("/auth/forgot-password/request", { identifier });
    setMessage(res.message);
    setStep("confirm");
  }

  async function confirmReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/auth/forgot-password/confirm", { identifier, code, newPassword });
      setMessage("Password updated. You can now log in.");
      setTimeout(() => navigate("/login"), 1500);
    } catch {
      setError("Invalid or expired code.");
    }
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Forgot Password</h2>
        {step === "request" ? (
          <form onSubmit={requestCode}>
            <div className="field">
              <label>Email address or User ID</label>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </div>
            <button className="btn" type="submit" style={{ width: "100%" }}>Send Code</button>
          </form>
        ) : (
          <form onSubmit={confirmReset}>
            <div className="field">
              <label>One-Time Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required />
            </div>
            <div className="field">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} required />
            </div>
            <button className="btn" type="submit" style={{ width: "100%" }}>Reset Password</button>
          </form>
        )}
        {message && <p className="muted">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        <p className="muted"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
