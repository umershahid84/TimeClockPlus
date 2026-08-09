import { useEffect, useState } from "react";
import { api } from "../api/client";
import { LineOfBusiness } from "../api/types";
import { downloadAuthenticated } from "../utils/download";
import { exportRowsToPdf } from "../utils/pdfExport";

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
    const params = new URLSearchParams({ start, end, format: "csv" });
    if (lineOfBusinessId) params.set("lineOfBusinessId", lineOfBusinessId);
    downloadAuthenticated(`/reports/${reportType}?${params.toString()}`, `${reportType}-report.csv`);
  }

  const reportTitle = reportType === "schedule" ? "Schedule Report" : "Timesheet / Payroll Report";
  const lineOfBusinessName = lines.find((l) => String(l.id) === lineOfBusinessId)?.name ?? "All authorized";

  // Exports only the report itself (title + table), not the surrounding
  // app chrome - built directly from the current result set, always in
  // landscape since every report here is a wide data table.
  async function downloadPdf() {
    if (rows.length === 0) return;
    await exportRowsToPdf({
      filename: `${reportType}-report.pdf`,
      title: reportTitle,
      subtitle: `${start} to ${end}  ·  ${lineOfBusinessName}`,
      columns: Object.keys(rows[0]),
      rows,
    });
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div>
      <div className="topbar no-print">
        <h2>Reports</h2>
      </div>
      <div className="card grid grid-4 no-print">
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
      <div className="no-print" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button className="btn" onClick={runReport}>Run Report</button>
        <button className="btn secondary" onClick={downloadCsv} disabled={rows.length === 0}>Export CSV</button>
        <button className="btn secondary" onClick={downloadPdf} disabled={rows.length === 0}>Export PDF</button>
        <button className="btn secondary" onClick={() => window.print()} disabled={rows.length === 0}>Print</button>
      </div>

      <div className="card table-wrap print-area">
        <div className="print-only">
          <h2>{reportTitle}</h2>
          <p className="muted">{start} to {end} &middot; {lineOfBusinessName}</p>
        </div>
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
