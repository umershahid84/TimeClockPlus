import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Employee } from "../api/types";
import { useAppConfig } from "../context/AppConfigContext";
import { formatInstant } from "../utils/time";

const ENTITY_TYPES = ["EMPLOYEE", "SCHEDULE", "TIMESHEET", "TIMESHEET_ENTRY", "USER", "LINE_OF_BUSINESS", "SYSTEM_SETTING", "CLOCK_EVENT"];
const ACTIONS = ["CREATE", "UPDATE", "DELETE", "ARCHIVE", "APPROVE", "REJECT", "LOGIN", "PASSWORD_RESET", "PERMISSION_CHANGE"];

interface AuditActor {
  id: number;
  userId: string;
  firstName: string;
  lastName: string;
}

interface AuditEmployee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

interface AuditLogItem {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  actor: AuditActor | null;
  employee: AuditEmployee | null;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const { timezone } = useAppConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const entityType = searchParams.get("entityType") ?? "";
  const action = searchParams.get("action") ?? "";
  const actorUserId = searchParams.get("actorUserId") ?? "";
  const employeeId = searchParams.get("employeeId") ?? "";

  useEffect(() => {
    api.get<Employee[]>("/employees?status=ALL").then(setEmployees);
  }, []);

  async function load() {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (actorUserId) params.set("actorUserId", actorUserId);
    if (employeeId) params.set("employeeId", employeeId);
    const data = await api.get<{ items: AuditLogItem[]; total: number }>(`/audit-log?${params.toString()}`);
    setItems(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, action, actorUserId, employeeId, offset]);

  function updateFilter(key: string, value: string) {
    setOffset(0);
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  }

  const actorFilterLabel = actorUserId
    ? "Filtered to one user"
    : "";

  function summarize(item: AuditLogItem): string {
    if (!item.previousValue && !item.newValue) return "";
    try {
      const prev = item.previousValue ? JSON.parse(item.previousValue) : null;
      const next = item.newValue ? JSON.parse(item.newValue) : null;
      if (prev && next) {
        const changedKeys = Object.keys(next).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
        if (changedKeys.length > 0) {
          return changedKeys.map((k) => `${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(next[k])}`).join("; ");
        }
      }
      return JSON.stringify(next ?? prev);
    } catch {
      return "";
    }
  }

  return (
    <div>
      <div className="topbar">
        <h2>Audit Log</h2>
      </div>
      <p className="muted">
        Every sensitive change across the system - employee, schedule, and timesheet edits, permission changes,
        password resets, logins, and employee kiosk punches - with who, what, and when.
      </p>

      <div className="card grid grid-4">
        <div className="field">
          <label>Entity Type</label>
          <select value={entityType} onChange={(e) => updateFilter("entityType", e.target.value)}>
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Action</label>
          <select value={action} onChange={(e) => updateFilter("action", e.target.value)}>
            <option value="">All</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => updateFilter("employeeId", e.target.value)}>
            <option value="">All</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
            ))}
          </select>
        </div>
        {actorUserId && (
          <div className="field">
            <label>Actor</label>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="badge">{actorFilterLabel}</span>
              <button className="btn secondary" onClick={() => updateFilter("actorUserId", "")}>Clear</button>
            </div>
          </div>
        )}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity</th><th>Employee</th><th>Details</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatInstant(item.createdAt, timezone)}</td>
                <td>{item.actor ? `${item.actor.firstName} ${item.actor.lastName}` : "System / Kiosk"}</td>
                <td>{item.action.replace(/_/g, " ")}</td>
                <td>{item.entityType.replace(/_/g, " ")} #{item.entityId}</td>
                <td>{item.employee ? `${item.employee.firstName} ${item.employee.lastName} (${item.employee.employeeCode})` : "—"}</td>
                <td>
                  {(item.previousValue || item.newValue) && (
                    <button className="btn secondary" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                      {expandedId === item.id ? "Hide" : "View"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.map((item) =>
              expandedId === item.id ? (
                <tr key={`${item.id}-detail`}>
                  <td colSpan={6}>
                    <div className="muted" style={{ wordBreak: "break-word" }}>{summarize(item)}</div>
                  </td>
                </tr>
              ) : null
            )}
            {items.length === 0 && (
              <tr><td colSpan={6} className="muted">No audit entries match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted">{total === 0 ? "0 results" : `Showing ${offset + 1}-${Math.min(offset + PAGE_SIZE, total)} of ${total}`}</span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>&larr; Previous</button>
          <button className="btn secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next &rarr;</button>
        </div>
      </div>
    </div>
  );
}
