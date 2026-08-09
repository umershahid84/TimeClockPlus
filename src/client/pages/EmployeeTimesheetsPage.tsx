import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Employee, LineOfBusiness } from "../api/types";
import { downloadAuthenticated } from "../utils/download";
import { exportRowsToPdf } from "../utils/pdfExport";
import { formatDate } from "../utils/time";

// Column order/labels for the per-employee timesheet shown on screen,
// printed, and exported to PDF. CSV export goes straight to the backend
// report (which includes employeeCode/name/line-of-business columns too,
// consistent with the Reports page); here those are already shown in the
// page header, so the row columns focus on the day-by-day detail.
const TIMESHEET_COLUMNS: { key: string; label: string }[] = [
  { key: "workDate", label: "Date" },
  { key: "scheduledClockIn", label: "Scheduled In" },
  { key: "scheduledClockOut", label: "Scheduled Out" },
  { key: "actualClockIn", label: "Actual In" },
  { key: "actualClockOut", label: "Actual Out" },
  { key: "unpaidBreakMins", label: "Break (min)" },
  { key: "regularHours", label: "Regular" },
  { key: "otHours", label: "OT" },
  { key: "totalWorkedHours", label: "Total" },
  { key: "attendanceAdjustment", label: "Attendance" },
  { key: "supplementalType", label: "Supplemental" },
  { key: "supplementalHours", label: "Suppl. Hrs" },
  { key: "timeType", label: "Time Type" },
  { key: "notes", label: "Notes" },
];

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PrintTarget {
  employee: Employee;
  rows: Record<string, unknown>[];
}

