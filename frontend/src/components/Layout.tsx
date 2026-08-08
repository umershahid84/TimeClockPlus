import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/employees", label: "Employees" },
  { to: "/schedules", label: "Schedules" },
  { to: "/timesheets", label: "Timesheets" },
  { to: "/reports", label: "Reports" },
  { to: "/users", label: "Supervisors / Users", adminOnly: true },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>TimeClockPlus</h1>
        <nav>
          {NAV_ITEMS.filter((item) => !item.adminOnly || user?.isAdministrator).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <div>
            <strong>{user?.firstName} {user?.lastName}</strong>{" "}
            <span className="badge">{user?.isAdministrator ? "Administrator" : "Supervisor"}</span>
          </div>
          <button
            className="btn secondary"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
