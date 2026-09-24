/* AM2050 — Universal Basic Education Result Management & Report Dossiers */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Download,
  FileCheck,
  FileSpreadsheet,
  Lock,
  MessageSquareText,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { FormalReportCardModal, StudentReportSheet, SubjectResultItem } from "@/components/results/FormalReportCardModal";

type ClassItem = {
  id: string;
  class_code: string;
  class_name: string;
  class_level: string;
  school_id: string;
  school_name?: string;
  teacher_id?: string | null;
  academic_year: string;
};

type TermItem = {
  id: string;
  term_name: string;
  academic_year: string;
  status: string;
  session_name?: string;
  start_date?: string;
  end_date?: string;
};

type SubjectItem = {
  id: string;
  subject_name: string;
  subject_code: string;
};

type TeachingAllocation = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string;
  subject_name: string;
  teacher_name?: string;
};

type ClassReportResponse = {
  class: {
    id: string;
    name: string;
    level: string;
    schoolName: string;
    schoolCode?: string;
    state?: string;
    lga?: string;
    teacherName?: string;
    teacherId?: string;
  };
  term: {
    id: string;
    name: string;
    academicYear: string;
    startDate?: string;
    endDate?: string;
    nextTermBegins?: string;
  };
  subjects: string[];
  subjectStats: Record<string, { avg: number; min: number; max: number; count: number }>;
  students: StudentReportSheet[];
};

type ScoreEntryRow = {
  enrollmentId: string;
  childId: string;
  studentName: string;
  childUniqueId: string;
  gender: string;
  caScore: string;
  examScore: string;
  score: string; // CA + Exam
  grade: string;
  comments: string;
  status: "draft" | "submitted" | "published";
  isDirty?: boolean;
};

