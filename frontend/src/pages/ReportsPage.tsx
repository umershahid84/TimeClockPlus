import { useEffect, useState } from "react";
import { api } from "../api/client";
import { LineOfBusiness } from "../api/types";

export function ReportsPage() {
  const [lines, setLines] = useState<LineOfBusiness[]>([]);
  const [reportType, setReportType] = useState<"schedule" | "timesheet">("schedule");
  const [lineOfBusinessId, setLineOfBusinessId] = useState<string>("");
  const [start, setStart] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    api.get<LineOfBusiness[]>("/lines-of-business").then(setLines);
  }, []);

  async function runReport() {
    const params = new URLSearchParams({ start, end });
    if (lineOfBusinessId) params.set("lineOfBusinessId", lineOfBusinessId);
    const data = await api.get<Record<string, unknown>[]>(`/reports/${reportType}?${params.toString()}`);
    setRows(data);
  }

  function downloadCsv() {
    const token = localStorage.getItem("tcp_token");
    const params = new URLSearchParams({ start, end, format: "csv" });
    if (lineOfBusinessId) params.set("lineOfBusinessId", lineOfBusinessId);
    const base = import.meta.env.VITE_API_BASE_URL ?? "";
    fetch(`${base}/api/reports/${reportType}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${reportType}-report.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div>
      <h2>Reports</h2>
      <div className="card grid grid-4">
        <div className="field">
          <label>Report Type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as "schedule" | "timesheet")}>
            <option value="schedule">Schedule Report</option>
            <option value="timesheet">Timesheet / Payroll Report</option>
          </select>
        </div>
        <div className="field">
          <label>Line of Business</label>
          <select value={lineOfBusinessId} onChange={(e) => setLineOfBusinessId(e.target.value)}>
            <option value="">All authorized</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Start Date</label>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>End Date</label>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className="btn" onClick={runReport}>Run Report</button>
        <button className="btn secondary" onClick={downloadCsv}>Export CSV</button>
        <button className="btn secondary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="muted">Run a report to see results.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
