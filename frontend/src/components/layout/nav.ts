import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  Gauge,
  HandHelping,
  LayoutDashboard,
  QrCode,
  Settings,
  Undo2,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const ALL: Role[] = ["admin", "lab_assistant", "student", "faculty"];
const STAFF: Role[] = ["admin", "lab_assistant"];
const BORROWERS: Role[] = ["student", "faculty"];

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Equipment",
    items: [
      { label: "Inventory", to: "/equipment", icon: Boxes },
      { label: "Availability", to: "/availability", icon: Gauge },
      { label: "Borrow Equipment", to: "/borrow", icon: HandHelping, roles: BORROWERS },
      { label: "Borrowing Records", to: "/borrowings", icon: ClipboardList },
      { label: "Returns", to: "/returns", icon: Undo2, roles: STAFF },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { label: "Reservation Calendar", to: "/reservations", icon: CalendarDays },
      { label: "My Reservations", to: "/my-reservations", icon: CalendarCheck2, roles: BORROWERS },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "QR Scanner", to: "/scan", icon: QrCode },
      { label: "Damage Reports", to: "/damage-reports", icon: AlertTriangle },
      { label: "Maintenance", to: "/maintenance", icon: Wrench, roles: STAFF },
      { label: "Calibration", to: "/calibration", icon: Gauge, roles: STAFF },
      { label: "Consumables", to: "/consumables", icon: ClipboardList, roles: STAFF },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "User Management", to: "/users", icon: Users, roles: ["admin"] },
      { label: "Laboratory Management", to: "/labs", icon: Building2, roles: ["admin"] },
      { label: "Reports", to: "/reports", icon: BarChart3, roles: STAFF },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

export function visibleNavGroups(role: Role) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export const roleHome = (_role: Role) => "/dashboard";
export { ALL };
