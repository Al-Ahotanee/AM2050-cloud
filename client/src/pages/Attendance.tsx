/* AM2050 — Field Ledger Modernism: Strict QR-Driven Daily Attendance & Multi-Granularity Register Suite.
   Features:
   - STRICT QR ATTENDANCE: Recorded strictly via camera scan or image upload (NO manual "Present" clicks).
   - MULTI-GRANULARITY REGISTER: Filterable by Day, Week, Month, Term, and Year/Session.
   - 4-Tab Suite: 
     1. Daily QR Roll-Call (Camera Scanner & Multi-Image Upload Dropzone + Verified Daily Roster + Excuse Dialog).
     2. Official Register Matrix (Day/Week/Month/Term/Year switcher + A4 Landscape Printable Register + CSV Export).
     3. Analytics & Early Warning (KPIs, Gender Parity, Chronic Absenteeism Watchlist).
     4. Audit Log (Raw verified ledger).
*/

import { useState, useEffect, useMemo, useCallback, useRef, ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  GraduationCap,
  ImageUp,
  Loader2,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
  Zap,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  AlertCircle,
  FileText,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import QrScanner from "qr-scanner";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Role } from "@/types";
import { scanFeedback } from "@/utils/scanFeedback";

type AttendanceStatus = "present" | "absent" | "late" | "excused";
type Granularity = "day" | "week" | "month" | "term" | "year";

type School = { id: string; school_name: string; school_id: string };
type SchoolClass = { id: string; class_name: string; class_level: string; school_id: string; teacher_id?: string };
type Enrollment = {
  id: string;
  child_id: string;
  child_unique_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  attendance_qr_token?: string;
  school_id: string;
  class_id?: string;
  class_name?: string;
  enrollment_status: string;
  guardian_phone?: string;
};

type AttendanceRecord = {
  id: string;
  child_id: string;
  school_id: string;
  class_id?: string;
  date: string;
  attendance_status: AttendanceStatus;
  notes?: string;
  created_at: string;
  child_unique_id?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  photo_url?: string;
  guardian_phone?: string;
  school_name?: string;
  class_name?: string;
  recorded_by_name?: string;
};

