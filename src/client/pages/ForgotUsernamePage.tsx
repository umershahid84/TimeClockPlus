import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export function ForgotUsernamePage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await api.post<{ message: string }>("/auth/forgot-username", { email });
    setMessage(res.message);
  }

  return (
    <div className="login-page">
      <div className="card login-card">
        <h2>Forgot User ID</h2>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Registered email address</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn" type="submit" style={{ width: "100%" }}>Send User ID</button>
        </form>
        {message && <p className="muted">{message}</p>}
        <p className="muted"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