export function EmployeeTimesheetsPage() {
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [lineOfBusinessId, setLineOfBusinessId] = useState("");
  const [anchorDate, setAnchorDate] = useState(today());
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [busyEmployeeId, setBusyEmployeeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<PrintTarget | null>(null);

  useEffect(() => {
    api.get<LineOfBusiness[]>("/lines-of-business").then(setLines);
  }, []);

  useEffect(() => {
    api.get<{ periodStart: string; periodEnd: string }>(`/timesheets/pay-period-bounds?date=${anchorDate}`).then((bounds) => {
      setPeriodStart(bounds.periodStart);
      setPeriodEnd(bounds.periodEnd);
    });
  }, [anchorDate]);

  useEffect(() => {
    const params = new URLSearchParams({ status: "ACTIVE" });
    if (lineOfBusinessId) params.set("lineOfBusinessId", lineOfBusinessId);
    api.get<Employee[]>(`/employees?${params.toString()}`).then(setEmployees);
  }, [lineOfBusinessId]);

  function navigate(direction: 1 | -1) {
    if (!periodStart) return;
    setAnchorDate(shiftDate(periodStart, direction * 14));
  }

  // Print a single employee's timesheet only once the print-only block
  // below has actually rendered with their data, then clear it once the
  // browser's print dialog closes - never the surrounding page chrome or
  // any other employee's data.
  useEffect(() => {
    if (!printTarget) return;
    const raf = requestAnimationFrame(() => window.print());
    const handleAfterPrint = () => setPrintTarget(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printTarget]);

  async function fetchRows(employee: Employee): Promise<Record<string, unknown>[]> {
    const params = new URLSearchParams({ employeeId: String(employee.id), start: periodStart!, end: periodEnd! });
    return api.get<Record<string, unknown>[]>(`/reports/timesheet?${params.toString()}`);
  }

  async function withBusy(employee: Employee, action: () => Promise<void>) {
    setError(null);
    setBusyEmployeeId(employee.id);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to export ${employee.firstName} ${employee.lastName}'s timesheet.`);
    } finally {
      setBusyEmployeeId(null);
    }
  }

  function handlePrint(employee: Employee) {
    return withBusy(employee, async () => {
      const rows = await fetchRows(employee);
      setPrintTarget({ employee, rows });
    });
  }

  function handlePdf(employee: Employee) {
    return withBusy(employee, async () => {
      const rows = await fetchRows(employee);
      await exportRowsToPdf({
        filename: `${employee.employeeCode}-timesheet-${periodStart}-to-${periodEnd}.pdf`,
        title: `Timesheet — ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
        subtitle: `Pay Period: ${formatDate(periodStart!)} to ${formatDate(periodEnd!)}  ·  ${employee.lineOfBusiness?.name ?? ""}`,
        columns: TIMESHEET_COLUMNS.map((c) => c.label),
        rows: rows.map((row) => Object.fromEntries(TIMESHEET_COLUMNS.map((c) => [c.label, row[c.key]]))),
      });
    });
  }

  function handleCsv(employee: Employee) {
    return withBusy(employee, async () => {
      const params = new URLSearchParams({ employeeId: String(employee.id), start: periodStart!, end: periodEnd!, format: "csv" });
      await downloadAuthenticated(`/reports/timesheet?${params.toString()}`, `${employee.employeeCode}-timesheet-${periodStart}-to-${periodEnd}.csv`);
    });
  }

  return (
    <div>
      <div className="topbar no-print">
        <h2>Employee Timesheets</h2>
      </div>
      <p className="muted no-print">
        Print, or export to PDF/CSV, any employee&rsquo;s timesheet for the selected pay period in one click.
      </p>

      <div className="card no-print">
        <div className="topbar" style={{ marginBottom: "1rem", paddingBottom: 0, border: "none" }}>
          <div>
            <div className="muted">Pay Period</div>
            {periodStart && periodEnd ? (
              <h3 style={{ margin: "0.2rem 0" }}>{formatDate(periodStart)} &ndash; {formatDate(periodEnd)}</h3>
            ) : (
              <h3 style={{ margin: "0.2rem 0" }}>Loading&hellip;</h3>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn secondary" onClick={() => navigate(-1)}>&larr; Previous Period</button>
            <button className="btn secondary" onClick={() => navigate(1)}>Next Period &rarr;</button>
          </div>
        </div>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Line of Business</label>
          <select value={lineOfBusinessId} onChange={(e) => setLineOfBusinessId(e.target.value)}>
            <option value="">All authorized</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="error-text no-print">{error}</p>}

      <div className="card table-wrap no-print">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th><th>Name</th><th>Line of Business</th><th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeCode}</td>
                <td>{employee.firstName} {employee.lastName}</td>
                <td>{employee.lineOfBusiness?.name}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn secondary"
                    disabled={!periodStart || busyEmployeeId === employee.id}
                    onClick={() => handlePrint(employee)}
                  >
                    Print
                  </button>{" "}
                  <button
                    className="btn secondary"
                    disabled={!periodStart || busyEmployeeId === employee.id}
                    onClick={() => handlePdf(employee)}
                  >
                    Export PDF
                  </button>{" "}
                  <button
                    className="btn secondary"
                    disabled={!periodStart || busyEmployeeId === employee.id}
                    onClick={() => handleCsv(employee)}
                  >
                    Export CSV
                  </button>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={4} className="muted">No employees found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {printTarget && (
        <div className="print-area">
          <div className="print-only">
            <h2>Timesheet — {printTarget.employee.firstName} {printTarget.employee.lastName} ({printTarget.employee.employeeCode})</h2>
            <p className="muted">
              Pay Period: {formatDate(periodStart!)} to {formatDate(periodEnd!)} &middot; {printTarget.employee.lineOfBusiness?.name}
            </p>
          </div>
          <table>
            <thead>
              <tr>{TIMESHEET_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {printTarget.rows.map((row, i) => (
                <tr key={i}>
                  {TIMESHEET_COLUMNS.map((c) => <td key={c.key}>{String(row[c.key] ?? "")}</td>)}
                </tr>
              ))}
              {printTarget.rows.length === 0 && (
                <tr><td colSpan={TIMESHEET_COLUMNS.length} className="muted">No timesheet entries for this pay period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
