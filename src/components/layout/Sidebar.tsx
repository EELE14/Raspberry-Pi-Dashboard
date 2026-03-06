import {
  LayoutDashboard,
  Bot,
  Box,
  FolderOpen,
  Terminal,
  LogOut,
  LucideServer,
  Network,
  ClipboardList,
  Settings,
  Shield,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { useAuth } from "../../context/useAuth";

const links = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/bots", icon: Bot, label: "Bots" },
  { to: "/containers", icon: Box, label: "Containers" },
  { to: "/files", icon: FolderOpen, label: "Files" },
  { to: "/terminal", icon: Terminal, label: "Terminal" },
  { to: "/network", icon: Network, label: "Network" },
  { to: "/audit", icon: ClipboardList, label: "Audit" },
  { to: "/security", icon: Shield, label: "Security" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-[oklch(13%_0.01_260)] border-r border-[oklch(20%_0.01_260)] h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[oklch(20%_0.01_260)]">
        <LucideServer size={20} strokeWidth={1.75} className="text-white" />
        <span className="font-semibold text-sm text-white">PI Server</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-[oklch(65%_0.18_250)]/15 text-[oklch(75%_0.18_250)]"
                  : "text-[oklch(55%_0.01_260)] hover:bg-[oklch(20%_0.01_260)] hover:text-white",
              )
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-[oklch(20%_0.01_260)]">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[oklch(55%_0.01_260)] hover:bg-[oklch(20%_0.01_260)] hover:text-[oklch(65%_0.18_25)] transition-colors"
        >
          <LogOut size={16} strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
