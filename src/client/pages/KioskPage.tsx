import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAppConfig } from "../context/AppConfigContext";
import { formatInstant } from "../utils/time";

type ClockState = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

interface KioskStatus {
  employeeId: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  lineOfBusiness: string;
  state: ClockState;
  clockedInAt: string | null;
  onBreakSinceAt: string | null;
  warning?: string;
}

const STATE_LABELS: Record<ClockState, string> = {
  CLOCKED_OUT: "Clocked Out",
  CLOCKED_IN: "Clocked In",
  ON_BREAK: "On Break",
};

const RESET_DELAY_MS = 6000;

export function KioskPage() {
  const { timezone } = useAppConfig();
  const [now, setNow] = useState(new Date());
  const [employeeCode, setEmployeeCode] = useState("");
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [status]);

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(reset, RESET_DELAY_MS);
  }

  function reset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setStatus(null);
    setConfirmation(null);
    setError(null);
    setEmployeeCode("");
  }

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    if (!employeeCode.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<KioskStatus>("/kiosk/lookup", { employeeCode: employeeCode.trim() });
      setStatus(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(action: "clock-in" | "break-start" | "break-end" | "clock-out", confirmLabel: string) {
    if (!status) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<KioskStatus>(`/kiosk/${action}`, { employeeCode: status.employeeCode });
      setStatus(result);
      setConfirmation(`${confirmLabel} at ${formatInstant(new Date(), timezone)}`);
      scheduleReset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kiosk-page">
      <div className="kiosk-clock">
        <div className="time">
          {new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now)}
        </div>
        <div className="date">
          {new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(now)}
        </div>
      </div>

      <div className="card kiosk-card">
        {!status && (
          <>
            <h2>Employee Time Clock</h2>
            <form onSubmit={handleLookup}>
              <div className="field">
                <label htmlFor="employeeCode">Employee ID</label>
                <input
                  id="employeeCode"
                  ref={inputRef}
                  className="kiosk-id-input"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
              {error && <p className="error-text">{error}</p>}
              <button type="submit" className="btn kiosk-btn" disabled={busy}>
                {busy ? "Looking up..." : "Continue"}
              </button>
            </form>
          </>
        )}

        {status && (
          <>
            <div className="kiosk-employee-name">{status.firstName} {status.lastName}</div>
            <p className="muted" style={{ marginTop: 0 }}>{status.employeeCode} &middot; {status.lineOfBusiness}</p>
            <span className="badge kiosk-status-badge">{STATE_LABELS[status.state]}</span>

            {status.state === "CLOCKED_IN" && status.clockedInAt && (
              <p className="muted">Clocked in at {formatInstant(status.clockedInAt, timezone)}</p>
            )}
            {status.state === "ON_BREAK" && status.onBreakSinceAt && (
              <p className="muted">On break since {formatInstant(status.onBreakSinceAt, timezone)}</p>
            )}

            {confirmation && <p className="success-text">{confirmation}</p>}
            {status.warning && <p className="error-text">{status.warning}</p>}
            {error && <p className="error-text">{error}</p>}

            <div>
              {status.state === "CLOCKED_OUT" && (
                <button className="btn kiosk-btn" disabled={busy} onClick={() => handleAction("clock-in", "Clocked in")}>
                  Clock In
                </button>
              )}
              {status.state === "CLOCKED_IN" && (
                <>
                  <button className="btn kiosk-btn" disabled={busy} onClick={() => handleAction("break-start", "Break started")}>
                    Start Break
                  </button>
                  <button className="btn secondary kiosk-btn" disabled={busy} onClick={() => handleAction("clock-out", "Clocked out")}>
                    Clock Out
                  </button>
                </>
              )}
              {status.state === "ON_BREAK" && (
                <>
                  <button className="btn kiosk-btn" disabled={busy} onClick={() => handleAction("break-end", "Break ended")}>
                    End Break
                  </button>
                  <button className="btn secondary kiosk-btn" disabled={busy} onClick={() => handleAction("clock-out", "Clocked out")}>
                    Clock Out
                  </button>
                </>
              )}
              <button className="btn secondary kiosk-btn" onClick={reset}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
