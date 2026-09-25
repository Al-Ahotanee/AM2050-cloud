/* AM2050 — Field Ledger Modernism: a role-aware operational shell frames every route and keeps status visible. */
import { useEffect, useState, type ReactNode } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PwaInstallPrompt } from "@/components/shared/PwaInstallPrompt";
import { AppShell } from "@/components/layout/AppShell";
import { RequireModule } from "@/components/auth/RequireModule";
import { Role } from "@/lib/access";
import { pendingSyncCount } from "@/lib/fieldStore";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { syncPendingRecords } from "@/offline/syncEngine";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Households from "@/pages/Households";
import Children from "@/pages/Children";
import ChildRegistration from "@/pages/ChildRegistration";
import ChildJourney from "@/pages/ChildJourney";
import Enrollments from "@/pages/Enrollments";
import Attendance from "@/pages/Attendance";
import LearningRecords from "@/pages/LearningRecords";
import ResultManagement from "@/pages/ResultManagement";
import Defaulters from "@/pages/Defaulters";
import FieldOperations from "@/pages/FieldOperations";
import ProgrammeControl from "@/pages/ProgrammeControl";
import Incentives from "@/pages/Incentives";
import SchoolOperations from "@/pages/SchoolOperations";
import SchoolRegistry from "@/pages/SchoolRegistry";
import UserAdministration from "@/pages/UserAdministration";
import TeacherManagement from "@/pages/TeacherManagement";
import Geography from "@/pages/Geography";
import Governance from "@/pages/Governance";
import Insights from "@/pages/Insights";
import OutOfSchool from "@/pages/OutOfSchool";
import Reports from "@/pages/Reports";
import Cohorts from "@/pages/Cohorts";
import GuardianFamily from "@/pages/GuardianFamily";
import ReportSchedules from "@/pages/ReportSchedules";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";

function Router({ role, pendingSync, onQueueChange }: { role: Role; pendingSync: number; onQueueChange: () => void }) {
  const guard = (moduleKey: string, node: ReactNode) => <RequireModule role={role} moduleKey={moduleKey}>{node}</RequireModule>;
  return <Switch>
    <Route path="/workspace" component={() => <Dashboard role={role} pendingSync={pendingSync} />} />
    <Route path="/households" component={() => guard("households", <Households />)} />
    <Route path="/children" component={() => guard("children", <Children />)} />
    <Route path="/children/new" component={() => ["headmaster", "teacher"].includes(role) ? <NotFound /> : guard("children", <ChildRegistration />)} />
    <Route path="/child-journey" component={() => guard("child-journey", <ChildJourney />)} />
    <Route path="/enrollments" component={() => guard("enrollments", <Enrollments role={role} />)} />
    <Route path="/attendance" component={() => guard("attendance", <Attendance role={role} />)} />
    <Route path="/results" component={() => guard("learning-records", <ResultManagement />)} />
    <Route path="/learning-records" component={() => guard("learning-records", <ResultManagement />)} />
    <Route path="/defaulters" component={() => guard("defaulters", <Defaulters />)} />
    <Route path="/surveys" component={() => guard("surveys", <FieldOperations mode="surveys" />)} />
    <Route path="/tsangaya" component={() => guard("tsangaya", <FieldOperations mode="tsangaya" />)} />
    <Route path="/compliance" component={() => guard("compliance", <ProgrammeControl mode="compliance" role={role} />)} />
    <Route path="/incentives" component={() => guard("incentives", <Incentives role={role} />)} />
    <Route path="/users" component={() => guard("users", <UserAdministration />)} />
    <Route path="/teacher-management" component={() => guard("teacher-management", <TeacherManagement />)} />
    <Route path="/geography" component={() => guard("geography", <Geography />)} />
    <Route path="/settings" component={() => guard("settings", <Governance mode="settings" />)} />
    <Route path="/audit" component={() => guard("audit", <Governance mode="audit" />)} />
    <Route path="/heatmap" component={() => guard("heatmap", <Insights mode="heatmap" />)} />
    <Route path="/dropout-risk" component={() => guard("dropout", <Insights mode="dropout" />)} />
    <Route path="/roi" component={() => guard("roi", <Insights mode="roi" />)} />
    <Route path="/schools" component={() => guard("schools", <SchoolRegistry role={role} />)} />
    <Route path="/teachers" component={() => guard("teachers", <SchoolOperations mode="teachers" role={role} />)} />
    <Route path="/classes" component={() => guard("classes", <SchoolOperations mode="classes" role={role} />)} />
    <Route path="/subjects" component={() => guard("subjects", <SchoolOperations mode="subjects" role={role} />)} />
    <Route path="/out-of-school" component={() => guard("cnr", <OutOfSchool />)} />
    <Route path="/reports" component={() => guard("reports", <Reports />)} />
    <Route path="/cohorts" component={() => guard("cohorts", <Cohorts />)} />
    <Route path="/my-family" component={() => guard("my-family", <GuardianFamily />)} />
    <Route path="/report-schedules" component={() => guard("reports", <ReportSchedules />)} />
    <Route path="/sessions" component={() => guard("sessions", <SchoolOperations mode="sessions" role={role} />)} />
    <Route component={NotFound} />
  </Switch>;
}

function AuthenticatedApp() {
  const { user, ready, logout } = useAuth();
  const [pendingSync, setPendingSync] = useState(pendingSyncCount);
  const refreshQueue = () => setPendingSync(pendingSyncCount());
  useEffect(() => { if (!user || pendingSync === 0 || !navigator.onLine) return; const synchronize = async () => { try { await syncPendingRecords(); refreshQueue(); } catch { /* Queue remains visibly pending until a later retry. */ } }; void synchronize(); window.addEventListener("online", synchronize); return () => window.removeEventListener("online", synchronize); }, [user?.id, pendingSync]);
  if (!ready) return <main className="paper-grain grid min-h-screen place-items-center"><p className="font-mono text-xs uppercase tracking-[0.12em] text-[#617985]">Restoring secure session…</p></main>;
  if (!user) return <Login />;
  return <AppShell user={user} onLogout={logout} pendingSync={pendingSync} onQueueChange={refreshQueue}><Router role={user.role} pendingSync={pendingSync} onQueueChange={refreshQueue} /></AppShell>;
}

function PublicRouter() { return <Switch><Route path="/" component={Landing} /><Route path="/login" component={Login} /><Route component={AuthenticatedApp} /></Switch>; }
export default function App() { return <ErrorBoundary><AuthProvider><PublicRouter /><PwaInstallPrompt /><Toaster /></AuthProvider></ErrorBoundary>; }