export default function ResultManagement() {
  const { user } = useAuth();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"scores" | "students" | "behavior" | "ledger">("scores");

  // Selection states
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>("");

  // Teacher allocations (if current user is teacher)
  const [allocations, setAllocations] = useState<TeachingAllocation[]>([]);

  // Report Sheet Data from Backend
  const [classReport, setClassReport] = useState<ClassReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Subject Score Entry Form State (for Tab 1)
  const [scoreRows, setScoreRows] = useState<ScoreEntryRow[]>([]);
  const [savingScores, setSavingScores] = useState(false);

  // Report Card Modal States
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState<string | undefined>(undefined);

  // Publish / Unpublish Dialog States
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [unpublishReason, setUnpublishReason] = useState("");
  const [unpublishDialogOpen, setUnpublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Search filter for Tab 2 and Tab 4
  const [searchQuery, setSearchQuery] = useState("");

  const isHeadmaster = user?.role === "headmaster" || user?.role === "super_admin" || user?.role === "program_admin";
  const isClassTeacher = useMemo(() => {
    if (!user || !classReport?.class?.teacherId) return false;
    return user.id === classReport.class.teacherId;
  }, [user, classReport]);

  // Load initial classes, terms, and allocations
  const loadInitialData = useCallback(async () => {
    try {
      const [classRes, termRes, allocRes] = await Promise.all([
        apiClient.request<ClassItem[]>("/classes?limit=250"),
        apiClient.request<TermItem[]>("/terms"),
        apiClient.request<TeachingAllocation[]>("/teaching-allocations"),
      ]);

      if (classRes.success && classRes.data.length > 0) {
        setClasses(classRes.data);
        if (!selectedClassId) {
          // If teacher is assigned to a specific class, select that first
          const myClass = classRes.data.find((c) => c.teacher_id === user?.id);
          setSelectedClassId(myClass ? myClass.id : classRes.data[0].id);
        }
      }

      if (termRes.success && termRes.data.length > 0) {
        setTerms(termRes.data);
        if (!selectedTermId) {
          const activeTerm = termRes.data.find((t) => t.status === "active") || termRes.data[0];
          setSelectedTermId(activeTerm.id);
        }
      }

      if (allocRes.success) {
        setAllocations(allocRes.data);
      }
    } catch {
      toast.error("Failed to load school classes and academic terms.");
    }
  }, [user, selectedClassId, selectedTermId]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Load subjects for the selected class
  useEffect(() => {
    if (!selectedClassId) return;
    const fetchSubjects = async () => {
      const res = await apiClient.request<SubjectItem[]>(`/classes/${selectedClassId}/subjects`);
      if (res.success) {
        setSubjects(res.data);
        if (res.data.length > 0) {
          // If teacher is restricted to specific subjects, select their first allocated subject
          if (user?.role === "teacher" && !isClassTeacher) {
            const myAlloc = allocations.find((a) => a.class_id === selectedClassId && a.teacher_id === user.id);
            if (myAlloc) {
              setSelectedSubject(myAlloc.subject_name);
              return;
            }
          }
          if (!selectedSubject || !res.data.some((s) => s.subject_name === selectedSubject)) {
            setSelectedSubject(res.data[0].subject_name);
          }
        } else {
          setSelectedSubject("");
        }
      }
    };
    void fetchSubjects();
  }, [selectedClassId, user, isClassTeacher, allocations, selectedSubject]);

  // Fetch Full Class Report Sheets whenever selectedClassId or selectedTermId changes
  const fetchClassReport = useCallback(async () => {
    if (!selectedClassId || !selectedTermId) return;
    setLoadingReport(true);
    try {
      const res = await apiClient.request<ClassReportResponse>(
        `/classes/${selectedClassId}/report-sheets?term_id=${selectedTermId}`
      );
      if (res.success) {
        setClassReport(res.data);
      } else {
        toast.error(res.error || "Unable to fetch class report sheets.");
      }
    } catch {
      toast.error("An error occurred while loading class results.");
    } finally {
      setLoadingReport(false);
    }
  }, [selectedClassId, selectedTermId]);

  useEffect(() => {
    void fetchClassReport();
  }, [fetchClassReport]);

  // Sync Subject Score Matrix rows whenever classReport or selectedSubject changes
  useEffect(() => {
    if (!classReport || !selectedSubject) {
      setScoreRows([]);
      return;
    }

    const rows: ScoreEntryRow[] = classReport.students.map((st) => {
      const existing = st.results.find((r) => r.subject.toLowerCase() === selectedSubject.toLowerCase());
      const ca = existing?.caScore !== null && existing?.caScore !== undefined ? String(existing.caScore) : "";
      const exam = existing?.examScore !== null && existing?.examScore !== undefined ? String(existing.examScore) : "";
      const score = existing ? String(existing.score) : "";
      const grade = existing?.grade || "";
      const comments = existing?.notes || "";
      const status = existing?.status || "draft";

      const stuId = st.student.id || st.student.child_id || st.enrollmentId || "";
      const rawId = (st.student as any)?.child_unique_id || st.student.nin || st.student.am2050_id || (stuId ? stuId.slice(-6).toUpperCase() : "STUDENT");

      return {
        enrollmentId: st.enrollmentId,
        childId: stuId,
        studentName: `${st.student.first_name || ""} ${st.student.last_name || ""}`.trim() || "Student",
        childUniqueId: rawId,
        gender: st.student.gender || "-",
        caScore: ca,
        examScore: exam,
        score,
        grade,
        comments,
        status,
        isDirty: false,
      };
    });

    setScoreRows(rows);
  }, [classReport, selectedSubject]);

  // Auto-calculate grade based on score
  const calculateGrade = (score: number) => {
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 50) return "C";
    if (score >= 40) return "D";
    return "F";
  };

  // Handle score change in matrix
  const handleScoreChange = (index: number, field: "caScore" | "examScore" | "comments", value: string) => {
    setScoreRows((prev) => {
      const next = [...prev];
      const row = { ...next[index] };

      if (field === "caScore") {
        const caNum = Math.min(40, Math.max(0, Number(value) || 0));
        row.caScore = value === "" ? "" : String(caNum);
        const examNum = Number(row.examScore) || 0;
        const total = (value === "" ? 0 : caNum) + examNum;
        row.score = String(total);
        row.grade = calculateGrade(total);
      } else if (field === "examScore") {
        const examNum = Math.min(60, Math.max(0, Number(value) || 0));
        row.examScore = value === "" ? "" : String(examNum);
        const caNum = Number(row.caScore) || 0;
        const total = caNum + (value === "" ? 0 : examNum);
        row.score = String(total);
        row.grade = calculateGrade(total);
      } else if (field === "comments") {
        row.comments = value;
      }

      row.isDirty = true;
      next[index] = row;
      return next;
    });
  };

  // Determine publication status of the current subject
  const currentSubjectStatus = useMemo(() => {
    if (scoreRows.length === 0) return "draft";
    const hasPublished = scoreRows.some((r) => r.status === "published");
    if (hasPublished) return "published";
    const hasSubmitted = scoreRows.some((r) => r.status === "submitted");
    if (hasSubmitted) return "submitted";
    return "draft";
  }, [scoreRows]);

  const isSubjectLocked = currentSubjectStatus === "published";

  // Check if current user can edit this subject
  const canEditCurrentSubject = useMemo(() => {
    if (isSubjectLocked) return false;
    if (isHeadmaster) return true;
    if (isClassTeacher) return true;
    // Check if allocated as subject teacher
    return allocations.some(
      (a) => a.class_id === selectedClassId && a.subject_name.toLowerCase() === selectedSubject.toLowerCase() && a.teacher_id === user?.id
    );
  }, [isSubjectLocked, isHeadmaster, isClassTeacher, allocations, selectedClassId, selectedSubject, user]);

  // Save Batch of Scores (Draft)
  const handleSaveDraft = async () => {
    if (!selectedClassId || !selectedTermId || !selectedSubject) {
      toast.error("Please select a class, term, and subject.");
      return;
    }
    setSavingScores(true);
    try {
      const records = scoreRows
        .filter((r) => r.caScore !== "" || r.examScore !== "" || r.score !== "")
        .map((r) => ({
          enrollmentId: r.enrollmentId,
          termId: selectedTermId,
          subject: selectedSubject,
          caScore: r.caScore !== "" ? Number(r.caScore) : 0,
          examScore: r.examScore !== "" ? Number(r.examScore) : 0,
          score: Number(r.score) || 0,
          grade: r.grade || calculateGrade(Number(r.score) || 0),
          comments: r.comments || "",
          status: "draft",
        }));

      if (records.length === 0) {
        toast.info("No scores have been entered yet.");
        setSavingScores(false);
        return;
      }

      const res = await apiClient.request<{ savedCount: number }>("/results/batch", {
        method: "POST",
        body: {
          classId: selectedClassId,
          termId: selectedTermId,
          subject: selectedSubject,
          status: "draft",
          records,
        },
      });

      if (res.success) {
        toast.success(`Successfully saved ${res.data.savedCount} student score drafts.`);
        await fetchClassReport();
      } else {
        toast.error(res.error || "Failed to save draft scores.");
      }
    } catch {
      toast.error("An error occurred while saving scores.");
    } finally {
      setSavingScores(false);
    }
  };

  // Submit to Headmaster
  const handleSubmitToHeadmaster = async () => {
    if (!selectedClassId || !selectedTermId || !selectedSubject) return;
    setSavingScores(true);
    try {
      // First save any unsaved entries
      await handleSaveDraft();

      const res = await apiClient.request<{ submittedCount: number }>("/results/submit", {
        method: "POST",
        body: {
          classId: selectedClassId,
          termId: selectedTermId,
          subject: selectedSubject,
        },
      });

      if (res.success) {
        toast.success(`Results for '${selectedSubject}' officially submitted to Headmaster for verification.`);
        await fetchClassReport();
      } else {
        toast.error(res.error || "Failed to submit results.");
      }
    } catch {
      toast.error("An error occurred while submitting results.");
    } finally {
      setSavingScores(false);
    }
  };

  // Publish Results (Headmaster only)
  const handlePublishResults = async () => {
    if (!selectedClassId || !selectedTermId) return;
    setPublishing(true);
    try {
      const res = await apiClient.request<{ publishedCount: number }>("/results/publish", {
        method: "POST",
        body: {
          classId: selectedClassId,
          termId: selectedTermId,
          subject: selectedSubject || undefined,
          note: publishNote || "Approved and published by Headmaster",
        },
      });

      if (res.success) {
        toast.success(`Results officially published (${res.data.publishedCount} records locked).`);
        setPublishDialogOpen(false);
        setPublishNote("");
        await fetchClassReport();
      } else {
        toast.error(res.error || "Failed to publish results.");
      }
    } catch {
      toast.error("An error occurred while publishing results.");
    } finally {
      setPublishing(false);
    }
  };

  // Unpublish / Reopen Results (Headmaster only)
  const handleUnpublishResults = async () => {
    if (!selectedClassId || !selectedTermId) return;
    if (!unpublishReason.trim()) {
      toast.error("Please provide an audit justification to reopen published results.");
      return;
    }
    setPublishing(true);
    try {
      const res = await apiClient.request<{ reopenedCount: number }>("/results/unpublish", {
        method: "POST",
        body: {
          classId: selectedClassId,
          termId: selectedTermId,
          subject: selectedSubject || undefined,
          reason: unpublishReason,
        },
      });

      if (res.success) {
        toast.success(`Results reopened for editing (${res.data.reopenedCount} records unlocked).`);
        setUnpublishDialogOpen(false);
        setUnpublishReason("");
        await fetchClassReport();
      } else {
        toast.error(res.error || "Failed to reopen results.");
      }
    } catch {
      toast.error("An error occurred while reopening results.");
    } finally {
      setPublishing(false);
    }
  };

  // Filtered students for Tab 2
  const filteredStudents = useMemo(() => {
    if (!classReport?.students) return [];
    if (!searchQuery.trim()) return classReport.students;
    const q = searchQuery.toLowerCase();
    return classReport.students.filter(
      (s) =>
        s.student.first_name.toLowerCase().includes(q) ||
        s.student.last_name.toLowerCase().includes(q) ||
        (s.student.nin && s.student.nin.toLowerCase().includes(q)) ||
        (s.student.am2050_id && s.student.am2050_id.toLowerCase().includes(q))
    );
  }, [classReport, searchQuery]);

  // Overall Class Statistics (Subject Tab)
  const subjectStats = useMemo(() => {
    const validScores = scoreRows.filter((r) => r.score !== "").map((r) => Number(r.score));
    if (validScores.length === 0) return null;
    const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
    const max = Math.max(...validScores);
    const min = Math.min(...validScores);
    const passes = validScores.filter((s) => s >= 40).length;
    const passRate = (passes / validScores.length) * 100;
    return {
      count: validScores.length,
      avg: Math.round(avg * 10) / 10,
      max,
      min,
      passRate: Math.round(passRate * 10) / 10,
    };
  }, [scoreRows]);

  // Export Master Ledger to CSV
  const handleExportCSV = () => {
    if (!classReport) return;
    const headers = ["Rank", "First Name", "Last Name", "Learner ID", "Gender", "Total Score", "Average %", "Grade", "Standing"];
    const rows = classReport.students.map((st) => [
      st.summary.rank || "-",
      st.student.first_name,
      st.student.last_name,
      st.student.nin || st.student.am2050_id || st.student.id,
      st.student.gender || "-",
      st.summary.totalScore,
      st.summary.averageScore,
      st.summary.overallGrade,
      st.summary.decision,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Master_Results_${classReport.class.name}_${classReport.term.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">

        {/* 1. TOP HEADER & OPERATIONAL CONTEXT BANNER */}
        <header className="flex flex-col justify-between gap-4 border-b border-[#cfd9d2] pb-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="coordinate-label">Universal Basic Education • Academic Registry</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                <FileCheck size={12} />
                UBEC Verified Ledger
              </span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#123148] sm:text-3xl">
              Student Result Management & Report Cards
            </h1>
            <p className="mt-1 text-sm text-[#57707f]">
              Classroom Continuous Assessment (40%), Terminal Examinations (60%), and A4 Printable Dossiers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Batch Print All Cards */}
            <button
              onClick={() => {
                setActiveStudentId(undefined);
                setReportModalOpen(true);
              }}
              disabled={!classReport || classReport.students.length === 0}
              className="action-press inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <Printer size={16} />
              <span>Print Class Batch ({classReport?.students.length || 0} A4 Dossiers)</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => void fetchClassReport()}
              disabled={loadingReport}
              className="action-press inline-flex items-center gap-2 rounded-lg border border-[#b9c9c0] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#234c64] hover:border-[#167a4c] transition-colors"
            >
              <RefreshCw size={15} className={loadingReport ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {/* 2. FILTER & CONTEXT CONTROL STRIP */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border border-[#d8e0da] bg-white p-4 shadow-sm">
          {/* Class Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Target Class
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="field-input field-select w-full font-semibold text-slate-800"
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.class_name} ({cls.class_level}) — {cls.school_name || "School"}
                </option>
              ))}
            </select>
          </div>

          {/* Academic Term Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Academic Term
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="field-input field-select w-full font-semibold text-slate-800"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.term_name} · {t.academic_year} {t.status === "active" ? "(Current)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* User Role & Operational Scope Badge */}
          <div className="flex flex-col justify-center rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Authenticated Role Scope</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <UserCheck size={15} className="text-emerald-700" />
              <span className="text-xs font-bold text-slate-800 capitalize">
                {user?.role.replace("_", " ")}
                {isClassTeacher ? " (Form Master)" : ""}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 truncate">
              {classReport?.class?.schoolName || "GDJSS AHOTO"}
            </span>
          </div>

          {/* Headmaster Publication Control */}
          <div className="flex flex-col justify-center rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <span className="text-[10px] font-bold uppercase text-slate-400">Institutional Result Status</span>
            <div className="flex items-center justify-between mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold uppercase ${
                  currentSubjectStatus === "published"
                    ? "text-emerald-700"
                    : currentSubjectStatus === "submitted"
                    ? "text-blue-700"
                    : "text-amber-700"
                }`}
              >
                {currentSubjectStatus === "published" ? (
                  <>
                    <Lock size={13} /> Published & Locked
                  </>
                ) : currentSubjectStatus === "submitted" ? (
                  <>
                    <CheckCircle size={13} /> Submitted to HM
                  </>
                ) : (
                  <>
                    <Clock size={13} /> Draft Mode
                  </>
                )}
              </span>

              {isHeadmaster && (
                <div className="flex items-center gap-1.5">
                  {currentSubjectStatus === "published" ? (
                    <button
                      onClick={() => setUnpublishDialogOpen(true)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline"
                      title="Reopen for corrections"
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => setPublishDialogOpen(true)}
                      className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-800"
                    >
                      <ShieldCheck size={11} /> Publish
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. NAVIGATION VIEW TABS */}
        <div className="flex items-center justify-between border-b border-[#d8e0da]">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("scores")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "scores"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <BookOpen size={16} />
              <span>By Subject & Scores</span>
            </button>

            <button
              onClick={() => setActiveTab("students")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "students"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <Award size={16} />
              <span>By Students & Report Cards</span>
              {classReport && (
                <span className="rounded-full bg-slate-200 px-2 py-0.2 text-xs font-bold text-slate-700">
                  {classReport.students.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("ledger")}
              className={`action-press inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${
                activeTab === "ledger"
                  ? "border-[#167a4c] text-[#0e5a38]"
                  : "border-transparent text-[#617985] hover:text-[#234c64]"
              }`}
            >
              <FileSpreadsheet size={16} />
              <span>Master Results Ledger</span>
            </button>
          </div>

          {activeTab === "students" && (
            <div className="relative hidden sm:block w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search learner name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-9 pr-3 text-xs focus:border-emerald-600 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* 4. TAB 1: BY SUBJECT & SCORES (GRADEBOOK MATRIX) */}
        {activeTab === "scores" && (
          <section className="space-y-4">
            {/* Subject Control & Stats Strip */}
            <div className="flex flex-col gap-4 rounded-xl border border-[#d8e0da] bg-white p-4 lg:flex-row lg:items-center lg:justify-between shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-60">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Select Subject
                  </label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="field-input field-select w-full font-bold text-slate-800"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.subject_name}>
                        {sub.subject_name} ({sub.subject_code})
                      </option>
                    ))}
                  </select>
                </div>

                {isSubjectLocked && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-800">
                    <Lock size={14} />
                    <span>Official Published Record — Read Only</span>
                  </div>
                )}

                {!canEditCurrentSubject && !isSubjectLocked && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800">
                    <ShieldAlert size={14} />
                    <span>View Only: You are not assigned to this subject.</span>
                  </div>
                )}
              </div>

              {/* Subject Class Statistics Bar */}
              {subjectStats && (
                <div className="flex items-center gap-3 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Class Average</span>
                    <strong className="text-sm font-mono text-emerald-800">{subjectStats.avg}%</strong>
                  </div>
                  <div className="border-l border-slate-300 pl-3">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">High / Low</span>
                    <strong className="font-mono text-slate-800">
                      {subjectStats.max}% / {subjectStats.min}%
                    </strong>
                  </div>
                  <div className="border-l border-slate-300 pl-3">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Pass Rate</span>
                    <strong className="font-mono text-blue-800">{subjectStats.passRate}%</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Score Entry Matrix Table */}
            <div className="overflow-x-auto rounded-xl border border-[#d8e0da] bg-white shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-4">Learner Identity</th>
                    <th className="py-3 px-3 w-16 text-center">Gender</th>
                    <th className="py-3 px-3 w-28 text-center bg-emerald-50/50">C.A. (Max 40)</th>
                    <th className="py-3 px-3 w-28 text-center bg-blue-50/50">Exam (Max 60)</th>
                    <th className="py-3 px-3 w-24 text-center bg-slate-200/60 font-black">Total (100)</th>
                    <th className="py-3 px-3 w-16 text-center">Grade</th>
                    <th className="py-3 px-4">Subject Teacher Notes / Remarks</th>
                    <th className="py-3 px-3 w-24 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {scoreRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                        {loadingReport ? "Loading learners and academic scores..." : "No learners found in this class."}
                      </td>
                    </tr>
                  ) : (
                    scoreRows.map((row, idx) => {
                      const totalNum = Number(row.score) || 0;
                      return (
                        <tr
                          key={row.enrollmentId}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            row.isDirty ? "bg-amber-50/40" : idx % 2 === 1 ? "bg-slate-50/30" : "bg-white"
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-900">
                            <div>
                              <span>{row.studentName}</span>
                              <span className="block font-mono text-[10px] text-slate-400">{row.childUniqueId}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center uppercase text-slate-600 font-mono text-[11px]">
                            {row.gender}
                          </td>

                          {/* CA Score Input */}
                          <td className="py-2 px-3 text-center bg-emerald-50/30">
                            <input
                              type="number"
                              min="0"
                              max="40"
                              step="0.5"
                              disabled={!canEditCurrentSubject}
                              value={row.caScore}
                              placeholder="0-40"
                              onChange={(e) => handleScoreChange(idx, "caScore", e.target.value)}
                              className="w-20 text-center font-mono font-bold text-slate-900 rounded border border-slate-300 py-1 focus:border-emerald-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>

                          {/* Exam Score Input */}
                          <td className="py-2 px-3 text-center bg-blue-50/30">
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="0.5"
                              disabled={!canEditCurrentSubject}
                              value={row.examScore}
                              placeholder="0-60"
                              onChange={(e) => handleScoreChange(idx, "examScore", e.target.value)}
                              className="w-20 text-center font-mono font-bold text-slate-900 rounded border border-slate-300 py-1 focus:border-blue-600 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                            />
                          </td>

                          {/* Total Score Output */}
                          <td className="py-2.5 px-3 text-center bg-slate-100/50 font-mono font-black text-sm text-slate-900">
                            {row.score !== "" ? totalNum.toFixed(1) : "-"}
                          </td>

                          {/* Grade Badge */}
                          <td className="py-2.5 px-3 text-center">
                            {row.grade ? (
                              <span
                                className={`inline-block px-2 py-0.5 rounded font-black text-[11px] border ${
                                  row.grade === "A"
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : row.grade === "B"
                                    ? "bg-blue-100 text-blue-800 border-blue-300"
                                    : row.grade === "C"
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : row.grade === "D"
                                    ? "bg-orange-100 text-orange-800 border-orange-300"
                                    : "bg-rose-100 text-rose-800 border-rose-300"
                                }`}
                              >
                                {row.grade}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>

                          {/* Comments */}
                          <td className="py-2 px-4">
                            <input
                              type="text"
                              disabled={!canEditCurrentSubject}
                              value={row.comments}
                              placeholder="Subject teacher remark..."
                              onChange={(e) => handleScoreChange(idx, "comments", e.target.value)}
                              className="w-full text-xs text-slate-700 rounded border border-slate-200 py-1 px-2 focus:border-emerald-600 focus:outline-none disabled:bg-transparent disabled:border-transparent"
                            />
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                row.status === "published"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : row.status === "submitted"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Action Bar at Bottom of Matrix */}
              {canEditCurrentSubject && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">Quick Reminder:</span> Standard UBE CA threshold is 40%, terminal examination 60%.
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSaveDraft}
                      disabled={savingScores}
                      className="action-press inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <Clock size={14} />
                      <span>{savingScores ? "Saving..." : "Save Draft"}</span>
                    </button>

                    <button
                      onClick={handleSubmitToHeadmaster}
                      disabled={savingScores}
                      className="action-press inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors disabled:opacity-50"
                    >
                      <Send size={14} />
                      <span>Submit to Headmaster</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. TAB 2: BY STUDENTS & REPORT CARDS (ROSTER & A4 DOSSIER) */}
        {activeTab === "students" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#d8e0da] shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Terminal Academic Performance & Class Standings
                </h3>
                <p className="text-xs text-slate-500">
                  Click any learner name or report button to open their formal printable A4 report card.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setActiveStudentId(undefined);
                    setReportModalOpen(true);
                  }}
                  className="action-press inline-flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs font-bold shadow-sm transition-colors"
                >
                  <Printer size={15} />
                  <span>Batch Print Entire Class</span>
                </button>
              </div>
            </div>

            {/* Roster Table */}
            <div className="overflow-x-auto rounded-xl border border-[#d8e0da] bg-white shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                    <th className="py-3 px-3 w-14 text-center">Rank</th>
                    <th className="py-3 px-4">Learner Full Name</th>
                    <th className="py-3 px-3">Registry ID</th>
                    <th className="py-3 px-3 text-center">Gender</th>
                    <th className="py-3 px-3 text-center">Attendance</th>
                    <th className="py-3 px-3 text-center">Subjects</th>
                    <th className="py-3 px-3 text-center font-black">Total Score</th>
                    <th className="py-3 px-3 text-center font-black">Average %</th>
                    <th className="py-3 px-3 text-center">Grade</th>
                    <th className="py-3 px-3 text-center">Standing</th>
                    <th className="py-3 px-4 text-right">Formal Dossier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400 italic">
                        {loadingReport ? "Compiling student report standings..." : "No learners match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st) => {
                      const rank = st.summary.rank || 0;
                      return (
                        <tr
                          key={st.enrollmentId}
                          className="hover:bg-slate-50 transition-colors cursor-pointer group"
                          onClick={() => {
                            setActiveStudentId(st.student.id || st.student.child_id);
                            setReportModalOpen(true);
                          }}
                        >
                          {/* Standing / Rank */}
                          <td className="py-3 px-3 text-center">
                            {rank === 1 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs shadow-sm">
                                1
                              </span>
                            ) : rank === 2 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 text-slate-900 font-black text-xs shadow-sm">
                                2
                              </span>
                            ) : rank === 3 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs shadow-sm">
                                3
                              </span>
                            ) : (
                              <span className="font-mono text-slate-500 font-semibold">{rank}th</span>
                            )}
                          </td>

                          {/* Student Name */}
                          <td className="py-3 px-4 font-bold text-emerald-950 group-hover:text-emerald-700 underline decoration-slate-300 underline-offset-2">
                            {st.student.last_name}, {st.student.first_name}
                          </td>

                          {/* Registry ID */}
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                            {(st.student as any)?.child_unique_id || st.student.nin || st.student.am2050_id || (st.student.id ? `NG-${st.student.id.slice(-6).toUpperCase()}` : st.student.child_id ? `NG-${st.student.child_id.slice(-6).toUpperCase()}` : "NG-STUDENT")}
                          </td>

                          {/* Gender */}
                          <td className="py-3 px-3 text-center uppercase text-slate-600 font-mono text-[11px]">
                            {st.student.gender || "-"}
                          </td>

                          {/* Attendance Rate */}
                          <td className="py-3 px-3 text-center font-mono text-slate-700">
                            {st.attendance.rate}%
                          </td>

                          {/* Evaluated Subject Count */}
                          <td className="py-3 px-3 text-center font-mono text-slate-600">
                            {st.summary.subjectCount} / {classReport?.subjects.length || 10}
                          </td>

                          {/* Cumulative Total */}
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                            {st.summary.totalScore}
                          </td>

                          {/* Terminal Average */}
                          <td className="py-3 px-3 text-center font-mono font-black text-emerald-900 text-sm">
                            {st.summary.averageScore}%
                          </td>

                          {/* Letter Grade */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-black text-xs border ${
                                st.summary.overallGrade === "A"
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : st.summary.overallGrade === "B"
                                  ? "bg-blue-100 text-blue-800 border-blue-300"
                                  : st.summary.overallGrade === "C"
                                  ? "bg-amber-100 text-amber-800 border-amber-300"
                                  : st.summary.overallGrade === "D"
                                  ? "bg-orange-100 text-orange-800 border-orange-300"
                                  : "bg-rose-100 text-rose-800 border-rose-300"
                              }`}
                            >
                              {st.summary.overallGrade}
                            </span>
                          </td>

                          {/* Standing */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                st.summary.decision === "PASSED"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {st.summary.decision}
                            </span>
                          </td>

                          {/* Dossier Action */}
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveStudentId(st.student.id || st.student.child_id);
                                setReportModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              <Printer size={13} />
                              <span>A4 Report</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 6. TAB 3: MASTER RESULTS LEDGER & CSV EXPORT */}
        {activeTab === "ledger" && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#d8e0da] shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Comprehensive Institutional Score Register
                </h3>
                <p className="text-xs text-slate-500">
                  Complete audit ledger with exportable CSV data for regional education planning.
                </p>
              </div>

              <button
                onClick={handleExportCSV}
                className="action-press inline-flex items-center gap-2 rounded-lg bg-[#234c64] hover:bg-[#1a384b] text-white px-4 py-2 text-xs font-bold shadow-sm transition-colors"
              >
                <Download size={14} />
                <span>Export Class Results CSV</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#d8e0da] bg-white shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-4">Learner Name</th>
                    <th className="py-3 px-3">Unique ID</th>
                    {classReport?.subjects.map((s, sIdx) => {
                      const subName = typeof s === "string" ? s : (s as any)?.subject_name || String(s || "");
                      return (
                        <th key={subName || sIdx} className="py-3 px-2 text-center border-l border-slate-200">
                          {subName ? subName.slice(0, 4) : "SUB"}
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center border-l border-slate-300 bg-slate-200/50">Total</th>
                    <th className="py-3 px-3 text-center bg-slate-200/50">Average</th>
                    <th className="py-3 px-3 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {classReport?.students.map((st, idx) => (
                    <tr key={st.enrollmentId} className={idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"}>
                      <td className="py-2 px-3 text-center font-mono text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-4 font-semibold text-slate-800">
                        {st.student.first_name} {st.student.last_name}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500 text-[10px]">
                        {(st.student as any)?.child_unique_id || st.student.nin || st.student.am2050_id || (st.student.id ? st.student.id.slice(-6).toUpperCase() : st.student.child_id ? st.student.child_id.slice(-6).toUpperCase() : "STUDENT")}
                      </td>

                      {classReport.subjects.map((sub, sIdx) => {
                        const subName = typeof sub === "string" ? sub : (sub as any)?.subject_name || String(sub || "");
                        const r = st.results.find((item) => item.subject && item.subject.toLowerCase() === subName.toLowerCase());
                        return (
                          <td key={subName || sIdx} className="py-2 px-2 text-center font-mono text-slate-700 border-l border-slate-200">
                            {r ? r.score : "-"}
                          </td>
                        );
                      })}

                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 border-l border-slate-300 bg-slate-50">
                        {st.summary.totalScore}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-black text-emerald-900 bg-slate-50">
                        {st.summary.averageScore}%
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800">
                        {st.summary.overallGrade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 7. FORMAL A4 REPORT CARD MODAL */}
        {reportModalOpen && classReport && (
          <FormalReportCardModal
            isOpen={reportModalOpen}
            onClose={() => setReportModalOpen(false)}
            schoolInfo={{
              name: classReport.class.schoolName,
              code: classReport.class.schoolCode || "AM2050-SCH-0003",
              state: classReport.class.state || "Kano",
              lga: classReport.class.lga || "Kano Municipal",
            }}
            classInfo={{
              name: classReport.class.name,
              level: classReport.class.level,
              teacherName: classReport.class.teacherName,
            }}
            termInfo={{
              name: classReport.term.name,
              academicYear: classReport.term.academicYear,
              startDate: classReport.term.startDate,
              endDate: classReport.term.endDate,
              nextTermBegins: classReport.term.nextTermBegins,
            }}
            sheets={classReport.students}
            activeStudentId={activeStudentId}
          />
        )}

        {/* 8. HEADMASTER PUBLISH CONFIRMATION DIALOG */}
        {publishDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Publish Academic Results
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Publishing locks scores against further modifications by teachers and generates certified student dossiers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Official Headmaster Attestation Note
                </label>
                <input
                  type="text"
                  value={publishNote}
                  onChange={(e) => setPublishNote(e.target.value)}
                  placeholder="e.g. Verified and approved by Headmaster."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setPublishDialogOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublishResults}
                  disabled={publishing}
                  className="rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publishing..." : "Confirm & Publish"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 9. HEADMASTER REOPEN / UNPUBLISH DIALOG */}
        {unpublishDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <Unlock size={28} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Reopen Published Results
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Unlocking results allows teachers to correct scores. An audit reason is mandatory.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Audit Justification / Correction Reason *
                </label>
                <textarea
                  value={unpublishReason}
                  onChange={(e) => setUnpublishReason(e.target.value)}
                  placeholder="e.g. Correcting computational tally error in Mathematics CA..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-amber-600 focus:outline-none min-h-[80px]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setUnpublishDialogOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnpublishResults}
                  disabled={publishing || !unpublishReason.trim()}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 text-xs font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {publishing ? "Unlocking..." : "Reopen Results"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
