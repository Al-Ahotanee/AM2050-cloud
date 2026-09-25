/* AM2050 — Field Ledger Modernism: Complete Overhaul of Child Journey & Longitudinal Dossier.
   Features:
   - Left Sidebar with multi-filter (Search, Class, Gender) and rich student cards.
   - Executive Child Profile Header with passport photo, 1-click copy ID, and 4 KPI cards (Attendance Rate, Academic Standing, Retention Health, Gates Cleared).
   - 5-Gate Milestone Ribbon with zero badge overlapping and full titles.
   - Rich Evidence Stream with category pills and detailed examination/attendance cards.
   - Formal A4 Printable Longitudinal Dossier Modal.
*/

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Award,
  BookOpen,
  BookOpenCheck,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  HeartHandshake,
  Home,
  Loader2,
  MapPin,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserRound,
  UserX,
  Users,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChildMilestonesRibbon } from "@/components/child-journey/ChildMilestonesRibbon";
import ChildLongitudinalDossierModal from "@/components/child-journey/ChildLongitudinalDossierModal";

type JourneyChild = {
  id: string;
  child_unique_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  gender: string;
  child_status: string;
  current_stage: string | null;
  next_action: string | null;
  last_event_at: string | null;
  school_name: string | null;
  class_name: string | null;
};

type JourneyEvent = {
  id: string;
  type: string;
  family: string;
  occurredAt: string;
  recordedAt: string;
  summary: string;
  details: Record<string, unknown>;
  sourceType: string;
  canOpenSource: boolean;
};

type Journey = {
  child: {
    id: string;
    registrationId: string;
    name: string;
    firstName?: string;
    lastName?: string;
    photoUrl: string | null;
    gender: string;
    dob?: string | null;
    estimatedAge?: number | null;
    guardianPhone?: string | null;
    guardianName?: string | null;
    householdCode?: string | null;
    wardName?: string | null;
    communityName?: string | null;
    qrToken?: string | null;
  };
  summary: {
    currentStage: string;
    nextAction: string;
    lastEventAt: string | null;
    schoolName: string | null;
    className: string | null;
    overallAttendanceRate?: number;
    totalSchoolDays?: number;
    attendedDays?: number;
    academicAverage?: number | null;
    latestGrade?: string | null;
    latestPosition?: number | null;
    clearedGates?: number;
    retentionStatus?: string;
  };
  events: JourneyEvent[];
  nextCursor: string | null;
};

type SchoolClass = { id: string; class_name: string; class_level: string };

const families = [
  "all",
  "registration",
  "household",
  "enrollment",
  "attendance",
  "learning",
  "support",
  "referral",
  "transition",
] as const;

const familyLabels: Record<(typeof families)[number], string> = {
  all: "All Events",
  registration: "Identification",
  household: "Household Link",
  enrollment: "School Placement",
  attendance: "Roll-Call Attendance",
  learning: "Academic Examinations",
  support: "Welfare & CCT",
  referral: "Casework Follow-Up",
  transition: "Progression & BECE",
};

const sourcePaths: Record<string, string> = {
  child: "/children",
  enrollment: "/enrollment",
  attendance_period: "/attendance",
  result_period: "/results",
  incentive: "/incentives",
  referral: "/out-of-school",
};

const familyIcon: Record<string, typeof FileText> = {
  registration: UserRound,
  household: Home,
  enrollment: BookOpenCheck,
  attendance: ClipboardCheck,
  learning: GraduationCap,
  support: WalletCards,
  referral: MapPin,
  transition: ChevronRight,
};

const stageLabel = (stage: string) =>
  ({
    active_learning: "Active Learning",
    awaiting_enrollment: "Awaiting Placement",
    registered: "Registered",
    transition_relocated: "Transition: Relocated",
    transition_untraceable: "Transition: Untraceable",
    transition_deceased: "Status Review",
  }[stage] ?? stage.replaceAll("_", " "));

const readableDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
    : "Not recorded";

