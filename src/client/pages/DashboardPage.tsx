import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TILES = [
  { to: "/employees", label: "Employees", desc: "Add, edit, archive, and view employee records" },
  { to: "/schedules", label: "Schedules", desc: "Create and view effective-dated schedules" },
  { to: "/timesheets", label: "Timesheets", desc: "Enter, review, and approve time worked" },
  { to: "/reports", label: "Reports", desc: "Schedule and payroll reports, CSV export" },
];

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <div>
      <h2>Welcome, {user?.firstName}</h2>
      <p className="muted">
        {user?.isAdministrator
          ? "You have Administrator access across all lines of business."
          : `Assigned lines of business: ${user?.linesOfBusiness.map((l) => l.name).join(", ") || "None"}`}
      </p>
      <div className="grid grid-4">
        {TILES.map((tile) => (
          <Link key={tile.to} to={tile.to} className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h3 style={{ marginTop: 0 }}>{tile.label}</h3>
            <p className="muted" style={{ marginBottom: 0 }}>{tile.desc}</p>
          </Link>
        ))}
        {user?.isAdministrator && (
          <Link to="/users" className="card" style={{ textDecoration: "none", color: "inherit" }}>
            <h3 style={{ marginTop: 0 }}>Supervisors / Users</h3>
            <p className="muted" style={{ marginBottom: 0 }}>Manage supervisor accounts and permissions</p>
          </Link>
        )}
      </div>
    </div>
  );
}
