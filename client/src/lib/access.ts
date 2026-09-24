/* AM2050 — Field Ledger Modernism: role-aware navigation makes the correct operational scope explicit. */
import { BadgeCheck, Banknote, BarChart3, BookOpenCheck, Building2, CalendarRange, ClipboardCheck, ClipboardEdit, ClipboardList, FileSpreadsheet, GraduationCap, Home, Layers3, MapPinned, Route, School, ScrollText, Settings2, TriangleAlert, Users, UserCog, UserRoundPlus } from "lucide-react";

export type Role = "super_admin" | "program_admin" | "lga_supervisor" | "ward_supervisor" | "headmaster" | "mobilizer" | "almajiri_liaison" | "teacher" | "guardian";

export const roleLabels: Record<Role, string> = {
  super_admin: "Super Admin",
  program_admin: "Program Admin",
  lga_supervisor: "LGA Supervisor",
  ward_supervisor: "Ward Supervisor",
  headmaster: "Headmaster",
  mobilizer: "Mobilizer",
  almajiri_liaison: "Almajiri Liaison",
  teacher: "Teacher",
  guardian: "Guardian",
};

export const roleRank: Record<Role, number> = { super_admin: 100, program_admin: 80, lga_supervisor: 60, ward_supervisor: 50, headmaster: 40, mobilizer: 30, almajiri_liaison: 30, teacher: 20, guardian: 10 };

export type ModuleLink = { key: string; label: string; path: string; icon: typeof Home; roles?: Role[]; minRole?: Role; excludeRoles?: Role[] };

export const modules: ModuleLink[] = [
  { key: "dashboard", label: "Dashboard", path: "/workspace", icon: Home, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "mobilizer", "almajiri_liaison", "teacher", "guardian"] },
  { key: "households", label: "Households", path: "/households", icon: Users, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "mobilizer", "almajiri_liaison"] },
  { key: "children", label: "Child Register", path: "/children", icon: UserRoundPlus, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "mobilizer", "almajiri_liaison", "headmaster", "teacher"] },
  { key: "child-journey", label: "Child Journey", path: "/child-journey", icon: Route, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "mobilizer", "almajiri_liaison", "teacher", "guardian"] },
  { key: "surveys", label: "Household surveys", path: "/surveys", icon: ClipboardEdit, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "mobilizer", "almajiri_liaison"] },
  { key: "tsangaya", label: "Tsangaya & Almajiri", path: "/tsangaya", icon: Building2, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "almajiri_liaison"] },
  { key: "schools", label: "School", path: "/schools", icon: School, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster"] },
  { key: "teachers", label: "Teachers", path: "/teachers", icon: Users, roles: ["headmaster", "teacher"] },
  { key: "classes", label: "Classes", path: "/classes", icon: Layers3, roles: ["headmaster"] },
  { key: "subjects", label: "Subjects", path: "/subjects", icon: BookOpenCheck, roles: ["headmaster"] },
  { key: "sessions", label: "Academic sessions", path: "/sessions", icon: CalendarRange, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster"] },
  { key: "enrollments", label: "Enrollment", path: "/enrollments", icon: BookOpenCheck, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "teacher"] },
  { key: "attendance", label: "Attendance", path: "/attendance", icon: ClipboardCheck, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "teacher"] },
  { key: "learning-records", label: "Results & Report Sheets", path: "/results", icon: GraduationCap, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "teacher"] },
  { key: "defaulters", label: "Defaulters", path: "/defaulters", icon: ClipboardList, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "teacher"] },
  { key: "compliance", label: "Compliance", path: "/compliance", icon: BadgeCheck, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor"] },
  { key: "incentives", label: "Incentives", path: "/incentives", icon: Banknote, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor"] },
  { key: "users", label: "User management", path: "/users", icon: UserCog, roles: ["super_admin"] },
  { key: "teacher-management", label: "Teacher management", path: "/teacher-management", icon: UserCog, roles: ["super_admin"] },
  { key: "geography", label: "Geography", path: "/geography", icon: MapPinned, roles: ["super_admin"] },
  { key: "settings", label: "Programme settings", path: "/settings", icon: Settings2, roles: ["super_admin", "program_admin"] },
  { key: "audit", label: "Audit log", path: "/audit", icon: ScrollText, roles: ["super_admin", "program_admin"] },
  { key: "heatmap", label: "Geographic attention", path: "/heatmap", icon: MapPinned, roles: ["super_admin", "program_admin", "lga_supervisor"] },
  { key: "dropout", label: "Dropout risk", path: "/dropout-risk", icon: TriangleAlert, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor"] },
  { key: "roi", label: "Programme ROI", path: "/roi", icon: BarChart3, roles: ["super_admin", "program_admin"] },
  { key: "reports", label: "Report & export", path: "/reports", icon: FileSpreadsheet, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "headmaster", "teacher"] },
  { key: "cohorts", label: "Cohorts", path: "/cohorts", icon: Layers3, roles: ["super_admin", "program_admin"] },
  { key: "cnr", label: "CNR — Child not in register", path: "/out-of-school", icon: UserRoundPlus, roles: ["super_admin", "program_admin", "lga_supervisor", "ward_supervisor", "mobilizer", "headmaster", "teacher"] },
  { key: "my-family", label: "My family records", path: "/my-family", icon: UserRoundPlus, roles: ["guardian"] },
];

export function canAccessModule(role: Role, module: ModuleLink) {
  if (module.roles) return module.roles.includes(role);
  if (module.excludeRoles?.includes(role)) return false;
  return !module.minRole || roleRank[role] >= roleRank[module.minRole];
}