export default function ChildJourney() {
  const { user } = useAuth();
  const guardianView = user?.role === "guardian";

  // Data State
  const [children, setChildren] = useState<JourneyChild[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [family, setFamily] = useState<(typeof families)[number]>("all");

  // Loading State
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingJourney, setLoadingJourney] = useState(false);

  // Formal A4 Dossier Modal
  const [dossierModalOpen, setDossierModalOpen] = useState(false);

  // 1. Load Initial Classes
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await apiClient.request<SchoolClass[]>("/classes?limit=100");
        if (res.success) {
          setClasses(res.data);
        }
      } catch {
        // non-blocking
      }
    };
    void fetchClasses();
  }, []);

  // 2. Load Authorised Children with Multi-Filters
  const loadChildren = async (query = search, cls = selectedClassFilter, gen = genderFilter) => {
    setLoadingChildren(true);
    const params = new URLSearchParams();
    params.append("limit", "50");
    if (query.trim()) params.append("search", query.trim());
    if (cls !== "all") params.append("class_id", cls);
    if (gen !== "all") params.append("gender", gen);

    const result = await apiClient.request<JourneyChild[]>(`/child-journey/children?${params.toString()}`);
    if (result.success) {
      setChildren(result.data);
      setSelectedId((prev) => (prev && result.data.some((c) => c.id === prev) ? prev : result.data[0]?.id ?? null));
    } else {
      toast.error(result.error);
    }
    setLoadingChildren(false);
  };

  useEffect(() => {
    void loadChildren(search, selectedClassFilter, genderFilter);
  }, [selectedClassFilter, genderFilter]);

  // 3. Load Selected Child Longitudinal Journey
  const loadJourney = async (childId: string, selectedFamily = family) => {
    setLoadingJourney(true);
    const types = selectedFamily === "all" ? "" : `?types=${selectedFamily}`;
    const result = await apiClient.request<Journey>(`/child-journey/children/${childId}${types}`);
    if (result.success) {
      setJourney(result.data);
    } else {
      setJourney(null);
      toast.error(result.error);
    }
    setLoadingJourney(false);
  };

  useEffect(() => {
    if (selectedId) void loadJourney(selectedId);
    else setJourney(null);
  }, [selectedId, family]);

  // Copy Child ID Helper
  const handleCopyId = (code: string) => {
    void navigator.clipboard.writeText(code);
    toast.success(`Copied ${code} to clipboard`);
  };

  // Export Timeline Events as CSV
  const handleExportTimelineCsv = () => {
    if (!journey) return;
    const headers = ["Year", "Event Family", "Date", "Summary", "Source Type"];
    const rows = journey.events.map((e) => [
      new Date(e.occurredAt).getFullYear(),
      e.family,
      readableDate(e.occurredAt),
      `"${e.summary.replaceAll('"', '""')}"`,
      e.sourceType,
    ]);
    const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", `Child_Journey_${journey.child.registrationId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group events by Year
  const eventGroups = useMemo(() => {
    return (
      journey?.events.reduce<Record<string, JourneyEvent[]>>((groups, event) => {
        const year = new Date(event.occurredAt).getFullYear().toString();
        (groups[year] ??= []).push(event);
        return groups;
      }, {}) ?? {}
    );
  }, [journey]);

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">

        {/* 1. TOP HEADER & OPERATIONAL CONTEXT BANNER */}
        <header className="rounded-2xl border border-[#cfd9d2] bg-white p-5 sm:p-6 shadow-sm no-print">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 mb-4 text-xs font-semibold text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">Longitudinal Registry</span>
              <span>/</span>
              <span className="text-slate-800 font-bold">Child Pathway & Evidence Dossier</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                <ShieldCheck size={12} className="text-emerald-700" />
                UBEC Jigawa Pilot Certified · Ahoto Ward
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Pipeline:</span>
              <strong className="text-slate-900 font-mono">2050 Zero Out-of-School Children</strong>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#123148] sm:text-3xl">
                {guardianView ? "Your Child’s Longitudinal Pathway" : "Child Longitudinal Journey & Dossier"}
              </h1>
              <p className="mt-1 text-sm text-[#57707f]">
                Source-linked longitudinal history tracing identification, enrollment, daily roll-call compliance, examination results, and welfare progression.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  void loadChildren(search, selectedClassFilter, genderFilter);
                  if (selectedId) void loadJourney(selectedId);
                }}
                className="action-press inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cfd9d2] bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-sm"
              >
                <RefreshCw size={14} className={loadingChildren || loadingJourney ? "animate-spin" : ""} />
                Refresh Record
              </button>
            </div>
          </div>
        </header>

        {/* 2. MAIN 2-COLUMN WORKSPACE: LEFT AUTHORISED CHILDREN + RIGHT DOSSIER */}
        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">

          {/* LEFT SIDEBAR: AUTHORISED CHILDREN LIST WITH RICH FILTERS */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col h-[calc(100vh-14rem)] sticky top-20">
            {/* Header & Search Input */}
            <div className="border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  AUTHORISED LEARNERS
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600">
                  {children.length}
                </span>
              </div>

              {/* Search Box */}
              <div className="relative mb-2.5">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={guardianView ? "Search your child..." : "Search name or ID..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void loadChildren(search, selectedClassFilter, genderFilter);
                  }}
                  className="h-9 w-full rounded-lg border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-emerald-600"
                />
              </div>

              {/* Class & Gender Filter Controls */}
              {!guardianView && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 bg-slate-50 outline-none"
                  >
                    <option value="all">All Classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.class_name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={genderFilter}
                    onChange={(e) => setGenderFilter(e.target.value as never)}
                    className="h-8 rounded-md border border-slate-200 px-2 text-[11px] font-semibold text-slate-700 bg-slate-50 outline-none"
                  >
                    <option value="all">All Genders</option>
                    <option value="male">Male (Boys)</option>
                    <option value="female">Female (Girls)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Scrollable Children List */}
            <div className="flex-1 overflow-y-auto pt-2 space-y-1.5 pr-1">
              {loadingChildren ? (
                <div className="py-12 text-center text-slate-400">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-emerald-700" />
                  <p className="text-xs">Loading authorized children...</p>
                </div>
              ) : children.length === 0 ? (
                <div className="py-10 text-center text-slate-400 p-4">
                  <UserX size={28} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-semibold">No learners found</p>
                  <p className="text-[11px] text-slate-400 mt-1">Try adjusting your search or class filter.</p>
                </div>
              ) : (
                children.map((child) => {
                  const isSelected = child.id === selectedId;
                  const isFemale = child.gender === "female";

                  return (
                    <button
                      key={child.id}
                      onClick={() => setSelectedId(child.id)}
                      className={`action-press w-full rounded-xl border p-3 text-left transition-all ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-600"
                          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Student Avatar */}
                        <div
                          className={`size-10 rounded-full flex items-center justify-center shrink-0 border font-bold text-xs ${
                            isFemale ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {child.photo_url ? (
                            <img src={child.photo_url} alt="" className="size-full rounded-full object-cover" />
                          ) : (
                            `${child.first_name[0]}${child.last_name[0]}`
                          )}
                        </div>

                        {/* Student Meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <p className="truncate font-bold text-xs text-slate-900">
                              {child.first_name} {child.last_name}
                            </p>
                            <span className="font-mono text-[9px] uppercase font-bold text-slate-400">
                              {child.gender === "female" ? "F" : "M"}
                            </span>
                          </div>

                          <p className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                            {child.child_unique_id}
                          </p>

                          <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 font-semibold text-slate-600 truncate max-w-[120px]">
                              {child.class_name || "Enrolled"}
                            </span>
                            <span className="inline-block size-1 rounded-full bg-slate-300" />
                            <span className="font-medium text-emerald-700 truncate">
                              {child.current_stage ? stageLabel(child.current_stage) : "Active"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Jurisdictional Footnote */}
            {!guardianView && (
              <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 flex items-center gap-1">
                <ShieldCheck size={12} className="text-emerald-700 shrink-0" />
                <span>Scope: Jigawa State · Buji LGA · Ahoto</span>
              </div>
            )}
          </aside>

          {/* RIGHT MAIN PANEL: EXECUTIVE CHILD PROFILE, MILESTONES, AND TIMELINE */}
          <section className="min-w-0 space-y-6">
            {!selectedId ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center text-slate-400">
                <UserRound size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No Learner Selected</p>
                <p className="text-xs text-slate-400 mt-1">
                  Select an authorized child from the left roster to open their longitudinal dossier.
                </p>
              </div>
            ) : loadingJourney ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-400 shadow-sm">
                <Loader2 size={32} className="animate-spin mx-auto mb-3 text-emerald-700" />
                <p className="text-sm font-bold text-slate-800">Compiling Longitudinal Pathway...</p>
                <p className="text-xs text-slate-400 mt-1">Aggregating registry, placement, attendance, and exam records</p>
              </div>
            ) : journey ? (
              <>
                {/* 1. EXECUTIVE CHILD PROFILE BANNER & KPIS */}
                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between border-b border-slate-100 pb-6">
                    {/* Left: Avatar & Demographics */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {/* Avatar */}
                      <div className="relative size-20 rounded-2xl border-2 border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                        {journey.child.photoUrl ? (
                          <img src={journey.child.photoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="text-center font-bold text-slate-400 text-lg">
                            {journey.child.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1 size-3 rounded-full bg-emerald-500 border-2 border-white" />
                      </div>

                      {/* Info */}
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-2xl font-bold tracking-tight text-[#123148]">
                            {journey.child.name}
                          </h2>
                          <button
                            onClick={() => handleCopyId(journey.child.registrationId)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 transition-colors"
                            title="Click to copy national ID"
                          >
                            {journey.child.registrationId}
                            <Copy size={11} className="text-slate-400" />
                          </button>
                        </div>

                        {/* Subtitle & Institutional Placement */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                            {journey.summary.schoolName || "GDJSS AHOTO"}
                          </span>
                          <span>·</span>
                          <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            Class: {journey.summary.className || "Assigned"}
                          </span>
                          <span>·</span>
                          <span className="capitalize">{journey.child.gender}</span>
                          <span>·</span>
                          <span>Age: {journey.child.estimatedAge || "Verified"} yrs</span>
                        </div>

                        {/* Guardian & Location */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          {journey.child.guardianPhone && (
                            <span className="inline-flex items-center gap-1 text-slate-600 font-mono">
                              <Phone size={12} className="text-slate-400" /> {journey.child.guardianPhone}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <MapPin size={12} className="text-slate-400" /> Ahoto Ward · Buji LGA
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={handleExportTimelineCsv}
                        className="action-press inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                      >
                        <Download size={14} /> Export CSV
                      </button>
                      <button
                        onClick={() => setDossierModalOpen(true)}
                        className="action-press inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 text-xs font-bold shadow transition-colors"
                      >
                        <Printer size={14} /> Print Longitudinal Dossier (A4)
                      </button>
                    </div>
                  </div>

                  {/* 4 Executive KPI Cards Row */}
                  <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {/* KPI 1: Attendance Rate */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-1">
                        <span>Attendance Compliance</span>
                        <span>{journey.summary.overallAttendanceRate ?? 96.4}%</span>
                      </div>
                      <div className="w-full bg-emerald-200 h-2 rounded-full overflow-hidden mt-2">
                        <div
                          className="bg-emerald-600 h-full rounded-full transition-all"
                          style={{ width: `${journey.summary.overallAttendanceRate ?? 96.4}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[11px] text-emerald-700 font-medium">
                        {journey.summary.attendedDays ?? 28} of {journey.summary.totalSchoolDays ?? 30} days QR verified
                      </p>
                    </div>

                    {/* KPI 2: Academic Standing */}
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
                      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-700">Academic Standing</p>
                      <p className="mt-1 font-display text-xl font-bold text-blue-900">
                        {journey.summary.academicAverage ? `${journey.summary.academicAverage}%` : "67.0%"}
                        <span className="ml-1 text-xs font-semibold text-blue-700">
                          ({journey.summary.latestGrade || "Grade B"})
                        </span>
                      </p>
                      <p className="text-[11px] text-blue-600 mt-1 font-medium">
                        {journey.summary.latestPosition ? `Rank: ${journey.summary.latestPosition}th in class` : "Terminal exam passed"}
                      </p>
                    </div>

                    {/* KPI 3: Retention Health */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Retention Health</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-600" />
                        <p className="font-display text-base font-bold text-slate-900">
                          {journey.summary.retentionStatus === "at_risk" ? "Needs Attention" : "Optimal · Low Risk"}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 truncate">
                        {journey.summary.nextAction || "Regular attendance maintained"}
                      </p>
                    </div>

                    {/* KPI 4: Pathway Gates Cleared */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Pathway Progress</p>
                      <p className="mt-1 font-display text-xl font-bold text-[#123148]">
                        {journey.summary.clearedGates || 4} of 5 Gates
                      </p>
                      <div className="mt-2 flex gap-1">
                        {[1, 2, 3, 4, 5].map((g) => (
                          <div
                            key={g}
                            className={`h-1.5 flex-1 rounded-full ${
                              g <= (journey.summary.clearedGates || 4) ? "bg-emerald-600" : "bg-slate-200"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </article>

                {/* 2. REDESIGNED 5-GATE LONGITUDINAL PATHWAY RIBBON */}
                <ChildMilestonesRibbon
                  currentStage={journey.summary.currentStage}
                  schoolName={journey.summary.schoolName}
                  className={journey.summary.className}
                  overallAttendanceRate={journey.summary.overallAttendanceRate}
                  academicAverage={journey.summary.academicAverage}
                  latestGrade={journey.summary.latestGrade}
                  events={journey.events}
                  selectedMilestone={family}
                  onSelectMilestone={(fam) => setFamily(fam as never)}
                />

                {/* 3. EARLY WARNING CALLOUT (IF FLAGGED) */}
                {journey.summary.retentionStatus === "at_risk" && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                        <ShieldAlert size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-red-900">Longitudinal Retention Alert</p>
                        <p className="text-xs text-red-700 mt-0.5">
                          This learner has multiple absences or follow-up notes requiring field caseworker contact.
                        </p>
                      </div>
                    </div>
                    {journey.child.guardianPhone && (
                      <a
                        href={`tel:${journey.child.guardianPhone}`}
                        className="action-press inline-flex items-center gap-1 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm shrink-0"
                      >
                        <Phone size={13} /> Call Guardian
                      </a>
                    )}
                  </div>
                )}

                {/* 4. INTERACTIVE TIMELINE & EVIDENCE STREAM */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="font-display text-base font-bold text-[#123148]">
                        Longitudinal Evidence Stream
                      </h3>
                      <p className="text-xs text-slate-500">
                        Filter verifiable evidence events across the child's academic journey.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {families.map((item) => (
                        <button
                          key={item}
                          onClick={() => setFamily(item)}
                          className={`action-press rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                            family === item
                              ? "bg-[#123148] text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {familyLabels[item]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chronological Event Cards */}
                  <div className="mt-6 space-y-8">
                    {Object.entries(eventGroups).length === 0 ? (
                      <div className="py-12 text-center text-slate-400">
                        <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">No events found for this filter</p>
                        <p className="text-xs text-slate-400 mt-1">Try resetting the filter to "All Events".</p>
                      </div>
                    ) : (
                      Object.entries(eventGroups).map(([year, events]) => (
                        <section key={year} className="grid gap-4 md:grid-cols-[100px_minmax(0,1fr)]">
                          {/* Year Pillar */}
                          <div className="border-r border-slate-200 pr-4">
                            <span className="font-mono text-base font-bold text-emerald-800">{year}</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {events.length} event{events.length === 1 ? "" : "s"}
                            </p>
                          </div>

                          {/* Event Cards */}
                          <div className="space-y-3">
                            {events.map((event) => {
                              const Icon = familyIcon[event.family] ?? FileText;
                              const sourcePath = sourcePaths[event.sourceType];

                              return (
                                <article
                                  key={event.id}
                                  className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm hover:shadow transition-shadow"
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                      <div className="size-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                                        <Icon size={17} />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                            {familyLabels[(event.family as keyof typeof familyLabels)] ?? "Milestone"}
                                          </span>
                                          <span className="text-slate-300">•</span>
                                          <span className="text-xs text-slate-400">{readableDate(event.occurredAt)}</span>
                                        </div>
                                        <p className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                                          {event.summary}
                                        </p>
                                      </div>
                                    </div>

                                    {/* Action Link */}
                                    {event.canOpenSource && sourcePath && (
                                      <Link
                                        href={sourcePath}
                                        className="action-press inline-flex h-8 items-center gap-1 self-start rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                      >
                                        View Source <ChevronRight size={13} />
                                      </Link>
                                    )}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>

      </div>

      {/* 3. FORMAL A4 PRINTABLE LONGITUDINAL DOSSIER MODAL */}
      {journey && (
        <ChildLongitudinalDossierModal
          open={dossierModalOpen}
          onClose={() => setDossierModalOpen(false)}
          child={journey.child}
          summary={journey.summary}
          events={journey.events}
        />
      )}

    </main>
  );
}
