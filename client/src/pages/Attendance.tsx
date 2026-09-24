/* AM2050 — Field Ledger Modernism: attendance is a daily field register where each status remains accountable and visible. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Check, CircleAlert, ClipboardCheck, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { LedgerColumn, LedgerTable } from "@/components/shared/LedgerTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import AttendanceQrScanner from "@/components/school/AttendanceQrScanner";
import { Role } from "@/lib/access";
import { ClassroomAttendancePosterModal } from "@/components/school/ClassroomAttendancePosterModal";

type School = { id: string; school_name: string };
type SchoolClass = { id: string; class_name: string; class_level: string; school_id: string };
type Enrollment = { id: string; child_id: string; school_id: string; class_id: string | null; class_level: string; enrollment_status: string; child_unique_id: string; first_name: string; last_name: string; school_name: string };
type AttendanceRecord = { id: string; child_id: string; school_id: string; class_id: string | null; date: string; attendance_status: "present" | "absent" | "late" | "excused"; scanned_by: string | null; created_at: string };
type FormState = { enrollmentId: string; childId: string; schoolId: string; classId: string; date: string; attendanceStatus: "present" | "absent" | "late" | "excused" };

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): FormState => ({ enrollmentId: "", childId: "", schoolId: "", classId: "", date: today(), attendanceStatus: "present" });
const captureRoles: Role[] = ["headmaster", "teacher"];
const statusTone = (status: AttendanceRecord["attendance_status"]) => status === "present" ? "success" : status === "late" ? "attention" : status === "absent" ? "danger" : "neutral";

export default function Attendance({ role }: { role: Role }) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(blank);
  const [filterDate, setFilterDate] = useState(today());
  const [filterSchool, setFilterSchool] = useState("all");
  const [filterClass, setFilterClass] = useState("all");
  const [search, setSearch] = useState("");
  const [posterOpen, setPosterOpen] = useState(false);
  const canCapture = captureRoles.includes(role);

  const load = async () => {
    setLoading(true);
    const [attendanceResult, enrollmentResult, schoolResult, classResult] = await Promise.all([
      apiClient.request<AttendanceRecord[]>("/attendance?limit=300"),
      apiClient.request<Enrollment[]>("/enrollments?limit=300"),
      apiClient.request<School[]>("/schools?limit=250"),
      apiClient.request<SchoolClass[]>("/classes?limit=250"),
    ]);
    if (attendanceResult.success) setRecords(attendanceResult.data);
    if (enrollmentResult.success) setEnrollments(enrollmentResult.data);
    if (schoolResult.success) setSchools(schoolResult.data);
    if (classResult.success) setClasses(classResult.data);
    if (!attendanceResult.success) toast.error(attendanceResult.error);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const activeEnrollments = useMemo(() => enrollments.filter((item) => item.enrollment_status === "active"), [enrollments]);
  const selectedEnrollment = useMemo(() => activeEnrollments.find((item) => item.id === form.enrollmentId), [activeEnrollments, form.enrollmentId]);
  const classesForSchool = useMemo(() => classes.filter((item) => item.school_id === form.schoolId), [classes, form.schoolId]);
  const filterClasses = useMemo(() => classes.filter((item) => filterSchool === "all" || item.school_id === filterSchool), [classes, filterSchool]);
  const filtered = useMemo(() => records.filter((record) => {
    if (filterDate && record.date !== filterDate) return false;
    if (filterSchool !== "all" && record.school_id !== filterSchool) return false;
    if (filterClass !== "all" && record.class_id !== filterClass) return false;
    const linked = enrollments.find((item) => item.child_id === record.child_id);
    return `${linked?.child_unique_id ?? ""} ${linked?.first_name ?? ""} ${linked?.last_name ?? ""}`.toLowerCase().includes(search.toLowerCase());
  }), [records, filterDate, filterSchool, filterClass, search, enrollments]);
  const dailyCounts = useMemo(() => filtered.reduce((total, record) => ({ ...total, [record.attendance_status]: total[record.attendance_status] + 1 }), { present: 0, absent: 0, late: 0, excused: 0 }), [filtered]);

  const posterSchoolName = schools.find((s) => s.id === filterSchool)?.school_name || "SUBEB Community Learning Centre";
  const posterClassName = classes.find((c) => c.id === filterClass)?.class_name || "All Enrolled Classes";
  const posterStudents = useMemo(() => {
    return activeEnrollments
      .filter((e) => (filterSchool === "all" || e.school_id === filterSchool) && (filterClass === "all" || e.class_id === filterClass))
      .map((e) => ({
        id: e.child_id,
        childCode: e.child_unique_id,
        fullName: `${e.first_name} ${e.last_name}`,
        attendanceToken: e.child_unique_id,
      }));
  }, [activeEnrollments, filterSchool, filterClass]);

  const chooseEnrollment = (enrollmentId: string) => {
    const enrollment = activeEnrollments.find((item) => item.id === enrollmentId);
    setForm((current) => ({ ...current, enrollmentId, childId: enrollment?.child_id ?? "", schoolId: enrollment?.school_id ?? "", classId: enrollment?.class_id ?? "" }));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.enrollmentId || !form.childId || !form.schoolId || !form.date) { toast.error("Choose an active enrollment and attendance date."); return; }
    setSaving(true);
    const result = await apiClient.request<AttendanceRecord>("/attendance", { method: "POST", body: { childId: form.childId, schoolId: form.schoolId, classId: form.classId || undefined, date: form.date, attendanceStatus: form.attendanceStatus } });
    setSaving(false);
    if (!result.success) { toast.error(result.error); return; }
    toast.success("Attendance register updated."); setFilterDate(form.date); await load();
  };
  const scan = async (qrToken: string) => { setSaving(true); const result=await apiClient.request<AttendanceRecord>("/attendance/scan",{method:"POST",body:{qrToken,date:form.date,attendanceStatus:form.attendanceStatus,schoolId:form.schoolId||undefined,classId:form.classId||undefined}});setSaving(false);if(!result.success){toast.error(result.error);return}toast.success("QR attendance recorded.");setFilterDate(form.date);await load(); };
  const columns: LedgerColumn<AttendanceRecord & { localId: string }>[] = [
    { key: "child", label: "Child", cell: (row) => { const enrollment = enrollments.find((item) => item.child_id === row.child_id); return <div><p className="font-semibold text-[#234c64]">{enrollment ? `${enrollment.first_name} ${enrollment.last_name}` : "Scoped child record"}</p><p className="mt-0.5 font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[#718592]">{enrollment?.child_unique_id ?? row.child_id}</p></div>; } },
    { key: "school", label: "Placement", cell: (row) => { const enrollment = enrollments.find((item) => item.child_id === row.child_id); return <div><p className="font-semibold text-[#38566a]">{enrollment?.school_name ?? "Scoped school"}</p><p className="mt-0.5 text-xs text-[#718592]">{enrollment?.class_level ?? "Class not specified"}</p></div>; } },
    { key: "date", label: "Attendance date", cell: (row) => <span className="font-mono text-xs text-[#5f7580]">{row.date}</span> },
    { key: "status", label: "Condition", cell: (row) => <StatusBadge label={row.attendance_status} tone={statusTone(row.attendance_status)} /> },
    { key: "source", label: "Recorded", cell: (row) => <span className="font-mono text-[0.62rem] text-[#718592]">{row.created_at?.slice(0, 16).replace("T", " ") ?? "—"}</span> },
  ];
  const rows = filtered.map((item) => ({ ...item, localId: item.id }));

  return <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8 lg:pt-8"><section className="mx-auto max-w-[1440px]"><div className="flex flex-col justify-between gap-5 border-b border-[#cfd9d2] pb-5 lg:flex-row lg:items-end"><div><p className="coordinate-label">Daily Tracking</p><h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.05em] text-[#123148] sm:text-3xl">Student Attendance</h1><p className="mt-2 max-w-2xl text-[0.98rem] leading-6 text-[#57707f]">Record and monitor daily attendance for enrolled students across public and Tsangaya learning centres.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setPosterOpen(true)} className="action-press inline-flex items-center gap-2 self-start rounded-md bg-[#167a4c] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#12643e] lg:self-auto"><Printer size={16} /> Print Roll-Call Poster</button><button onClick={() => void load()} disabled={loading} className="action-press inline-flex items-center gap-2 self-start rounded-md border border-[#b9c9c0] bg-white px-4 py-2.5 text-sm font-semibold text-[#234c64] hover:border-[#167a4c] lg:self-auto"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button></div></div>
    <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(20rem,1.2fr)]"><article className="border border-[#d8e0da] bg-white p-5 shadow-[0_8px_28px_rgba(18,49,72,0.045)]"><div className="flex items-start justify-between gap-3"><div><p className="coordinate-label text-[#557160]">Attendance Entry</p><h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.04em] text-[#123148]">Record attendance</h2></div><CalendarCheck2 className="text-[#167a4c]" size={21} /></div>{canCapture ? <form onSubmit={save} className="mt-5 space-y-4"><AttendanceQrScanner onToken={scan} disabled={saving}/><label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#234c64]">Active enrollment <span className="text-[#ae3f32]">*</span></span><select className="field-input field-select" value={form.enrollmentId} onChange={(event) => chooseEnrollment(event.target.value)}><option value="">Choose enrolled child</option>{activeEnrollments.map((item) => <option key={item.id} value={item.id}>{item.first_name} {item.last_name} — {item.school_name}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#234c64]">Date <span className="text-[#ae3f32]">*</span></span><input className="field-input" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></label><label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#234c64]">Class</span><select className="field-input field-select" value={form.classId} onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))} disabled={!form.schoolId}><option value="">No class assigned</option>{classesForSchool.map((item) => <option key={item.id} value={item.id}>{item.class_name}</option>)}</select></label></div><div><span className="mb-2 block text-sm font-semibold text-[#234c64]">Attendance status</span><div className="grid grid-cols-2 gap-2">{(["present", "late", "absent", "excused"] as const).map((status) => <button type="button" key={status} onClick={() => setForm((current) => ({ ...current, attendanceStatus: status }))} className={`action-press rounded-md border px-3 py-2.5 text-sm font-semibold capitalize ${form.attendanceStatus === status ? status === "present" ? "border-[#167a4c] bg-[#e7f4eb] text-[#0e5a38]" : status === "absent" ? "border-[#b84b3f] bg-[#fae9e7] text-[#96372d]" : "border-[#c88b25] bg-[#fbf2df] text-[#815813]" : "border-[#d8e0da] bg-white text-[#57707f] hover:border-[#b9c9c0]"}`}>{status === "present" && <Check size={15} className="mr-1 inline" />}{status}</button>)}</div></div><div className="border-l-2 border-[#c88b25] bg-[#fbf7ed] px-3 py-2 text-xs leading-5 text-[#7a611e]"><CircleAlert className="mr-1 inline" size={14} />A later entry for the same child and date replaces the earlier record.</div><button type="submit" disabled={saving} className="action-press flex w-full items-center justify-center gap-2 rounded-md bg-[#167a4c] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0e5a38] disabled:opacity-60"><ClipboardCheck size={17} />{saving ? "Saving…" : "Save attendance"}</button></form> : <p className="mt-5 border-l-2 border-[#c88b25] bg-[#fbf7ed] px-3 py-3 text-sm leading-6 text-[#7a611e]">Attendance entry is not available for this role.</p>}</article>
      <article className="border border-[#d8e0da] bg-white p-5 shadow-[0_8px_28px_rgba(18,49,72,0.045)]"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="coordinate-label">Daily Summary</p><h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.04em] text-[#123148]">{filterDate || "All recorded dates"}</h2></div><div className="grid grid-cols-2 gap-2 sm:flex"><div className="border border-[#cde3d4] bg-[#f3faf5] px-3 py-2 text-center"><p className="font-display text-lg font-semibold text-[#0e5a38]">{dailyCounts.present}</p><p className="font-mono text-[0.52rem] uppercase text-[#4a725a]">Present</p></div><div className="border border-[#f0d8d3] bg-[#fdf6f4] px-3 py-2 text-center"><p className="font-display text-lg font-semibold text-[#96372d]">{dailyCounts.absent}</p><p className="font-mono text-[0.52rem] uppercase text-[#8f534b]">Absent</p></div><div className="border border-[#ead7ae] bg-[#fdf8ed] px-3 py-2 text-center"><p className="font-display text-lg font-semibold text-[#815813]">{dailyCounts.late + dailyCounts.excused}</p><p className="font-mono text-[0.52rem] uppercase text-[#8d6b2e]">Other</p></div></div></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#57707f]">Date</span><input className="field-input !min-h-10" type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#57707f]">School</span><select className="field-input field-select !min-h-10" value={filterSchool} onChange={(event) => {setFilterSchool(event.target.value);setFilterClass("all")}}><option value="all">All schools in scope</option>{schools.map((school) => <option key={school.id} value={school.id}>{school.school_name}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#57707f]">Class</span><select className="field-input field-select !min-h-10" value={filterClass} onChange={(event)=>setFilterClass(event.target.value)}><option value="all">All classes</option>{filterClasses.map(item=><option key={item.id} value={item.id}>{item.class_name} · {item.class_level}</option>)}</select></label></div></article></section>
    <section className="mt-5"><div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718592]" size={17} /><input aria-label="Search attendance register" value={search} onChange={(event) => setSearch(event.target.value)} className="field-input pl-10" placeholder="Search child name or ID…" /></div><p className="font-mono text-[0.65rem] uppercase tracking-[0.1em] text-[#718592]">{filtered.length} daily records</p></div><LedgerTable rows={rows} columns={columns} emptyMessage={loading ? "Loading scoped attendance records…" : "No attendance records match the selected daily view."} /></section>
    <ClassroomAttendancePosterModal
      isOpen={posterOpen}
      onClose={() => setPosterOpen(false)}
      schoolName={posterSchoolName}
      className={posterClassName}
      students={posterStudents}
    />
  </section></main>;
}
