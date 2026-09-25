/* AM2050 — Universal Basic Education Attendance Management System
   Daily Classroom Roll-Call, Rapid QR Burst Scanning, and Official UBEC Monthly Registers. */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Calendar,
  CalendarCheck2,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  Info,
  Layers,
  Lock,
  MessageSquare,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Role } from "@/lib/access";
import AttendanceQrScanner, { ScanResult } from "@/components/school/AttendanceQrScanner";
import { ClassroomAttendancePosterModal } from "@/components/school/ClassroomAttendancePosterModal";

// --- TYPES ---
type School = { id: string; school_name: string; school_id?: string; ward_id?: string };
type SchoolClass = { id: string; class_name: string; class_level: string; school_id: string; teacher_id?: string | null };
type Enrollment = {
  id: string;
  child_id: string;
  school_id: string;
  class_id: string | null;
  class_level: string;
  enrollment_status: string;
  child_unique_id: string;
  first_name: string;
  last_name: string;
  gender?: string;
  school_name: string;
  class_name?: string;
  guardian_phone?: string;
};

type AttendanceStatus = "present" | "late" | "absent" | "excused";

type AttendanceRecord = {
  id: string;
  child_id: string;
  school_id: string;
  class_id: string | null;
  date: string;
  attendance_status: AttendanceStatus;
  notes?: string | null;
  scanned_by?: string | null;
  recorded_by?: string | null;
  created_at?: string;
  first_name?: string;
  last_name?: string;
  child_unique_id?: string;
  gender?: string;
  class_name?: string;
  recorded_by_name?: string;
};

type MatrixStudentRow = {
  student: {
    child_id: string;
    child_unique_id: string;
    first_name: string;
    last_name: string;
    gender: string;
    photo_url?: string;
  };
  attendance: Record<string, { status: AttendanceStatus; notes?: string } | null>;
  summary: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    totalRecorded: number;
    attendanceRate: number;
    isChronic: boolean;
  };
};

type AttendanceStatsResponse = {
  date: string;
  totalEnrolled: number;
  totalMarked: number;
  rate: number;
  counts: { present: number; late: number; absent: number; excused: number };
  gender: {
    male: { present: number; absent: number; rate: number };
    female: { present: number; absent: number; rate: number };
  };
  chronicWarnings: Array<{
    id: string;
    child_unique_id: string;
    first_name: string;
    last_name: string;
    gender: string;
    guardian_phone?: string;
    class_name?: string;
    absent_count: number;
    total_days: number;
  }>;
};

const today = () => new Date().toISOString().slice(0, 10);
const currentMonthStr = () => new Date().toISOString().slice(0, 7);