type StudentMatrixRow = {
  student: {
    enrollment_id: string;
    child_id: string;
    child_unique_id: string;
    first_name: string;
    last_name: string;
    gender: string;
    photo_url?: string;
    attendance_qr_token?: string;
  };
  attendance: Record<string, { status: AttendanceStatus; notes?: string; scannedAt?: string; recordedByName?: string } | null>;
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

type MatrixData = {
  class: { class_name: string; class_level: string; school_name: string; teacher_name?: string };
  granularity: Granularity;
  periodLabel: string;
  startDate: string;
  endDate: string;
  schoolDays: string[];
  totalSchoolDays: number;
  students: StudentMatrixRow[];
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

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentMonthStr = () => new Date().toISOString().slice(0, 7);

const formatDisplayDate = (dStr: string) => {
  if (!dStr) return "";
  try {
    return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(dStr));
  } catch {
    return dStr;
  }
};

export default function Attendance({ role }: { role: Role }) {
  const { user } = useAuth();
  const isHeadmaster = role === "headmaster" || role === "super_admin" || role === "program_admin";

  // Tab State
  const [activeTab, setActiveTab] = useState<"rollcall" | "register" | "analytics" | "audit">("rollcall");

  // Global Context & Filter State
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  // Tab 1: Daily QR Roll-Call State
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRollCall, setLoadingRollCall] = useState(false);
  const [searchRoster, setSearchRoster] = useState("");
  const [rosterFilter, setRosterFilter] = useState<"all" | "scanned" | "unscanned" | "excused">("all");

  // QR Camera Scanner & Upload State
  const [cameraActive, setCameraActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<Array<{ id: string; name: string; time: string; status: string }>>([]);
  const [uploadingQrs, setUploadingQrs] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const recentTokensRef = useRef<Map<string, number>>(new Map());

  // Excuse Note Modal State
  const [excuseModalOpen, setExcuseModalOpen] = useState(false);
  const [selectedExcuseChild, setSelectedExcuseChild] = useState<Enrollment | null>(null);
  const [excuseReason, setExcuseReason] = useState("");
  const [savingExcuse, setSavingExcuse] = useState(false);

  // Tab 2: Multi-Granularity Register State
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [regDate, setRegDate] = useState<string>(todayStr());
  const [regMonth, setRegMonth] = useState<string>(currentMonthStr());
  const [regTerm, setRegTerm] = useState<string>("First Term");
  const [regAcademicYear, setRegAcademicYear] = useState<string>("2025/2026");
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [searchMatrix, setSearchMatrix] = useState("");
  const [matrixStatusFilter, setMatrixStatusFilter] = useState<"all" | "present" | "absent" | "excused">("all");

  // Tab 3: Analytics & Early Warning State
  const [statsData, setStatsData] = useState<AttendanceStatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Tab 4: Audit Ledger State
  const [auditRecords, setAuditRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilterStatus, setAuditFilterStatus] = useState<string>("all");

  // 1. Initial Load of Schools, Classes, and Active Enrollments
  const loadInitialContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const [schoolRes, classRes, enrRes] = await Promise.all([
        apiClient.request<School[]>("/schools?limit=250"),
        apiClient.request<SchoolClass[]>("/classes?limit=250"),
        apiClient.request<Enrollment[]>("/enrollments?limit=400"),
      ]);

      if (schoolRes.success && schoolRes.data.length > 0) {
        setSchools(schoolRes.data);
        if (!selectedSchoolId) {
          setSelectedSchoolId(schoolRes.data[0].id);
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
      setLoadingContext(false);
    }
  }, [user, selectedSchoolId, selectedClassId]);

  useEffect(() => {
    void loadInitialContext();
  }, [loadInitialContext]);

  // Filtered classes for current school
  const filteredClasses = useMemo(() => {
    if (!selectedSchoolId || selectedSchoolId === "all") return classes;
    return classes.filter((c) => c.school_id === selectedSchoolId);
  }, [classes, selectedSchoolId]);

  // Active class entity
  const currentClassInfo = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  // Enrolled learners in selected class
  const classStudents = useMemo(() => {
    if (!selectedClassId) return [];
    return enrollments.filter(
      (e) => e.class_id === selectedClassId && e.enrollment_status === "active"
    );
  }, [enrollments, selectedClassId]);

  // 2. Fetch Daily Attendance Records for Roll-Call Tab
  const fetchRollCallRecords = useCallback(async () => {
    if (!selectedClassId || !selectedDate) return;
    setLoadingRollCall(true);
    try {
      const res = await apiClient.request<AttendanceRecord[]>(
        `/attendance?class_id=${selectedClassId}&date=${selectedDate}&limit=300`
      );
      if (res.success) {
        setTodayRecords(res.data);
      }
    } catch {
      toast.error("Failed to load class attendance records.");
    } finally {
      setLoadingRollCall(false);
    }
  }, [selectedClassId, selectedDate]);

  useEffect(() => {
    if (activeTab === "rollcall") {
      void fetchRollCallRecords();
    }
  }, [activeTab, fetchRollCallRecords]);

  // Map of today's attendance by child_id
  const todayRecordMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    todayRecords.forEach((r) => map.set(r.child_id, r));
    return map;
  }, [todayRecords]);

  // Daily Roll-Call Summary KPIs
  const rollCallStats = useMemo(() => {
    let scanned = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;

    classStudents.forEach((stu) => {
      const rec = todayRecordMap.get(stu.child_id);
      if (!rec) {
        absent++;
      } else if (rec.attendance_status === "present") {
        scanned++;
      } else if (rec.attendance_status === "late") {
        late++;
      } else if (rec.attendance_status === "excused") {
        excused++;
      } else {
        absent++;
      }
    });

    const total = classStudents.length;
    const rate = total > 0 ? Math.round(((scanned + late) / total) * 1000) / 10 : 0;
    return { total, scanned, late, excused, absent, rate };
  }, [classStudents, todayRecordMap]);

  // 3. QR Camera Scanner Engine
  const stopCamera = () => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(true);
    window.setTimeout(async () => {
      if (!videoRef.current) return;
      try {
        const sc = new QrScanner(
          videoRef.current,
          (result) => {
            void handleProcessScannedToken(result.data);
          },
          {
            returnDetailedScanResult: true,
            highlightScanRegion: true,
            highlightCodeOutline: true,
          }
        );
        scannerRef.current = sc;
        await sc.start();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Camera access was denied or not supported.";
        setCameraError(msg);
        setCameraActive(false);
        toast.error("Unable to access camera. You can upload student QR images instead.");
      }
    }, 100);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Process Scanned Token (Single QR scan from camera or upload)
  const handleProcessScannedToken = async (rawValue: string): Promise<boolean> => {
    const token = rawValue.trim();
    if (!token) return false;

    // Cooldown check (prevent repeated firing for same child within 3s)
    const now = Date.now();
    const last = recentTokensRef.current.get(token) || 0;
    if (now - last < 3000) {
      return false;
    }
    recentTokensRef.current.set(token, now);

    try {
      const targetSchoolId = currentClassInfo?.school_id || selectedSchoolId;
      const res = await apiClient.request<{
        child?: { id: string; name: string; child_unique_id: string; photo_url?: string };
        attendanceStatus: AttendanceStatus;
        date: string;
      }>("/attendance/scan", {
        method: "POST",
        body: {
          qrToken: token,
          schoolId: targetSchoolId,
          classId: selectedClassId,
          date: selectedDate,
        },
      });

      if (res.success) {
        if (soundEnabled) scanFeedback.playSuccess();
        const childName = res.data.child?.name || "Student";
        toast.success(`Verified: ${childName} marked Present for ${selectedDate}`);
        setRecentScans((prev) => [
          {
            id: Math.random().toString(),
            name: childName,
            time: new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }),
            status: res.data.attendanceStatus,
          },
          ...prev.slice(0, 9),
        ]);
        await fetchRollCallRecords();
        return true;
      } else {
        if (soundEnabled) scanFeedback.playError();
        toast.error(res.error || "QR Code does not match an active student in this school.");
        return false;
      }
    } catch (e: unknown) {
      if (soundEnabled) scanFeedback.playError();
      const msg = e instanceof Error ? e.message : "Error processing QR token";
      toast.error(msg);
      return false;
    }
  };

  // Upload QR Image(s) Dropzone Handler
  const handleUploadQrFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingQrs(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const decoded = await QrScanner.scanImage(file);
        const ok = await handleProcessScannedToken(decoded);
        if (ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setUploadingQrs(false);
    event.target.value = "";

    if (successCount > 0) {
      toast.success(`Successfully verified and recorded attendance for ${successCount} student QR badge(s).`);
      await fetchRollCallRecords();
    } else {
      toast.error("No valid student attendance QR codes were found in the uploaded file(s).");
    }
  };

  // Open Excuse Modal for an Unscanned Student
  const handleOpenExcuseModal = (child: Enrollment) => {
    setSelectedExcuseChild(child);
    const existing = todayRecordMap.get(child.child_id);
    setExcuseReason(existing?.notes || "");
    setExcuseModalOpen(true);
  };

  // Save Excused Absence Note
  const handleSaveExcuseNote = async () => {
    if (!selectedExcuseChild) return;
    setSavingExcuse(true);
    try {
      const targetSchoolId = currentClassInfo?.school_id || selectedSchoolId;
      const res = await apiClient.request<{ savedCount: number }>("/attendance/batch", {
        method: "POST",
        body: {
          schoolId: targetSchoolId,
          classId: selectedClassId,
          date: selectedDate,
          records: [
            {
              childId: selectedExcuseChild.child_id,
              status: "excused",
              notes: excuseReason || "Excused absence recorded by teacher",
            },
          ],
        },
      });

      if (res.success) {
        toast.success(`Excused absence recorded for ${selectedExcuseChild.first_name} ${selectedExcuseChild.last_name}`);
        setExcuseModalOpen(false);
        await fetchRollCallRecords();
      } else {
        toast.error(res.error || "Failed to record excuse note.");
      }
    } catch {
      toast.error("An error occurred while recording the excuse.");
    } finally {
      setSavingExcuse(false);
    }
  };

  // 4. Fetch Multi-Granularity Register Matrix (Tab 2)
  const fetchRegisterMatrix = useCallback(async () => {
    if (!selectedClassId) return;
    setLoadingMatrix(true);
    try {
      const params = new URLSearchParams();
      params.append("class_id", selectedClassId);
      params.append("granularity", granularity);

      if (granularity === "day") {
        params.append("date", regDate);
      } else if (granularity === "week") {
        params.append("date", regDate);
      } else if (granularity === "month") {
        params.append("month", regMonth);
      } else if (granularity === "term") {
        params.append("term", regTerm);
        params.append("academic_year", regAcademicYear);
      } else if (granularity === "year") {
        params.append("academic_year", regAcademicYear);
      }

      const res = await apiClient.request<MatrixData>(`/attendance/matrix?${params.toString()}`);
      if (res.success) {
        setMatrixData(res.data);
      } else {
        toast.error(res.error || "Failed to load attendance register.");
      }
    } catch {
      toast.error("An error occurred loading the attendance register.");
    } finally {
      setLoadingMatrix(false);
    }
  }, [selectedClassId, granularity, regDate, regMonth, regTerm, regAcademicYear]);

  useEffect(() => {
    if (activeTab === "register") {
      void fetchRegisterMatrix();
    }
  }, [activeTab, fetchRegisterMatrix]);

  // 5. Fetch Attendance Analytics (Tab 3)
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.append("class_id", selectedClassId);
      else if (selectedSchoolId) params.append("school_id", selectedSchoolId);
      params.append("date", selectedDate);

      const res = await apiClient.request<AttendanceStatsResponse>(`/attendance/stats?${params.toString()}`);
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
    if (activeTab === "analytics") {
      void fetchStats();
    }
  }, [activeTab, fetchStats]);

  // 6. Fetch Raw Audit Ledger (Tab 4)
  const fetchAuditRecords = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const params = new URLSearchParams();
      if (selectedClassId) params.append("class_id", selectedClassId);
      else if (selectedSchoolId) params.append("school_id", selectedSchoolId);
      if (selectedDate) params.append("date", selectedDate);
      params.append("limit", "250");

      const res = await apiClient.request<AttendanceRecord[]>(`/attendance?${params.toString()}`);
      if (res.success) {
        setAuditRecords(res.data);
      }
    } catch {
      toast.error("Failed to load attendance audit ledger.");
    } finally {
      setLoadingAudit(false);
    }
  }, [selectedClassId, selectedSchoolId, selectedDate]);

  useEffect(() => {
    if (activeTab === "audit") {
      void fetchAuditRecords();
    }
  }, [activeTab, fetchAuditRecords]);

  // Printable Register Trigger (Native Print)
  const handlePrintRegister = () => {
    window.print();
  };

  // Export CSV for Register Matrix
  const handleExportRegisterCsv = () => {
    if (!matrixData) return;
    const headerRow = [
      "Student Name",
      "National ID",
      "Gender",
      ...matrixData.schoolDays.map((d) => d.slice(5)),
      "Present Days",
      "Late Days",
      "Absent Days",
      "Excused Days",
      "Attendance Rate (%)",
    ];

    const rows = matrixData.students.map((r) => {
      const days = matrixData.schoolDays.map((d) => {
        const att = r.attendance[d];
        if (!att) return "-";
        if (att.status === "present") return "P";
        if (att.status === "late") return "L";
        if (att.status === "absent") return "A";
        return "E";
      });
      return [
        `"${r.student.first_name} ${r.student.last_name}"`,
        r.student.child_unique_id,
        r.student.gender,
        ...days,
        r.summary.present,
        r.summary.late,
        r.summary.absent,
        r.summary.excused,
        `${r.summary.attendanceRate}%`,
      ];
    });

    const csv = "data:text/csv;charset=utf-8," + [headerRow.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encoded = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", `Attendance_Register_${matrixData.class.class_name}_${matrixData.granularity}_${matrixData.startDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Roster for Roll-Call Tab
  const filteredRoster = useMemo(() => {
    return classStudents.filter((stu) => {
      const fullName = `${stu.first_name} ${stu.last_name}`.toLowerCase();
      const code = stu.child_unique_id.toLowerCase();
      const matchesSearch = !searchRoster || fullName.includes(searchRoster.toLowerCase()) || code.includes(searchRoster.toLowerCase());
      if (!matchesSearch) return false;

      const rec = todayRecordMap.get(stu.child_id);
      if (rosterFilter === "scanned") return rec && (rec.attendance_status === "present" || rec.attendance_status === "late");
      if (rosterFilter === "unscanned") return !rec || rec.attendance_status === "absent";
      if (rosterFilter === "excused") return rec && rec.attendance_status === "excused";
      return true;
    });
  }, [classStudents, searchRoster, rosterFilter, todayRecordMap]);

  // Filtered Matrix Students for Register Tab
  const filteredMatrixStudents = useMemo(() => {
    if (!matrixData) return [];
    return matrixData.students.filter((row) => {
      const name = `${row.student.first_name} ${row.student.last_name}`.toLowerCase();
      const code = row.student.child_unique_id.toLowerCase();
      const matchesSearch = !searchMatrix || name.includes(searchMatrix.toLowerCase()) || code.includes(searchMatrix.toLowerCase());
      if (!matchesSearch) return false;

      if (matrixStatusFilter === "present") return row.summary.attendanceRate >= 80;
      if (matrixStatusFilter === "absent") return row.summary.isChronic || row.summary.absent >= 3;
      if (matrixStatusFilter === "excused") return row.summary.excused > 0;
      return true;
    });
  }, [matrixData, searchMatrix, matrixStatusFilter]);

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      {/* 0. Print Portal Styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              #root, header, nav, .no-print {
                display: none !important;
              }
              #am2050-register-print-portal {
                display: block !important;
                position: static !important;
                width: 100% !important;
                background: #ffffff !important;
                color: #0f172a !important;
              }
              @page {
                size: A4 landscape;
                margin: 8mm;
              }
            }
          `,
        }}
      />

      <div className="mx-auto max-w-[1440px] space-y-6">

        {/* 1. TOP HEADER & OPERATIONAL CONTEXT BANNER */}
        <header className="rounded-2xl border border-[#cfd9d2] bg-white p-5 sm:p-6 shadow-sm no-print">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 mb-4 text-xs font-semibold text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">Operations</span>
              <span>/</span>
              <span className="text-slate-800 font-bold">School Attendance Suite</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                <ShieldCheck size={12} className="text-emerald-700" />
                UBEC Jigawa Pilot Certified · Ahoto Ward
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Attendance Enforcement:</span>
              <strong className="text-slate-900 font-mono">Strict QR Scan / Verification</strong>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-[#123148] sm:text-3xl">
                Attendance Management & Register
              </h1>
              <p className="mt-1 text-sm text-[#57707f]">
                Verified physical daily roll-call via rapid QR scanning, with Day, Week, Month, Term, and Year/Session registers.
              </p>
            </div>

            {/* School & Class Scoping Selectors */}
            <div className="flex flex-wrap items-center gap-3">
              {/* School Selector (for HM/Admin) */}
              {isHeadmaster && schools.length > 1 && (
                <div className="flex flex-col">
                  <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Institution
                  </label>
                  <select
                    value={selectedSchoolId}
                    onChange={(e) => {
                      setSelectedSchoolId(e.target.value);
                      const classInSchool = classes.find((c) => c.school_id === e.target.value);
                      if (classInSchool) setSelectedClassId(classInSchool.id);
                    }}
                    className="h-10 rounded-lg border border-[#cfd9d2] bg-slate-50 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:bg-white"
                  >
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.school_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Class Selector */}
              <div className="flex flex-col">
                <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Class Room
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="h-10 rounded-lg border border-[#cfd9d2] bg-slate-50 px-3 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600 focus:bg-white"
                >
                  {filteredClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name} ({c.class_level})
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh Action */}
              <div className="flex flex-col justify-end">
                <button
                  onClick={() => {
                    void loadInitialContext();
                    if (activeTab === "rollcall") void fetchRollCallRecords();
                    if (activeTab === "register") void fetchRegisterMatrix();
                    if (activeTab === "analytics") void fetchStats();
                  }}
                  className="action-press inline-flex h-10 items-center justify-center rounded-lg border border-[#cfd9d2] bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  title="Refresh attendance records"
                >
                  <RefreshCw size={14} className={loadingRollCall || loadingMatrix ? "animate-spin" : ""} />
                </button>
              </div>
            </div>
          </div>

          {/* 4-Tab Navigation */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button
              onClick={() => setActiveTab("rollcall")}
              className={`action-press inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "rollcall"
                  ? "bg-[#167a4c] text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <QrCode size={15} />
              1. Daily QR Roll-Call
              <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${activeTab === "rollcall" ? "bg-white/20 text-white" : "bg-white text-slate-700"}`}>
                {rollCallStats.scanned}/{rollCallStats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("register")}
              className={`action-press inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "register"
                  ? "bg-[#167a4c] text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <FileSpreadsheet size={15} />
              2. Official Register Matrix (Day/Week/Month/Term/Year)
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              className={`action-press inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "analytics"
                  ? "bg-[#167a4c] text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <ShieldAlert size={15} />
              3. Analytics & Early Warning Watchlist
              {statsData && statsData.chronicWarnings.length > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {statsData.chronicWarnings.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`action-press inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                activeTab === "audit"
                  ? "bg-[#167a4c] text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Clock size={15} />
              4. Historical Audit Ledger
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* TAB 1: DAILY QR ROLL-CALL WORKSTATION                                     */}
        {/* ========================================================================= */}
        {activeTab === "rollcall" && (
          <div className="space-y-6 no-print">
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">Class Enrolled</p>
                <p className="mt-1 font-display text-2xl font-bold text-[#123148]">{rollCallStats.total}</p>
                <p className="text-[11px] text-slate-400">Total registered learners</p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800">QR Verified / Present</p>
                <p className="mt-1 font-display text-2xl font-bold text-emerald-700">{rollCallStats.scanned}</p>
                <p className="text-[11px] text-emerald-600 font-medium">{rollCallStats.rate}% present today</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-800">Scanned Late</p>
                <p className="mt-1 font-display text-2xl font-bold text-amber-700">{rollCallStats.late}</p>
                <p className="text-[11px] text-amber-600 font-medium">After morning roll-call</p>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 shadow-sm">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-800">Unscanned / Absent</p>
                <p className="mt-1 font-display text-2xl font-bold text-red-700">{rollCallStats.absent}</p>
                <p className="text-[11px] text-red-600 font-medium">No QR scan recorded</p>
              </div>

              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm col-span-2 sm:col-span-1">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-800">Excused Absence</p>
                <p className="mt-1 font-display text-2xl font-bold text-sky-700">{rollCallStats.excused}</p>
                <p className="text-[11px] text-sky-600 font-medium">Documented excuse</p>
              </div>
            </div>

            {/* Central QR Attendance Workstation */}
            <div className="rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-white via-emerald-50/20 to-slate-50 p-6 shadow-md">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-emerald-200/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
                      <Zap size={16} />
                    </span>
                    <h2 className="font-display text-lg font-bold text-[#123148]">
                      AM2050 Verified QR Attendance Scanner
                    </h2>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-300">
                      LIVE ROLL-CALL
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Scan student QR badges via camera or upload badge photos. Physical presence is strictly verified by student QR credential.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
                    <CalendarIcon size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">Date:</span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="text-xs font-bold text-slate-900 bg-transparent outline-none cursor-pointer"
                    />
                  </div>

                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    title={soundEnabled ? "Mute scan audio" : "Enable scan audio"}
                  >
                    {soundEnabled ? <Volume2 size={16} className="text-emerald-700" /> : <VolumeX size={16} className="text-slate-400" />}
                  </button>
                </div>
              </div>

              {/* Scanning Actions Grid */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Mode A: Live Continuous Camera Scanner */}
                <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera size={18} className="text-emerald-700" />
                      <h3 className="text-sm font-bold text-slate-900">Live Camera Scanner</h3>
                    </div>
                    {cameraActive && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 animate-pulse">
                        <span className="size-2 rounded-full bg-emerald-500" /> Camera Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Hold student ID card or badge in front of lens for instant burst roll-call.
                  </p>

                  <div className="mt-4 flex-1 flex flex-col justify-center items-center">
                    {cameraActive ? (
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black border-2 border-emerald-500 shadow-inner">
                        <video ref={videoRef} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 border-2 border-emerald-400/60 rounded-lg pointer-events-none flex items-center justify-center">
                          <div className="size-36 border-2 border-emerald-400 rounded-xl animate-pulse" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full py-8 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 flex flex-col items-center justify-center text-center p-4">
                        <div className="size-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 mb-2">
                          <Camera size={24} />
                        </div>
                        <p className="text-xs font-semibold text-slate-700">Camera is currently paused</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click below to activate camera scanning for this class</p>
                      </div>
                    )}

                    {cameraError && (
                      <p className="mt-2 text-xs font-semibold text-red-600">{cameraError}</p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                    {cameraActive ? (
                      <button
                        onClick={stopCamera}
                        className="action-press w-full inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow"
                      >
                        <X size={15} /> Stop Camera
                      </button>
                    ) : (
                      <button
                        onClick={() => void startCamera()}
                        className="action-press w-full inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow"
                      >
                        <Camera size={15} /> Start Live Camera Scan
                      </button>
                    )}
                  </div>
                </div>

                {/* Mode B: Upload QR Image / File Dropzone */}
                <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageUp size={18} className="text-emerald-700" />
                      <h3 className="text-sm font-bold text-slate-900">Upload QR Image(s)</h3>
                    </div>
                    {uploadingQrs && (
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <Loader2 size={13} className="animate-spin" /> Decoding...
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Upload single or multiple student QR card photos/scans taken from phone or camera.
                  </p>

                  <div className="mt-4 flex-1 flex flex-col justify-center">
                    <label className="relative flex flex-col items-center justify-center p-6 border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-xl bg-emerald-50/30 hover:bg-emerald-50/50 cursor-pointer transition-all">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => void handleUploadQrFiles(e)}
                        disabled={uploadingQrs}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="size-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                        {uploadingQrs ? <Loader2 size={24} className="animate-spin" /> : <ImageUp size={24} />}
                      </div>
                      <p className="text-xs font-bold text-slate-800">
                        {uploadingQrs ? "Processing QR images..." : "Click or Drop QR badge images here"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">Supports PNG, JPG, JPEG, WEBP (multiple files allowed)</p>
                    </label>
                  </div>

                  {/* Real-time Scan Feed */}
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Recent Roll-Call Verifications:
                    </p>
                    {recentScans.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No QR scans recorded in this session yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                        {recentScans.map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                          >
                            <CheckCircle2 size={11} className="text-emerald-700" />
                            {s.name} ({s.time})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Roll-Call Verification Table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-display text-base font-bold text-[#123148]">
                    Daily Class Roll-Call Register ({formatDisplayDate(selectedDate)})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {currentClassInfo?.class_name} · {classStudents.length} Enrolled Learners
                  </p>
                </div>

                {/* Table Filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search student or ID..."
                      value={searchRoster}
                      onChange={(e) => setSearchRoster(e.target.value)}
                      className="h-9 w-44 rounded-lg border border-slate-200 pl-8 pr-3 text-xs outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
                    <button
                      onClick={() => setRosterFilter("all")}
                      className={`px-2.5 py-1 rounded-md ${rosterFilter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      All ({classStudents.length})
                    </button>
                    <button
                      onClick={() => setRosterFilter("scanned")}
                      className={`px-2.5 py-1 rounded-md ${rosterFilter === "scanned" ? "bg-emerald-700 text-white shadow-sm" : "text-slate-500"}`}
                    >
                      Scanned ({rollCallStats.scanned + rollCallStats.late})
                    </button>
                    <button
                      onClick={() => setRosterFilter("unscanned")}
                      className={`px-2.5 py-1 rounded-md ${rosterFilter === "unscanned" ? "bg-red-600 text-white shadow-sm" : "text-slate-500"}`}
                    >
                      Unscanned ({rollCallStats.absent})
                    </button>
                    <button
                      onClick={() => setRosterFilter("excused")}
                      className={`px-2.5 py-1 rounded-md ${rosterFilter === "excused" ? "bg-sky-600 text-white shadow-sm" : "text-slate-500"}`}
                    >
                      Excused ({rollCallStats.excused})
                    </button>
                  </div>
                </div>
              </div>

              {/* Roster Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Learner Information</th>
                      <th className="py-3 px-4">National ID</th>
                      <th className="py-3 px-4">Gender</th>
                      <th className="py-3 px-4">Roll-Call Verification Status</th>
                      <th className="py-3 px-4">Verified Time / Note</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRoster.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No enrolled students match the filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRoster.map((stu, idx) => {
                        const rec = todayRecordMap.get(stu.child_id);
                        const isPresent = rec?.attendance_status === "present";
                        const isLate = rec?.attendance_status === "late";
                        const isExcused = rec?.attendance_status === "excused";
                        const isAbsent = !rec || rec.attendance_status === "absent";

                        return (
                          <tr key={stu.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="size-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 border border-slate-200">
                                  {stu.photo_url ? (
                                    <img src={stu.photo_url} alt="" className="size-full rounded-full object-cover" />
                                  ) : (
                                    `${stu.first_name[0]}${stu.last_name[0]}`
                                  )}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-900">
                                    {stu.first_name} {stu.last_name}
                                  </p>
                                  <p className="font-mono text-[10px] text-slate-400">{stu.guardian_phone || "No phone"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-600 font-semibold">{stu.child_unique_id}</td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${stu.gender === "female" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>
                                {stu.gender}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {isPresent && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 font-bold">
                                  <CheckCircle2 size={12} className="text-emerald-700" />
                                  QR Verified · Present
                                </span>
                              )}
                              {isLate && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-0.5 font-bold">
                                  <Clock size={12} className="text-amber-700" />
                                  QR Verified · Late
                                </span>
                              )}
                              {isExcused && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 border border-sky-300 px-2.5 py-0.5 font-bold">
                                  <ShieldAlert size={12} className="text-sky-700" />
                                  Excused Absence
                                </span>
                              )}
                              {isAbsent && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 font-bold">
                                  <UserX size={12} className="text-slate-400" />
                                  Unscanned · Absent
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {rec ? (
                                <div>
                                  <p className="font-mono text-[11px] text-slate-800 font-semibold">
                                    {rec.created_at ? new Date(rec.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "Today"}
                                  </p>
                                  {rec.notes && <p className="text-[10px] text-slate-400 truncate max-w-xs">{rec.notes}</p>}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Awaiting QR scan</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleOpenExcuseModal(stu)}
                                className="action-press inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                              >
                                {isExcused ? "Edit Excuse" : "Log Excuse Note"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: MULTI-GRANULARITY ATTENDANCE REGISTER MATRIX                       */}
        {/* ========================================================================= */}
        {activeTab === "register" && (
          <div className="space-y-6 no-print">
            {/* Filter Toolbar Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-display text-base font-bold text-[#123148]">
                    Official Attendance Register
                  </h3>
                  <p className="text-xs text-slate-500">
                    Multi-period attendance reporting: Day, Week, Month, Term, and Year/Session.
                  </p>
                </div>

                {/* Granularity Switcher Pills */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 font-semibold text-xs">
                  <button
                    onClick={() => setGranularity("day")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      granularity === "day" ? "bg-[#167a4c] text-white shadow" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setGranularity("week")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      granularity === "week" ? "bg-[#167a4c] text-white shadow" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Week
                  </button>
                  <button
                    onClick={() => setGranularity("month")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      granularity === "month" ? "bg-[#167a4c] text-white shadow" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Month
                  </button>
                  <button
                    onClick={() => setGranularity("term")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      granularity === "term" ? "bg-[#167a4c] text-white shadow" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Term
                  </button>
                  <button
                    onClick={() => setGranularity("year")}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      granularity === "year" ? "bg-[#167a4c] text-white shadow" : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    Year / Session
                  </button>
                </div>
              </div>

              {/* Granularity-Specific Period Controls */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Day View Controls */}
                  {granularity === "day" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const d = new Date(regDate);
                          d.setDate(d.getDate() - 1);
                          setRegDate(d.toISOString().slice(0, 10));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <input
                        type="date"
                        value={regDate}
                        onChange={(e) => setRegDate(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800"
                      />
                      <button
                        onClick={() => {
                          const d = new Date(regDate);
                          d.setDate(d.getDate() + 1);
                          setRegDate(d.toISOString().slice(0, 10));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {/* Week View Controls */}
                  {granularity === "week" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const d = new Date(regDate);
                          d.setDate(d.getDate() - 7);
                          setRegDate(d.toISOString().slice(0, 10));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <input
                        type="date"
                        value={regDate}
                        onChange={(e) => setRegDate(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800"
                      />
                      <button
                        onClick={() => {
                          const d = new Date(regDate);
                          d.setDate(d.getDate() + 7);
                          setRegDate(d.toISOString().slice(0, 10));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {/* Month View Controls */}
                  {granularity === "month" && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const [y, m] = regMonth.split("-").map(Number);
                          const prev = new Date(y, m - 2, 1);
                          setRegMonth(prev.toISOString().slice(0, 7));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <input
                        type="month"
                        value={regMonth}
                        onChange={(e) => setRegMonth(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800"
                      />
                      <button
                        onClick={() => {
                          const [y, m] = regMonth.split("-").map(Number);
                          const next = new Date(y, m, 1);
                          setRegMonth(next.toISOString().slice(0, 7));
                        }}
                        className="action-press inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {/* Term View Controls */}
                  {granularity === "term" && (
                    <div className="flex items-center gap-2">
                      <select
                        value={regTerm}
                        onChange={(e) => setRegTerm(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="First Term">First Term</option>
                        <option value="Second Term">Second Term</option>
                        <option value="Third Term">Third Term</option>
                      </select>
                      <select
                        value={regAcademicYear}
                        onChange={(e) => setRegAcademicYear(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="2025/2026">2025/2026 Academic Year</option>
                        <option value="2026/2027">2026/2027 Academic Year</option>
                      </select>
                    </div>
                  )}

                  {/* Year View Controls */}
                  {granularity === "year" && (
                    <div className="flex items-center gap-2">
                      <select
                        value={regAcademicYear}
                        onChange={(e) => setRegAcademicYear(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-800 bg-white"
                      >
                        <option value="2025/2026">2025/2026 Academic Session</option>
                        <option value="2026/2027">2026/2027 Academic Session</option>
                      </select>
                    </div>
                  )}

                  <span className="text-xs font-bold text-[#167a4c] bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                    {matrixData?.periodLabel || "Loading period..."}
                  </span>
                </div>

                {/* Print & Export Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportRegisterCsv}
                    className="action-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                  <button
                    onClick={handlePrintRegister}
                    className="action-press inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#123148] hover:bg-[#1a4464] text-white px-4 text-xs font-bold shadow-sm"
                  >
                    <Printer size={14} /> Print Official Register (A4 Landscape)
                  </button>
                </div>
              </div>
            </div>

            {/* Matrix Table Display */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-4 text-xs text-slate-600">
                  <span>Class: <strong className="text-slate-900">{matrixData?.class?.class_name || "Class"}</strong></span>
                  <span>School Days Recorded: <strong className="text-slate-900">{matrixData?.totalSchoolDays || 0}</strong></span>
                  <span>Learners: <strong className="text-slate-900">{matrixData?.students?.length || 0}</strong></span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter student..."
                      value={searchMatrix}
                      onChange={(e) => setSearchMatrix(e.target.value)}
                      className="h-8 w-40 rounded-md border border-slate-200 pl-7 pr-2 text-xs outline-none"
                    />
                  </div>
                  <select
                    value={matrixStatusFilter}
                    onChange={(e) => setMatrixStatusFilter(e.target.value as never)}
                    className="h-8 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 bg-white"
                  >
                    <option value="all">All Learners</option>
                    <option value="present">High Attendance (≥80%)</option>
                    <option value="absent">Chronic / At-Risk (&lt;75%)</option>
                    <option value="excused">Has Excused Absences</option>
                  </select>
                </div>
              </div>

              {/* Status Legend */}
              <div className="mb-4 flex flex-wrap items-center gap-4 text-xs border border-slate-100 rounded-lg p-2.5 bg-slate-50/70">
                <span className="font-bold text-slate-500">Legend:</span>
                <span className="inline-flex items-center gap-1 text-emerald-800 font-bold">
                  <span className="size-4 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px]">P</span> Present (QR Verified)
                </span>
                <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                  <span className="size-4 rounded bg-amber-500 text-white flex items-center justify-center text-[10px]">L</span> Late
                </span>
                <span className="inline-flex items-center gap-1 text-red-800 font-bold">
                  <span className="size-4 rounded bg-red-600 text-white flex items-center justify-center text-[10px]">A</span> Absent (Unscanned)
                </span>
                <span className="inline-flex items-center gap-1 text-sky-800 font-bold">
                  <span className="size-4 rounded bg-sky-600 text-white flex items-center justify-center text-[10px]">E</span> Excused Note
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                  <span className="size-4 rounded bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]">-</span> No Session
                </span>
              </div>

              {/* Calendar Matrix Grid Table */}
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200 font-mono text-[10px] uppercase text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-20 min-w-[180px]">Student Name</th>
                      <th className="py-2.5 px-2 text-center min-w-[70px]">Gender</th>
                      {matrixData?.schoolDays.map((d) => {
                        const dayNum = d.slice(8);
                        const dayName = new Date(d).toLocaleDateString("en-US", { weekday: "narrow" });
                        return (
                          <th key={d} className="py-2.5 px-1.5 text-center min-w-[28px] border-l border-slate-200">
                            <div>{dayName}</div>
                            <div className="font-bold text-slate-900">{dayNum}</div>
                          </th>
                        );
                      })}
                      <th className="py-2.5 px-2 text-center bg-slate-200 min-w-[45px]">P</th>
                      <th className="py-2.5 px-2 text-center bg-slate-200 min-w-[45px]">A</th>
                      <th className="py-2.5 px-2 text-center bg-slate-200 min-w-[55px]">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingMatrix ? (
                      <tr>
                        <td colSpan={(matrixData?.schoolDays.length || 0) + 5} className="py-12 text-center text-slate-400">
                          <Loader2 size={24} className="animate-spin mx-auto mb-2 text-emerald-700" />
                          Loading register matrix...
                        </td>
                      </tr>
                    ) : filteredMatrixStudents.length === 0 ? (
                      <tr>
                        <td colSpan={(matrixData?.schoolDays.length || 0) + 5} className="py-8 text-center text-slate-400">
                          No attendance records found for this period.
                        </td>
                      </tr>
                    ) : (
                      filteredMatrixStudents.map((row) => (
                        <tr key={row.student.child_id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 sticky left-0 bg-white hover:bg-slate-50 z-10 border-r border-slate-100">
                            <p className="font-bold text-slate-900 truncate">
                              {row.student.first_name} {row.student.last_name}
                            </p>
                            <p className="font-mono text-[9px] text-slate-400">{row.student.child_unique_id}</p>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${row.student.gender === "female" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>
                              {row.student.gender === "female" ? "F" : "M"}
                            </span>
                          </td>
                          {matrixData?.schoolDays.map((d) => {
                            const att = row.attendance[d];
                            let cellBg = "text-slate-300";
                            let cellText = "-";
                            if (att) {
                              if (att.status === "present") {
                                cellBg = "bg-emerald-600 text-white font-bold";
                                cellText = "P";
                              } else if (att.status === "late") {
                                cellBg = "bg-amber-500 text-white font-bold";
                                cellText = "L";
                              } else if (att.status === "absent") {
                                cellBg = "bg-red-600 text-white font-bold";
                                cellText = "A";
                              } else if (att.status === "excused") {
                                cellBg = "bg-sky-600 text-white font-bold";
                                cellText = "E";
                              }
                            }
                            return (
                              <td key={d} className="p-0.5 text-center border-l border-slate-100">
                                <span className={`inline-flex size-6 items-center justify-center rounded text-[10px] ${cellBg}`} title={att?.notes || cellText}>
                                  {cellText}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-2 px-2 text-center font-bold text-emerald-800 bg-emerald-50/50">
                            {row.summary.present + row.summary.late}
                          </td>
                          <td className="py-2 px-2 text-center font-bold text-red-700 bg-red-50/50">
                            {row.summary.absent}
                          </td>
                          <td className="py-2 px-2 text-center font-bold font-mono">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${row.summary.isChronic ? "bg-red-100 text-red-800" : "text-slate-800"}`}>
                              {row.summary.attendanceRate}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SCHOOL ANALYTICS & EARLY WARNING                                   */}
        {/* ========================================================================= */}
        {activeTab === "analytics" && (
          <div className="space-y-6 no-print">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Daily Rate KPI Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Attendance Compliance</p>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-display text-4xl font-bold text-emerald-700">{statsData?.rate ?? 0}%</span>
                  <span className="text-xs font-bold text-slate-500">Today's verified rate</span>
                </div>
                <div className="mt-4 w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-600 h-full rounded-full transition-all" style={{ width: `${statsData?.rate ?? 0}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Target threshold is 85% for SUBEB Jigawa retention benchmarks.
                </p>
              </div>

              {/* Gender Parity Card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Gender Parity Distribution</p>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-blue-700">Male Attendance</span>
                      <span>{statsData?.gender?.male?.rate ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full" style={{ width: `${statsData?.gender?.male?.rate ?? 0}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-rose-700">Female Attendance</span>
                      <span>{statsData?.gender?.female?.rate ?? 0}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full rounded-full" style={{ width: `${statsData?.gender?.female?.rate ?? 0}%` }} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400">Monitoring equity in girl-child retention and tsangaya integration.</p>
              </div>

              {/* Verified QR Scanner Health */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Anti-Proxy Integrity</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">QR Token Encryption</p>
                    <p className="text-xs text-slate-500">ULID 26-char token verification active</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Manual presence override has been disabled to prevent ghost attendance and ensure federal auditing compliance.
                </p>
              </div>
            </div>

            {/* Chronic Absenteeism Watchlist */}
            <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-red-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-red-600 text-white">
                    <AlertCircle size={16} />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      Chronic Absenteeism Early Warning Watchlist
                    </h3>
                    <p className="text-xs text-slate-500">
                      Learners with multiple unscanned absences requiring immediate caseworker or headmaster contact.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
                  {statsData?.chronicWarnings.length || 0} Flagged Learners
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-mono uppercase text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">Learner Name</th>
                      <th className="py-2.5 px-3">National ID</th>
                      <th className="py-2.5 px-3">Class</th>
                      <th className="py-2.5 px-3">Absences Recorded</th>
                      <th className="py-2.5 px-3">Guardian Contact</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!statsData || statsData.chronicWarnings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No chronic absenteeism alerts recorded for this class.
                        </td>
                      </tr>
                    ) : (
                      statsData.chronicWarnings.map((w) => (
                        <tr key={w.id} className="hover:bg-red-50/30">
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {w.first_name} {w.last_name}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">{w.child_unique_id}</td>
                          <td className="py-3 px-3 text-slate-700">{w.class_name || "Assigned"}</td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800">
                              {w.absent_count} of {w.total_days} days absent
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-800 font-semibold">{w.guardian_phone || "Not recorded"}</td>
                          <td className="py-3 px-3 text-right">
                            <a
                              href={`tel:${w.guardian_phone}`}
                              className="action-press inline-flex items-center gap-1 rounded bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm"
                            >
                              Call Guardian
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: AUDIT LEDGER                                                       */}
        {/* ========================================================================= */}
        {activeTab === "audit" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm no-print">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
              <div>
                <h3 className="font-display text-base font-bold text-[#123148]">Historical Audit Log</h3>
                <p className="text-xs text-slate-500">Unfiltered transactional record of all QR scans and verifications.</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-xs outline-none"
                />
                <select
                  value={auditFilterStatus}
                  onChange={(e) => setAuditFilterStatus(e.target.value)}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-xs bg-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                  <option value="excused">Excused</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-mono uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Learner Name</th>
                    <th className="py-2.5 px-3">National ID</th>
                    <th className="py-2.5 px-3">Class</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Auditor / Device</th>
                    <th className="py-2.5 px-3">Verification Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No audit records found.
                      </td>
                    </tr>
                  ) : (
                    auditRecords
                      .filter((r) => {
                        const q = auditSearch.toLowerCase();
                        const matchQ =
                          !auditSearch ||
                          (r.first_name || "").toLowerCase().includes(q) ||
                          (r.last_name || "").toLowerCase().includes(q) ||
                          (r.child_unique_id || "").toLowerCase().includes(q);
                        const matchS = auditFilterStatus === "all" || r.attendance_status === auditFilterStatus;
                        return matchQ && matchS;
                      })
                      .map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-800">{r.date}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {r.created_at ? new Date(r.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "-"}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {r.first_name} {r.last_name}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{r.child_unique_id}</td>
                          <td className="py-2.5 px-3 text-slate-600">{r.class_name}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              r.attendance_status === "present"
                                ? "bg-emerald-100 text-emerald-800"
                                : r.attendance_status === "late"
                                ? "bg-amber-100 text-amber-800"
                                : r.attendance_status === "excused"
                                ? "bg-sky-100 text-sky-800"
                                : "bg-red-100 text-red-800"
                            }`}>
                              {r.attendance_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">{r.recorded_by_name || "AM2050 QR Scanner"}</td>
                          <td className="py-2.5 px-3 text-slate-500">{r.notes || "Standard physical roll-call"}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* EXCUSE REASON MODAL                                                       */}
      {/* ========================================================================= */}
      {excuseModalOpen && selectedExcuseChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-display text-base font-bold text-slate-900">
                Log Excused Absence Note
              </h3>
              <button
                onClick={() => setExcuseModalOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-600">
                Learner: <strong className="text-slate-900">{selectedExcuseChild.first_name} {selectedExcuseChild.last_name}</strong> ({selectedExcuseChild.child_unique_id})
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Date: <strong className="text-slate-900">{selectedDate}</strong>
              </p>

              {/* Quick Chip Presets */}
              <div className="mt-4">
                <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Quick Reason Presets:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Medical Illness / Malaria", "Family Travel / Ceremony", "Severe Flooding / Rain", "Farm Support (Seasonal)", "Guardian Confirmed Notice"].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setExcuseReason(chip)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        excuseReason === chip ? "bg-sky-600 text-white border-sky-600" : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Reason Input */}
              <div className="mt-4">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Specific Reason / Doctor's Note
                </label>
                <textarea
                  rows={3}
                  value={excuseReason}
                  onChange={(e) => setExcuseReason(e.target.value)}
                  placeholder="Enter details of guardian communication or medical notice..."
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setExcuseModalOpen(false)}
                className="action-press rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveExcuseNote()}
                disabled={savingExcuse}
                className="action-press inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 text-xs font-bold shadow"
              >
                {savingExcuse ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Save Excused Absence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT PORTAL FOR OFFICIAL REGISTER (A4 LANDSCAPE)                         */}
      {/* ========================================================================= */}
      {matrixData && createPortal(
        <div id="am2050-register-print-portal" style={{ display: "none" }}>
          <div style={{ padding: "10mm", fontFamily: "system-ui, -apple-system, sans-serif" }}>
            {/* SUBEB Jigawa Header */}
            <div style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: "4mm", marginBottom: "4mm" }}>
              <h2 style={{ fontSize: "16pt", fontWeight: "bold", textTransform: "uppercase", margin: 0, color: "#167a4c" }}>
                JIGAWA STATE UNIVERSAL BASIC EDUCATION BOARD (SUBEB)
              </h2>
              <h3 style={{ fontSize: "13pt", fontWeight: "bold", textTransform: "uppercase", margin: "2mm 0 0", color: "#0f172a" }}>
                OFFICIAL CLASSROOM ATTENDANCE REGISTER
              </h3>
              <p style={{ fontSize: "10pt", margin: "1mm 0 0", color: "#475569" }}>
                PILOT WARD: AHOTO · BUJI LGA · JIGAWA STATE | NATIONAL UNIFIED FIELD LEDGER
              </p>
            </div>

            {/* School & Class Metadata Grid */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4mm", fontSize: "9pt", background: "#f8fafc", padding: "3mm", border: "1px solid #cbd5e1" }}>
              <div>
                <strong>School:</strong> {matrixData.class.school_name}
              </div>
              <div>
                <strong>Class:</strong> {matrixData.class.class_name} ({matrixData.class.class_level})
              </div>
              <div>
                <strong>Period / Term:</strong> {matrixData.periodLabel}
              </div>
              <div>
                <strong>Class Teacher:</strong> {matrixData.class.teacher_name || "Mallam In-Charge"}
              </div>
            </div>

            {/* Matrix Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "#e2e8f0" }}>
                  <th style={{ border: "1px solid #94a3b8", padding: "2mm", width: "24mm" }}>ID</th>
                  <th style={{ border: "1px solid #94a3b8", padding: "2mm", width: "45mm" }}>Student Name</th>
                  <th style={{ border: "1px solid #94a3b8", padding: "2mm", textAlign: "center", width: "8mm" }}>Sex</th>
                  {matrixData.schoolDays.map((d) => (
                    <th key={d} style={{ border: "1px solid #94a3b8", padding: "1mm", textAlign: "center" }}>
                      {d.slice(8)}
                    </th>
                  ))}
                  <th style={{ border: "1px solid #94a3b8", padding: "1mm", textAlign: "center", width: "10mm" }}>P</th>
                  <th style={{ border: "1px solid #94a3b8", padding: "1mm", textAlign: "center", width: "10mm" }}>A</th>
                  <th style={{ border: "1px solid #94a3b8", padding: "1mm", textAlign: "center", width: "12mm" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.students.map((r, i) => (
                  <tr key={r.student.child_id} style={{ background: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", fontFamily: "monospace" }}>
                      {r.student.child_unique_id}
                    </td>
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", fontWeight: "bold" }}>
                      {r.student.first_name} {r.student.last_name}
                    </td>
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", textAlign: "center" }}>
                      {r.student.gender === "female" ? "F" : "M"}
                    </td>
                    {matrixData.schoolDays.map((d) => {
                      const att = r.attendance[d];
                      const txt = !att ? "-" : att.status === "present" ? "P" : att.status === "late" ? "L" : att.status === "absent" ? "A" : "E";
                      return (
                        <td key={d} style={{ border: "1px solid #cbd5e1", padding: "1mm", textAlign: "center", fontWeight: txt === "P" ? "bold" : "normal" }}>
                          {txt}
                        </td>
                      );
                    })}
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", textAlign: "center", fontWeight: "bold" }}>
                      {r.summary.present + r.summary.late}
                    </td>
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", textAlign: "center" }}>
                      {r.summary.absent}
                    </td>
                    <td style={{ border: "1px solid #cbd5e1", padding: "1.5mm", textAlign: "center", fontWeight: "bold" }}>
                      {r.summary.attendanceRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Official Certification Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10mm", paddingTop: "5mm", borderTop: "1px solid #cbd5e1", fontSize: "9pt" }}>
              <div style={{ textAlign: "center", width: "60mm" }}>
                <div style={{ borderBottom: "1px solid #000", height: "10mm" }} />
                <p style={{ margin: "2mm 0 0", fontWeight: "bold" }}>Class Teacher's Signature & Date</p>
              </div>

              <div style={{ textAlign: "center", width: "60mm" }}>
                <div style={{ borderBottom: "1px solid #000", height: "10mm" }} />
                <p style={{ margin: "2mm 0 0", fontWeight: "bold" }}>Headmaster's Endorsement & Stamp</p>
              </div>

              <div style={{ textAlign: "center", width: "60mm" }}>
                <div style={{ borderBottom: "1px solid #000", height: "10mm" }} />
                <p style={{ margin: "2mm 0 0", fontWeight: "bold" }}>SUBEB Quality Assurance Officer</p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </main>
  );
}