export default function Attendance({ role }: { role: Role }) {
  const { user } = useAuth();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"roster" | "matrix" | "analytics" | "audit">("roster");

  // Global Context & Scoping
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab 1: Daily Class Roll-Call Roster
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [rosterDraft, setRosterDraft] = useState<
    Record<string, { status: AttendanceStatus; notes: string; isDirty?: boolean }>
  >({});
  const [savingRoster, setSavingRoster] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);

  // Tab 2: Monthly Attendance Register Matrix
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr());
  const [matrixData, setMatrixData] = useState<{
    class: { class_name: string; class_level: string; school_name: string; teacher_name?: string };
    month: string;
    startDate: string;
    endDate: string;
    schoolDays: string[];
    students: MatrixStudentRow[];
  } | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  // Tab 3: Attendance Analytics & Early Warnings
  const [statsData, setStatsData] = useState<AttendanceStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Tab 4: Historical Audit Records
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilterStatus, setAuditFilterStatus] = useState<string>("all");

  // Poster Modal
  const [posterOpen, setPosterOpen] = useState(false);

  const isHeadmaster = role === "headmaster" || role === "super_admin" || role === "program_admin";

  // 1. Initial Load of Schools, Classes, and Enrollments
  const loadInitialContext = useCallback(async () => {
    setLoading(true);
    try {
      const [schoolRes, classRes, enrRes] = await Promise.all([
        apiClient.request<School[]>("/schools?limit=250"),
        apiClient.request<SchoolClass[]>("/classes?limit=250"),
        apiClient.request<Enrollment[]>("/enrollments?limit=400"),
      ]);

      if (schoolRes.success && schoolRes.data.length > 0) {
        setSchools(schoolRes.data);
        if (!selectedSchoolId) {
          const initialSchool = schoolRes.data[0];
          setSelectedSchoolId(initialSchool.id);
        }
      }

      if (classRes.success && classRes.data.length > 0) {
        setClasses(classRes.data);
        if (!selectedClassId) {
          const myClass = classRes.data.find((c) => c.teacher_id === user?.id) || classRes.data[0];
          setSelectedClassId(myClass.id);
        }
      }

      if (enrRes.success) {
        setEnrollments(enrRes.data);
      }
    } catch {
      toast.error("Failed to load school context.");
    } finally {
      setLoading(false);
    }
  }, [user, selectedSchoolId, selectedClassId]);

  useEffect(() => {
    void loadInitialContext();
  }, [loadInitialContext]);

  // Active students for currently selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return enrollments.filter(
      (e) => e.class_id === selectedClassId && e.enrollment_status === "active"
    );
  }, [enrollments, selectedClassId]);

  // Available classes for selected school
  const filteredClasses = useMemo(() => {
    if (!selectedSchoolId || selectedSchoolId === "all") return classes;
    return classes.filter((c) => c.school_id === selectedSchoolId);
  }, [classes, selectedSchoolId]);

  // Active class entity
  const currentClassInfo = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Active school entity
  const currentSchoolInfo = useMemo(() => {
    return schools.find((s) => s.id === selectedSchoolId);
  }, [schools, selectedSchoolId]);

  // 2. Fetch Daily Attendance Records for Roster Tab
  const fetchRosterAttendance = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    try {
      const res = await apiClient.request<AttendanceRecord[]>(
        `/attendance?class_id=${selectedClassId}&date=${selectedDate}&limit=300`
      );

      const draftMap: Record<string, { status: AttendanceStatus; notes: string; isDirty?: boolean }> = {};
      const existing = res.success ? res.data : [];

      classStudents.forEach((stu) => {
        const found = existing.find((r) => r.child_id === stu.child_id);
        draftMap[stu.child_id] = {
          status: found ? found.attendance_status : "present",
          notes: found?.notes || "",
          isDirty: false,
        };
      });

      setRosterDraft(draftMap);
    } catch {
      toast.error("Could not sync class attendance records.");
    }
  }, [selectedClassId, selectedDate, classStudents]);

  useEffect(() => {
    if (activeTab === "roster") {
      void fetchRosterAttendance();
    }
  }, [activeTab, fetchRosterAttendance]);

  // 3. Fetch Monthly Matrix
  const fetchMatrix = useCallback(async () => {
    if (!selectedClassId || !selectedMonth) return;
    setLoadingMatrix(true);
    try {
      const res = await apiClient.request<any>(
        `/attendance/matrix?class_id=${selectedClassId}&month=${selectedMonth}`
      );
      if (res.success) {
        setMatrixData(res.data);
      } else {
        toast.error(res.error || "Failed to load monthly register.");
      }
    } catch {
      toast.error("An error occurred loading monthly attendance matrix.");
    } finally {
      setLoadingMatrix(false);
    }
  }, [selectedClassId, selectedMonth]);

  useEffect(() => {
    if (activeTab === "matrix") {
      void fetchMatrix();
    }
  }, [activeTab, fetchMatrix]);

  // 4. Fetch Attendance Stats & Chronic Warnings
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.append("class_id", selectedClassId);
      else if (selectedSchoolId) params.append("school_id", selectedSchoolId);
      if (selectedDate) params.append("date", selectedDate);

      const res = await apiClient.request<AttendanceStatsResponse>(
        `/attendance/stats?${params.toString()}`
      );
      if (res.success) {
        setStatsData(res.data);
      }
    } catch {
      toast.error("Failed to load attendance analytics.");
    } finally {
      setLoadingStats(false);
    }
  }, [selectedClassId, selectedSchoolId, selectedDate]);

  useEffect(() => {
    if (activeTab === "analytics" || activeTab === "roster") {
      void fetchStats();
    }
  }, [activeTab, fetchStats]);

  // 5. Fetch Audit Raw Ledger
  const fetchAuditRecords = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.append("class_id", selectedClassId);
      if (selectedDate) params.append("date", selectedDate);
      params.append("limit", "200");

      const res = await apiClient.request<AttendanceRecord[]>(`/attendance?${params.toString()}`);
      if (res.success) {
        setRecords(res.data);
      }
    } catch {
      toast.error("Failed to load attendance logs.");
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (activeTab === "audit") {
      void fetchAuditRecords();
    }
  }, [activeTab, fetchAuditRecords]);

  // Quick Action: Mark All Present
  const handleMarkAllPresent = () => {
    setRosterDraft((prev) => {
      const updated = { ...prev };
      classStudents.forEach((stu) => {
        updated[stu.child_id] = {
          status: "present",
          notes: "",
          isDirty: true,
        };
      });
      return updated;
    });
    toast.success(`Marked all ${classStudents.length} learners as Present.`);
  };

  // Quick Action: Set Single Learner Status
  const handleSetStatus = (childId: string, status: AttendanceStatus) => {
    setRosterDraft((prev) => ({
      ...prev,
      [childId]: {
        ...(prev[childId] || { notes: "" }),
        status,
        isDirty: true,
      },
    }));
  };

  // Quick Action: Update Note
  const handleUpdateNote = (childId: string, notes: string) => {
    setRosterDraft((prev) => ({
      ...prev,
      [childId]: {
        ...(prev[childId] || { status: "present" }),
        notes,
        isDirty: true,
      },
    }));
  };

  // Save Daily Class Register (Batch)
  const handleSaveDailyRegister = async () => {
    if (!selectedClassId || !selectedDate) {
      toast.error("Please ensure class and date are selected.");
      return;
    }
    const targetSchoolId = currentClassInfo?.school_id || selectedSchoolId;
    if (!targetSchoolId) {
      toast.error("School ID is missing.");
      return;
    }

    const recordsToSave = classStudents.map((stu) => {
      const draft = rosterDraft[stu.child_id] || { status: "present", notes: "" };
      return {
        childId: stu.child_id,
        status: draft.status,
        notes: draft.notes || null,
      };
    });

    if (recordsToSave.length === 0) {
      toast.error("No enrolled students in this class to record.");
      return;
    }

    setSavingRoster(true);
    try {
      const res = await apiClient.request<{ savedCount: number }>("/attendance/batch", {
        method: "POST",
        body: {
          schoolId: targetSchoolId,
          classId: selectedClassId,
          date: selectedDate,
          records: recordsToSave,
        },
      });

      if (res.success) {
        toast.success(`Class register saved successfully (${res.data.savedCount} records recorded).`);
        await Promise.all([fetchRosterAttendance(), fetchStats()]);
      } else {
        toast.error(res.error || "Failed to save attendance register.");
      }
    } catch {
      toast.error("An error occurred while saving the attendance register.");
    } finally {
      setSavingRoster(false);
    }
  };

  // Continuous Burst QR Scan Token Handler
  const handleScanToken = async (qrToken: string): Promise<ScanResult> => {
    try {
      const res = await apiClient.request<AttendanceRecord>("/attendance/scan", {
        method: "POST",
        body: {
          qrToken,
          date: selectedDate,
          schoolId: currentClassInfo?.school_id || selectedSchoolId,
          classId: selectedClassId || undefined,
          attendanceStatus: "present",
        },
      });

      if (res.success) {
        const matched = enrollments.find((e) => e.child_id === res.data.child_id);
        const name = matched ? `${matched.first_name} ${matched.last_name}` : "Student";
        // Update local roster draft immediately
        setRosterDraft((prev) => ({
          ...prev,
          [res.data.child_id]: { status: "present", notes: "Verified via Burst Scanner", isDirty: false },
        }));
        return {
          success: true,
          childName: name,
          message: `${name} marked Present`,
        };
      } else {
        return {
          success: false,
          message: res.error || "QR token verification failed",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Network error during scan",
      };
    }
  };

  // Export Monthly Register to CSV
  const handleExportMatrixCSV = () => {
    if (!matrixData) return;
    const daysHeaders = matrixData.schoolDays.map((d) => d.slice(8));
    const headerRow = ["S/N", "Learner Name", "Learner ID", "Gender", ...daysHeaders, "Present", "Absent", "Rate %"];
    const rows = matrixData.students.map((row, idx) => {
      const daysStatuses = matrixData.schoolDays.map((d) => {
        const item = row.attendance[d];
        if (!item) return "-";
        return item.status.charAt(0).toUpperCase();
      });
      return [
        idx + 1,
        `"${row.student.last_name}, ${row.student.first_name}"`,
        row.student.child_unique_id,
        row.student.gender,
        ...daysStatuses,
        row.summary.present,
        row.summary.absent,
        `${row.summary.attendanceRate}%`,
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headerRow.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Register_${matrixData.class.class_name}_${matrixData.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Roster summary counts
  const rosterSummary = useMemo(() => {
    let p = 0; let l = 0; let a = 0; let e = 0;
    classStudents.forEach((stu) => {
      const st = rosterDraft[stu.child_id]?.status || "present";
      if (st === "present") p++;
      else if (st === "late") l++;
      else if (st === "absent") a++;
      else if (st === "excused") e++;
    });
    const total = classStudents.length;
    const rate = total > 0 ? Math.round(((p + l) / total) * 1000) / 10 : 100;
    return { present: p, late: l, absent: a, excused: e, total, rate };
  }, [classStudents, rosterDraft]);

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      {/* 0. Print-specific styles for A4 Landscape Register */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              #root, header, nav, .no-print {
                display: none !important;
              }
              #printable-monthly-register {
                display: block !important;
                position: static !important;
                width: 100% !important;
                background: #ffffff !important;
                color: #0f172a !important;
              }
              @page {
                size: A4 landscape;
                margin: 6mm;
              }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-[1440px] space-y-6">

        {/* 1. TOP HEADER & OPERATIONAL CONTEXT BANNER */}
        <header className="rounded-2xl border border-[#cfd9d2] bg-white p-5 sm:p-6 shadow-sm no-print">
          {/* Top Context & Breadcrumb Line */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 mb-4 text-xs font-semibold text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">Operations</span>
              <span>/</span>
              <span className="text-slate-800 font-bold">Student Attendance Register</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                <ShieldCheck size={12} className="text-emerald-700" />
                UBEC Jigawa Pilot Certified
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Jurisdiction:</span>
              <strong className="text-slate-900">Jigawa State · Buji LGA · Ahoto Ward</strong>
            </div>
          </div>

          {/* Main Title and Action Toolbar Row */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#123148] sm:text-3xl">
                Student Attendance Management & Register
              </h1>
              <p className="mt-1 text-sm text-[#57707f]">
                Daily Homeroom Roll-Call (Once Daily), Rapid QR Burst Scanning, and Official UBEC Monthly Registers.
              </p>
            </div>

            {/* Unified Action Button Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Rapid Burst Scanner Modal Button */}
              <button
                onClick={() => setQrScannerOpen(true)}
                className="action-press inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 text-xs font-bold shadow transition-colors"
              >
                <QrCode size={15} />
                <span>Burst QR Scanner</span>
              </button>

              {/* Printable Roll-Call Poster */}
              <button
                onClick={() => setPosterOpen(true)}
                className="action-press inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3.5 text-xs font-bold shadow-sm transition-colors"
              >
                <Printer size={14} className="text-slate-600" />
                <span>Roll-Call Poster</span>
              </button>

              {/* Refresh */}
              <button
                onClick={() => {
                  void loadInitialContext();
                  if (activeTab === "roster") void fetchRosterAttendance();
                  if (activeTab === "matrix") void fetchMatrix();
                  if (activeTab === "analytics") void fetchStats();
                }}
                disabled={loading}
                className="action-press inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
                title="Refresh Attendance Data"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </header>

        {/* 2. FILTER & CONTEXT SELECTOR CARD */}
        <section className="rounded-xl border border-[#d8e0da] bg-white p-4 shadow-sm no-print">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* School Selector (Only selectable for Admin / HM if multiple) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Institutional School
              </label>
              <select
                value={selectedSchoolId}
                onChange={(e) => setSelectedSchoolId(e.target.value)}
                className="field-input field-select w-full font-bold text-slate-800"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.school_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Class Selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Class / Arm
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="field-input field-select w-full font-bold text-slate-800"
              >
                {filteredClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.class_name} ({cls.class_level})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Selector (for Daily Roll-Call & Stats) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Attendance Date (Roll-Call)
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="field-input w-full font-mono text-xs font-semibold"
              />
            </div>

            {/* Month Selector (for Monthly Matrix Register) */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Register Month (Matrix)
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="field-input w-full font-mono text-xs font-semibold"
              />
            </div>
          </div>
        </section>

        {/* 3. EXECUTIVE KPI METRICS BAR */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 no-print">
          {/* Rate */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-emerald-800 block">Class Daily Rate</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-2xl font-black text-emerald-900">{rosterSummary.rate}%</span>
              <span className="text-[10px] text-emerald-700 font-semibold">attendance</span>
            </div>
          </div>

          {/* Present */}
          <div className="rounded-xl border border-[#d8e0da] bg-white p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Present Today</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-2xl font-black text-emerald-700">{rosterSummary.present}</span>
              <span className="text-[10px] text-slate-400">/ {rosterSummary.total} enrolled</span>
            </div>
          </div>

          {/* Late */}
          <div className="rounded-xl border border-[#d8e0da] bg-white p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Late Arrival</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-2xl font-black text-amber-700">{rosterSummary.late}</span>
              <span className="text-[10px] text-slate-400">learners</span>
            </div>
          </div>

          {/* Absent */}
          <div className="rounded-xl border border-[#d8e0da] bg-white p-3.5 shadow-sm">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Absent</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-2xl font-black text-rose-700">{rosterSummary.absent}</span>
              <span className="text-[10px] text-slate-400">unexcused</span>
            </div>
          </div>

          {/* Chronic Warnings */}
          <div className="rounded-xl border border-[#d8e0da] bg-white p-3.5 shadow-sm col-span-2 lg:col-span-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Chronic Absence Flag</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-mono text-2xl font-black text-rose-800">
                {statsData?.chronicWarnings?.length ?? 0}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">at risk (14d)</span>
            </div>
          </div>
        </section>

        {/* 4. NAVIGATION TABS */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#cfd9d2] no-print">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab("roster")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "roster"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <ClipboardCheck size={16} />
              <span>Daily Class Roll-Call</span>
            </button>

            <button
              onClick={() => setActiveTab("matrix")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "matrix"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <FileSpreadsheet size={16} />
              <span>Monthly Attendance Register</span>
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "analytics"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <TrendingUp size={16} />
              <span>School Analytics & Early Warning</span>
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "audit"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <Clock size={16} />
              <span>Historical Log</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: DAILY CLASS ROLL-CALL ROSTER                      */}
        {/* ========================================================= */}
        {activeTab === "roster" && (
          <section className="space-y-4 no-print">
            {/* Quick Roster Actions Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#d8e0da] shadow-sm">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-800">
                  {currentClassInfo?.class_name || "Active Class"} Roster:
                </span>
                <span className="text-slate-500 font-mono">
                  {selectedDate} ({classStudents.length} Learners)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="action-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors"
                >
                  <CheckCheck size={14} />
                  <span>Mark All Present</span>
                </button>

                <button
                  type="button"
                  disabled={savingRoster}
                  onClick={handleSaveDailyRegister}
                  className="action-press inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  <ClipboardCheck size={15} />
                  <span>{savingRoster ? "Saving Register..." : "Save Daily Register"}</span>
                </button>
              </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-hidden rounded-xl border border-[#d8e0da] bg-white shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                    <th className="py-2.5 px-3 w-10 text-center">S/N</th>
                    <th className="py-2.5 px-3">Enrolled Learner</th>
                    <th className="py-2.5 px-3 w-24 text-center">Gender</th>
                    <th className="py-2.5 px-3 w-72 text-center">Roll-Call Status</th>
                    <th className="py-2.5 px-3">Absence Reason / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        No enrolled students found for the selected class.
                      </td>
                    </tr>
                  ) : (
                    classStudents.map((stu, idx) => {
                      const draft = rosterDraft[stu.child_id] || { status: "present", notes: "" };
                      const currentStatus = draft.status;
                      return (
                        <tr
                          key={stu.child_id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            currentStatus === "absent" ? "bg-rose-50/30" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 text-sm">
                              {stu.last_name}, {stu.first_name}
                            </div>
                            <div className="font-mono text-[10px] text-emerald-800 uppercase tracking-tight">
                              ID: {stu.child_unique_id}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center capitalize font-semibold text-slate-600">
                            {stu.gender || "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-1">
                              {/* Present */}
                              <button
                                type="button"
                                onClick={() => handleSetStatus(stu.child_id, "present")}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                  currentStatus === "present"
                                    ? "bg-emerald-700 text-white shadow-sm"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                                }`}
                              >
                                Present
                              </button>

                              {/* Late */}
                              <button
                                type="button"
                                onClick={() => handleSetStatus(stu.child_id, "late")}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                  currentStatus === "late"
                                    ? "bg-amber-600 text-white shadow-sm"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                                }`}
                              >
                                Late
                              </button>

                              {/* Absent */}
                              <button
                                type="button"
                                onClick={() => handleSetStatus(stu.child_id, "absent")}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                  currentStatus === "absent"
                                    ? "bg-rose-700 text-white shadow-sm"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                                }`}
                              >
                                Absent
                              </button>

                              {/* Excused */}
                              <button
                                type="button"
                                onClick={() => handleSetStatus(stu.child_id, "excused")}
                                className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                                  currentStatus === "excused"
                                    ? "bg-blue-700 text-white shadow-sm"
                                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                                }`}
                              >
                                Excused
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                placeholder={
                                  currentStatus === "absent" || currentStatus === "late"
                                    ? "Reason e.g. Illness, farm labour..."
                                    : "Optional note..."
                                }
                                value={draft.notes}
                                onChange={(e) => handleUpdateNote(stu.child_id, e.target.value)}
                                className="field-input !py-1 text-xs w-full"
                              />
                              {(currentStatus === "absent" || currentStatus === "late") && (
                                <div className="hidden sm:flex gap-1">
                                  {["Illness", "Farm", "Rain"].map((chip) => (
                                    <button
                                      key={chip}
                                      type="button"
                                      onClick={() => handleUpdateNote(stu.child_id, chip)}
                                      className="text-[9px] bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200"
                                    >
                                      {chip}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Roster Bottom Sticky Save Bar */}
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  Daily Roll-Call for <strong className="text-slate-800">{currentClassInfo?.class_name}</strong> on <span className="font-mono text-emerald-800 font-bold">{selectedDate}</span>.
                </div>
                <button
                  type="button"
                  disabled={savingRoster}
                  onClick={handleSaveDailyRegister}
                  className="action-press inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  <ClipboardCheck size={16} />
                  <span>{savingRoster ? "Saving Register..." : "Save Daily Register"}</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MONTHLY ATTENDANCE REGISTER MATRIX                 */}
        {/* ========================================================= */}
        {activeTab === "matrix" && (
          <section className="space-y-4">
            {/* Matrix Control Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#d8e0da] shadow-sm no-print">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  UBEC Monthly Attendance Register Matrix
                </h3>
                <p className="text-xs text-slate-500">
                  {matrixData?.class.school_name || "GDJSS Ahoto"} · {matrixData?.class.class_name || "Class"} · Month: {selectedMonth}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="action-press inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  <Printer size={15} />
                  <span>Print Official Register (A4 Landscape)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMatrixCSV}
                  className="action-press inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-sm transition-colors"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Matrix Calendar Table */}
            <div id="printable-monthly-register" className="overflow-x-auto rounded-xl border border-[#d8e0da] bg-white shadow-sm p-4">
              {/* Header block for A4 Print */}
              <div className="hidden print:block border-b-2 border-emerald-800 pb-3 mb-3 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-600">
                  Federal Republic of Nigeria • State Universal Basic Education Board (SUBEB Jigawa)
                </div>
                <h2 className="text-xl font-black uppercase text-emerald-900">
                  {matrixData?.class.school_name || "GOVERNMENT DAY JUNIOR SECONDARY SCHOOL AHOTO"}
                </h2>
                <div className="text-xs font-semibold text-slate-700 mt-0.5">
                  Official Class Attendance Register · Class: <span className="font-bold">{matrixData?.class.class_name}</span> · Month: <span className="font-bold">{matrixData?.month}</span> · Form Master: <span className="font-bold">{matrixData?.class.teacher_name || "Suleiman Ibrahim"}</span>
                </div>
              </div>

              {loadingMatrix ? (
                <div className="py-16 text-center text-slate-500 text-xs font-semibold">
                  <RefreshCw className="animate-spin w-6 h-6 mx-auto mb-2 text-emerald-700" />
                  Generating full monthly attendance calendar grid...
                </div>
              ) : !matrixData || matrixData.students.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No attendance records found for this class and month.
                </div>
              ) : (
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-extrabold text-[10px]">
                      <th className="py-2 px-2 border-r border-slate-300 w-8 text-center">S/N</th>
                      <th className="py-2 px-2.5 border-r border-slate-300 min-w-[150px]">Learner Full Name</th>
                      <th className="py-2 px-2 border-r border-slate-300 w-12 text-center">Gender</th>
                      {matrixData.schoolDays.map((day) => (
                        <th key={day} className="py-1 px-1 border-r border-slate-300 text-center w-7">
                          <span className="block font-mono text-[10px]">{day.slice(8)}</span>
                        </th>
                      ))}
                      <th className="py-2 px-2 border-r border-slate-300 text-center w-12 bg-emerald-50 text-emerald-900 font-bold">P</th>
                      <th className="py-2 px-2 border-r border-slate-300 text-center w-12 bg-amber-50 text-amber-900 font-bold">L</th>
                      <th className="py-2 px-2 border-r border-slate-300 text-center w-12 bg-rose-50 text-rose-900 font-bold">A</th>
                      <th className="py-2 px-2 border-r border-slate-300 text-center w-14 bg-slate-100 text-slate-900 font-bold">Rate %</th>
                      <th className="py-2 px-2 text-center w-20">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {matrixData.students.map((row, idx) => {
                      const sum = row.summary;
                      return (
                        <tr key={row.student.child_id} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-1.5 px-2.5 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                            {row.student.last_name}, {row.student.first_name}
                            <span className="block font-mono text-[9px] text-slate-400 font-normal">
                              {row.student.child_unique_id}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center capitalize text-slate-600 font-semibold">
                            {row.student.gender ? row.student.gender.charAt(0) : "—"}
                          </td>
                          {matrixData.schoolDays.map((day) => {
                            const rec = row.attendance[day];
                            if (!rec) {
                              return (
                                <td key={day} className="py-1 px-1 border-r border-slate-200 text-center text-slate-300">
                                  —
                                </td>
                              );
                            }
                            const st = rec.status;
                            const colorClass =
                              st === "present"
                                ? "bg-emerald-100 text-emerald-900 font-black"
                                : st === "late"
                                ? "bg-amber-100 text-amber-900 font-black"
                                : st === "absent"
                                ? "bg-rose-100 text-rose-900 font-black"
                                : "bg-blue-100 text-blue-900 font-black";
                            return (
                              <td key={day} className="py-1 px-1 border-r border-slate-200 text-center">
                                <span className={`inline-block w-5 h-5 leading-5 rounded text-[10px] ${colorClass}`} title={rec.notes || st}>
                                  {st.charAt(0).toUpperCase()}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-bold text-emerald-800 bg-emerald-50/40">
                            {sum.present}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-bold text-amber-800 bg-amber-50/40">
                            {sum.late}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-bold text-rose-800 bg-rose-50/40">
                            {sum.absent}
                          </td>
                          <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-black text-slate-900">
                            {sum.attendanceRate}%
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {sum.isChronic ? (
                              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-rose-100 text-rose-800">
                                <Flame size={10} /> At Risk
                              </span>
                            ) : sum.attendanceRate >= 85 ? (
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                Regular
                              </span>
                            ) : (
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700">
                                Moderate
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Footer signature block for A4 Print */}
              <div className="hidden print:flex items-center justify-between border-t border-slate-300 pt-4 mt-6 text-xs">
                <div>
                  <span className="font-serif italic font-bold text-slate-800">
                    {matrixData?.class.teacher_name || "Suleiman Ibrahim"}
                  </span>
                  <span className="text-slate-400 block text-[9px] uppercase">Form Master Certification Signature</span>
                </div>
                <div className="text-right">
                  <span className="font-serif italic font-bold text-slate-800">
                    Mallam Usman Bello Ahoto (HM)
                  </span>
                  <span className="text-slate-400 block text-[9px] uppercase">Headmaster Verification & Official Seal</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 3: SCHOOL ANALYTICS & EARLY WARNINGS                  */}
        {/* ========================================================= */}
        {activeTab === "analytics" && (
          <section className="space-y-6 no-print">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold uppercase text-slate-500">School Enrollment in Scope</span>
                <p className="font-mono text-3xl font-black text-slate-900 mt-2">
                  {statsData?.totalEnrolled ?? 0}
                </p>
                <span className="text-xs text-slate-400 mt-1 block">Active registered learners</span>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm">
                <span className="text-xs font-bold uppercase text-emerald-800">Today's Attendance Rate</span>
                <p className="font-mono text-3xl font-black text-emerald-900 mt-2">
                  {statsData?.rate ?? 0}%
                </p>
                <span className="text-xs text-emerald-700 mt-1 block">
                  {statsData?.counts.present ?? 0} present · {statsData?.counts.absent ?? 0} absent
                </span>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm">
                <span className="text-xs font-bold uppercase text-blue-900">Gender Parity (Rate %)</span>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Male Learners:</span>
                    <strong className="font-mono text-slate-900">{statsData?.gender.male.rate ?? 100}%</strong>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Female Learners:</span>
                    <strong className="font-mono text-slate-900">{statsData?.gender.female.rate ?? 100}%</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-5 shadow-sm">
                <span className="text-xs font-bold uppercase text-rose-900">Chronic Absenteeism Flag</span>
                <p className="font-mono text-3xl font-black text-rose-800 mt-2">
                  {statsData?.chronicWarnings.length ?? 0}
                </p>
                <span className="text-xs text-rose-700 mt-1 block">Require field intervention</span>
              </div>
            </div>

            {/* Chronic Absenteeism Early Warning List */}
            <div className="rounded-xl border border-[#d8e0da] bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-rose-600" />
                  <h3 className="font-bold text-slate-900 text-base">
                    Chronic Absenteeism Early Warning List (Past 14 Days)
                  </h3>
                </div>
                <span className="text-xs bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded-full">
                  Out-of-School Retention Watch
                </span>
              </div>
              <p className="text-xs text-slate-500">
                These learners have logged 2 or more unexcused absences within the last 14 school days. In accordance with the AM2050 education mandate, headmasters and community mobilizers should initiate guardian contact before dropout risks escalate.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                      <th className="py-2.5 px-3">Learner Name</th>
                      <th className="py-2.5 px-3">Unique ID</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3 text-center">Unexcused Absences</th>
                      <th className="py-2.5 px-3">Guardian Contact</th>
                      <th className="py-2.5 px-3 text-center">Retention Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!statsData || statsData.chronicWarnings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                          No chronic absenteeism alerts for this selection. All learners meet attendance benchmarks.
                        </td>
                      </tr>
                    ) : (
                      statsData.chronicWarnings.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {item.first_name} {item.last_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-800">
                            {item.child_unique_id}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {item.class_name || "Enrolled"}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-black text-rose-700">
                            {item.absent_count} absences
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-mono flex items-center gap-1.5">
                            <Phone size={13} className="text-slate-400" />
                            <span>{item.guardian_phone || "Not recorded"}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="inline-block px-2.5 py-1 bg-amber-100 text-amber-900 rounded font-bold text-[10px]">
                              Mobilizer Outreach
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* TAB 4: HISTORICAL AUDIT LOG                               */}
        {/* ========================================================= */}
        {activeTab === "audit" && (
          <section className="space-y-4 no-print">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#d8e0da] shadow-sm">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search child name, ID, or notes..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Filter Status:</span>
                <select
                  value={auditFilterStatus}
                  onChange={(e) => setAuditFilterStatus(e.target.value)}
                  className="field-input field-select text-xs font-semibold py-1.5"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present Only</option>
                  <option value="late">Late Only</option>
                  <option value="absent">Absent Only</option>
                  <option value="excused">Excused Only</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#d8e0da] bg-white shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold text-[11px]">
                    <th className="py-2.5 px-3">Learner</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Notes / Reason</th>
                    <th className="py-2.5 px-3">Recorded By</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No audit records match the current criteria.
                      </td>
                    </tr>
                  ) : (
                    records
                      .filter((r) => {
                        if (auditFilterStatus !== "all" && r.attendance_status !== auditFilterStatus) return false;
                        if (!auditSearch.trim()) return true;
                        const q = auditSearch.toLowerCase();
                        return (
                          (r.first_name && r.first_name.toLowerCase().includes(q)) ||
                          (r.last_name && r.last_name.toLowerCase().includes(q)) ||
                          (r.child_unique_id && r.child_unique_id.toLowerCase().includes(q)) ||
                          (r.notes && r.notes.toLowerCase().includes(q))
                        );
                      })
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">
                              {r.first_name || ""} {r.last_name || ""}
                            </div>
                            <div className="font-mono text-[10px] text-emerald-800">
                              {r.child_unique_id || r.child_id}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {r.class_name || "Class"}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {r.date}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded text-[11px] capitalize ${
                                r.attendance_status === "present"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.attendance_status === "late"
                                  ? "bg-amber-100 text-amber-800"
                                  : r.attendance_status === "absent"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {r.attendance_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 italic">
                            {r.notes || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {r.recorded_by_name || "Teacher / HM"}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                            {r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—"}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

      </div>

      {/* 5. MODALS */}

      {/* Rapid Continuous Burst Scanner Modal */}
      {qrScannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <QrCode size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Rapid Continuous Burst QR Scanner</h3>
                  <p className="text-xs text-slate-500">
                    Scan learner QR badges continuously. Verified audio-visual chime on check-in.
                  </p>
                </div>
              </div>
              <button onClick={() => setQrScannerOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <AttendanceQrScanner
              onToken={handleScanToken}
              disabled={false}
              schoolName={currentSchoolInfo?.school_name}
              className={currentClassInfo?.class_name}
            />

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setQrScannerOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg"
              >
                Close Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classroom Roll-Call Poster Modal */}
      {posterOpen && (
        <ClassroomAttendancePosterModal
          isOpen={posterOpen}
          onClose={() => setPosterOpen(false)}
          schoolName={currentSchoolInfo?.school_name || "GDJSS AHOTO"}
          className={currentClassInfo?.class_name || "JSS 1"}
          students={classStudents.map((s) => ({
            id: s.child_id,
            childCode: s.child_unique_id,
            fullName: `${s.first_name} ${s.last_name}`,
            attendanceToken: s.child_unique_id,
          }))}
        />
      )}
    </main>
  );
}
