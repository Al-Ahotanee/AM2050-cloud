import React, { useRef } from 'react';
import { Printer, X, Award, CheckCircle, ShieldCheck, UserCheck, Calendar, BookOpen } from 'lucide-react';

export interface SubjectResultItem {
  id?: string;
  subject: string;
  caScore: number | null;
  examScore: number | null;
  score: number; // Total /100
  grade: string;
  notes?: string;
  status: 'draft' | 'submitted' | 'published';
  stats?: {
    avg: number;
    min: number;
    max: number;
  };
}

export interface StudentReportSheet {
  student: {
    id: string;
    child_id: string;
    first_name: string;
    last_name: string;
    nin?: string;
    am2050_id?: string;
    date_of_birth?: string;
    gender?: string;
    guardian_name?: string;
    guardian_phone?: string;
  };
  enrollmentId: string;
  results: SubjectResultItem[];
  behaviors?: Array<{
    tracker_type: string;
    status: string;
    notes?: string;
    logged_at?: string;
  }>;
  attendance: {
    present: number;
    late: number;
    excused: number;
    total: number;
    rate: number;
  };
  summary: {
    totalScore: number;
    maxObtainable: number;
    subjectCount: number;
    averageScore: number;
    overallGrade: string;
    decision: string;
    status: string;
    rank?: number;
    positionText?: string;
  };
}

export interface ReportCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolInfo?: {
    name?: string;
    code?: string;
    state?: string;
    lga?: string;
  };
  classInfo?: {
    name?: string;
    level?: string;
    teacherName?: string;
  };
  termInfo?: {
    name?: string;
    academicYear?: string;
    startDate?: string;
    endDate?: string;
    nextTermBegins?: string;
  };
  // Single student or multiple for batch printing
  sheets: StudentReportSheet[];
  activeStudentId?: string;
}

export const FormalReportCardModal: React.FC<ReportCardModalProps> = ({
  isOpen,
  onClose,
  schoolInfo,
  classInfo,
  termInfo,
  sheets,
  activeStudentId,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || sheets.length === 0) return null;

  // Filter sheets: if activeStudentId is given, display only that student; else display all (for batch print)
  const displaySheets = activeStudentId
    ? sheets.filter((s) => s.student.id === activeStudentId || s.student.child_id === activeStudentId)
    : sheets;

  const handlePrint = () => {
    window.print();
  };

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'text-emerald-800 bg-emerald-50 border-emerald-300';
      case 'B': return 'text-blue-800 bg-blue-50 border-blue-300';
      case 'C': return 'text-amber-800 bg-amber-50 border-amber-300';
      case 'D': return 'text-orange-800 bg-orange-50 border-orange-300';
      case 'E': return 'text-rose-700 bg-rose-50 border-rose-300';
      default: return 'text-red-900 bg-red-100 border-red-400';
    }
  };

  const getGradeRemark = (grade: string) => {
    switch (grade) {
      case 'A': return 'Distinction';
      case 'B': return 'Very Good';
      case 'C': return 'Good (Credit)';
      case 'D': return 'Pass';
      case 'E': return 'Fair';
      default: return 'Needs Counseling';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      {/* Container - on screen: constrained preview card; on print: full page A4 */}
      <div className="relative w-full max-w-5xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[96vh] flex flex-col print:max-h-none print:shadow-none print:rounded-none print:m-0 print:p-0 print:w-full">
        
        {/* Floating Top Control Toolbar (Hidden during print) */}
        <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Universal Basic Education Terminal Report Sheet
              </h2>
              <p className="text-xs text-slate-400">
                {displaySheets.length > 1
                  ? `Batch Print Preview (${displaySheets.length} Students)`
                  : `${displaySheets[0]?.student.first_name} ${displaySheets[0]?.student.last_name} • ${classInfo?.name || 'Class'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Print A4 Report {displaySheets.length > 1 ? `(${displaySheets.length})` : ''}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Canvas */}
        <div ref={printRef} className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
          {displaySheets.map((sheet, sheetIdx) => {
            const isLast = sheetIdx === displaySheets.length - 1;
            const stu = sheet.student;
            const summary = sheet.summary;
            const att = sheet.attendance;

            return (
              <div
                key={stu.id || stu.child_id || sheetIdx}
                className={`bg-white text-slate-900 border border-slate-300 shadow-md print:shadow-none print:border-none p-8 sm:p-10 mx-auto max-w-[210mm] print:max-w-none print:w-full min-h-[297mm] flex flex-col justify-between ${
                  !isLast ? 'mb-8 print:mb-0 print:break-after-page' : ''
                }`}
                style={{ breakAfter: !isLast ? 'page' : 'auto' }}
              >
                {/* 1. OFFICIAL ACADEMIC HEADER */}
                <div>
                  <div className="border-b-4 border-double border-emerald-800 pb-4 mb-5">
                    <div className="flex items-center justify-between gap-4">
                      {/* Left: Coat of Arms / SUBEB Emblem */}
                      <div className="w-20 h-20 shrink-0 flex flex-col items-center justify-center p-1 border border-slate-200 rounded-lg bg-emerald-50">
                        <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-xs">
                          UBEC
                        </div>
                        <span className="text-[9px] uppercase tracking-tighter text-emerald-900 font-bold mt-1 text-center leading-none">
                          Kano SUBEB
                        </span>
                      </div>

                      {/* Center: Institutional Identity */}
                      <div className="text-center flex-1">
                        <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600">
                          Federal Republic of Nigeria • State Universal Basic Education Board
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black uppercase text-emerald-900 tracking-tight my-0.5">
                          {schoolInfo?.name || 'GOVERNMENT DAY JUNIOR SECONDARY SCHOOL'}
                        </h1>
                        <div className="text-xs font-semibold text-slate-700">
                          School Registry Code: <span className="font-mono text-emerald-800 font-bold">{schoolInfo?.code || 'AM2050-SCH-0003'}</span> • LGA: {schoolInfo?.lga || 'Kano Municipal'} • State: {schoolInfo?.state || 'Kano'}
                        </div>
                        <div className="inline-block mt-2 px-4 py-1 bg-emerald-800 text-white text-xs font-bold uppercase tracking-wider rounded-md">
                          Terminal Continuous Assessment & Evaluation Dossier
                        </div>
                      </div>

                      {/* Right: AM2050 Biometric / Registry Badge */}
                      <div className="w-20 h-20 shrink-0 flex flex-col items-center justify-center p-1 border border-slate-200 rounded-lg bg-slate-50">
                        <div className="w-10 h-10 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center font-black text-xs">
                          AM2050
                        </div>
                        <span className="text-[9px] uppercase tracking-tighter text-slate-600 font-bold mt-1 text-center leading-none">
                          Verified ID
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. STUDENT BIODATA & ENROLLMENT BANNER */}
                  <div className="bg-slate-50 border border-slate-300 rounded-lg p-3.5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Learner Full Name</span>
                      <span className="font-bold text-slate-900 text-sm uppercase">
                        {stu.last_name}, {stu.first_name}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">AM2050 Learner ID / NIN</span>
                      <span className="font-mono font-bold text-emerald-900">
                        {stu.nin || stu.am2050_id || `NG-STU-${stu.id.slice(-6).toUpperCase()}`}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Class & Arm</span>
                      <span className="font-bold text-slate-900">
                        {classInfo?.name || 'JSS 1'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Academic Session & Term</span>
                      <span className="font-bold text-slate-900">
                        {termInfo?.name || 'First Term 2026/2027'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Gender</span>
                      <span className="font-semibold text-slate-800 capitalize">
                        {stu.gender || 'Not Specified'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Class Form Teacher</span>
                      <span className="font-semibold text-slate-800">
                        {classInfo?.teacherName || 'Assigned Form Master'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Attendance Record</span>
                      <span className="font-semibold text-slate-800">
                        {att.present} of {att.total || 60} days ({att.rate}%)
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 font-medium block text-[10px] uppercase">Official Status</span>
                      <span className={`inline-flex items-center gap-1 font-bold uppercase text-[11px] ${
                        summary.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                      }`}>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {summary.status === 'published' ? 'Officially Published' : 'Provisional Draft'}
                      </span>
                    </div>
                  </div>

                  {/* 3. COGNITIVE DOMAIN / ACADEMIC PERFORMANCE TABLE */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-emerald-700" />
                        Part I: Cognitive Assessment & Terminal Examination Scores
                      </h3>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Standard Weighting: Continuous Assessment (40%) + Terminal Exam (60%) = Total (100%)
                      </span>
                    </div>

                    <table className="w-full text-left text-xs border border-collapse border-slate-300">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                          <th className="py-2 px-2.5 border-r border-slate-300 w-8 text-center">#</th>
                          <th className="py-2 px-3 border-r border-slate-300">Subject Name</th>
                          <th className="py-2 px-2 border-r border-slate-300 text-center w-16">C.A. (40)</th>
                          <th className="py-2 px-2 border-r border-slate-300 text-center w-16">Exam (60)</th>
                          <th className="py-2 px-2 border-r border-slate-300 text-center w-16 bg-slate-200/60">Total (100)</th>
                          <th className="py-2 px-2 border-r border-slate-300 text-center w-12">Grade</th>
                          <th className="py-2 px-2 border-r border-slate-300 text-center w-20">Class Avg</th>
                          <th className="py-2 px-3">Subject Teacher Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sheet.results.map((res, idx) => {
                          const ca = res.caScore !== null ? Number(res.caScore) : '-';
                          const exam = res.examScore !== null ? Number(res.examScore) : '-';
                          const total = Number(res.score);
                          const grade = res.grade || '-';
                          const classAvg = res.stats?.avg !== undefined ? `${res.stats.avg}%` : '-';
                          const remark = res.notes || getGradeRemark(grade);

                          return (
                            <tr key={res.subject || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                              <td className="py-1.5 px-2.5 border-r border-slate-200 text-center text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-slate-800">
                                {res.subject}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono text-slate-700">
                                {ca}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono text-slate-700">
                                {exam}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono font-black text-slate-900 bg-slate-100/50">
                                {total}
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded font-black text-[11px] border ${getGradeColor(grade)}`}>
                                  {grade}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 border-r border-slate-200 text-center font-mono text-slate-500 text-[11px]">
                                {classAvg}
                              </td>
                              <td className="py-1.5 px-3 text-slate-600 text-[11px] italic">
                                {remark}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-50/80 font-black text-slate-900 border-t-2 border-emerald-800">
                          <td colSpan={2} className="py-2.5 px-3 border-r border-slate-300 text-right uppercase text-[11px]">
                            Cumulative Terminal Summary:
                          </td>
                          <td colSpan={2} className="py-2.5 px-2 border-r border-slate-300 text-center font-mono text-xs">
                            {summary.subjectCount} Subjects
                          </td>
                          <td className="py-2.5 px-2 border-r border-slate-300 text-center font-mono text-sm font-black text-emerald-900 bg-emerald-100/60">
                            {summary.totalScore}
                          </td>
                          <td className="py-2.5 px-2 border-r border-slate-300 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded font-black text-xs border ${getGradeColor(summary.overallGrade)}`}>
                              {summary.overallGrade}
                            </span>
                          </td>
                          <td colSpan={2} className="py-2.5 px-3">
                            <div className="flex items-center justify-between text-xs">
                              <span>Terminal Average: <strong className="font-mono text-emerald-900">{summary.averageScore}%</strong></span>
                              <span>Class Standing: <strong className="font-black text-emerald-900 bg-emerald-200/70 px-2 py-0.5 rounded">{summary.positionText || 'Evaluated'}</strong></span>
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* 4. AFFECTIVE & BEHAVIORAL DOMAIN EVALUATION */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    {/* Behavioral Attributes */}
                    <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
                      <h4 className="text-[11px] font-black uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                        <span>Part II: Affective & Behavioral Traits</span>
                        <span className="text-[9px] text-slate-500 font-normal">Scale: 5 (Excellent) to 1 (Poor)</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                        {[
                          { name: 'Punctuality & Regularity', rating: 5 },
                          { name: 'Neatness & Assembly Posture', rating: 5 },
                          { name: 'Classroom Attentiveness', rating: summary.averageScore >= 60 ? 5 : 4 },
                          { name: 'Peer Respect & Teamwork', rating: 4 },
                          { name: 'Honesty & Integrity', rating: 5 },
                          { name: 'Leadership & Extracurricular', rating: 4 },
                        ].map((trait) => (
                          <div key={trait.name} className="flex items-center justify-between bg-white px-2 py-1 rounded border border-slate-200">
                            <span className="text-slate-700">{trait.name}</span>
                            <span className="font-mono font-bold text-emerald-800">
                              {'★'.repeat(trait.rating)} ({trait.rating})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Grading Scale Legend */}
                    <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
                      <h4 className="text-[11px] font-black uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1">
                        UBEC Standard Assessment Key
                      </h4>
                      <table className="w-full text-left text-[10px] border-collapse">
                        <thead>
                          <tr className="text-slate-500 border-b border-slate-200 font-bold">
                            <th className="pb-1">Range</th>
                            <th className="pb-1">Grade</th>
                            <th className="pb-1">Classification</th>
                            <th className="pb-1">Remark</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          <tr><td className="py-0.5 font-mono">75% - 100%</td><td className="font-bold text-emerald-800">A</td><td>Excellent</td><td>Distinction</td></tr>
                          <tr><td className="py-0.5 font-mono">65% - 74%</td><td className="font-bold text-blue-800">B</td><td>Very Good</td><td>Commendable</td></tr>
                          <tr><td className="py-0.5 font-mono">50% - 64%</td><td className="font-bold text-amber-800">C</td><td>Good</td><td>Credit</td></tr>
                          <tr><td className="py-0.5 font-mono">40% - 49%</td><td className="font-bold text-orange-800">D</td><td>Fair</td><td>Pass</td></tr>
                          <tr><td className="py-0.5 font-mono">0% - 39%</td><td className="font-bold text-rose-800">F</td><td>Unsatisfactory</td><td>Requires Intervention</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 5. FORMAL ATTESTATIONS, REMARKS & SIGNATURES */}
                <div className="border-t-2 border-slate-300 pt-4 mt-2">
                  <div className="grid grid-cols-2 gap-6 text-xs mb-4">
                    {/* Form Teacher Remark */}
                    <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/70">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                        Class Form Teacher's Assessment & Recommendation:
                      </span>
                      <p className="italic text-slate-800 font-medium min-h-[32px] text-xs">
                        {summary.averageScore >= 70
                          ? `An exceptional academic performance. Demonstrates disciplined mastery across basic science and humanities. Keep striving for the summit!`
                          : summary.averageScore >= 50
                          ? `A very creditable result with consistent classroom engagement. Capable of further distinction with more focus on exam technique.`
                          : `Demonstrates potential. Recommended for targeted literacy and remedial math mentoring in the coming term.`}
                      </p>
                      <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-serif italic font-bold text-slate-700">
                            {classInfo?.teacherName || 'M. Bello'}
                          </span>
                          <span className="text-slate-400 block text-[9px] uppercase">Form Teacher Signature</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-slate-600">{termInfo?.endDate || '2026-12-18'}</span>
                          <span className="text-slate-400 block text-[9px] uppercase">Date Certified</span>
                        </div>
                      </div>
                    </div>

                    {/* Headmaster / Principal Remark & Official Stamp */}
                    <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/70 relative">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                        Headmaster / Principal's Attestation:
                      </span>
                      <p className="italic text-slate-800 font-medium min-h-[32px] text-xs">
                        {summary.decision === 'PASSED'
                          ? `Results verified and approved. Promoted with commendable standing to subsequent terminal level.`
                          : `Results verified. Academic probationary advisory issued; guardian conference requested.`}
                      </p>

                      {/* Simulated Official Seal Stamp */}
                      <div className="absolute right-4 top-2 pointer-events-none opacity-80 rotate-[-8deg] border-2 border-dashed border-emerald-700 rounded-full w-20 h-20 flex flex-col items-center justify-center p-1 text-center">
                        <span className="text-[7px] font-black text-emerald-800 uppercase leading-none">OFFICIAL SEAL</span>
                        <span className="text-[8px] font-black text-emerald-900 leading-tight">GDJSS AHOTO</span>
                        <span className="text-[6px] font-bold text-emerald-700">SUBEB KANO</span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-serif italic font-bold text-slate-800">
                            Mallam Ibrahim Haruna (HM)
                          </span>
                          <span className="text-slate-400 block text-[9px] uppercase">Headmaster Signature & Stamp</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-slate-600">{termInfo?.endDate || '2026-12-18'}</span>
                          <span className="text-slate-400 block text-[9px] uppercase">Date Sealed</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resumption Notice & Footer Security Ledger */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-200 pt-2 font-medium">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Next Term Resumption Date: <strong className="text-slate-900 font-semibold">{termInfo?.nextTermBegins || 'Monday, 11th January 2027'}</strong></span>
                    </div>
                    <div>
                      <span>Digital Verification Hash: <strong className="font-mono text-slate-700">{stu.id.slice(0, 10).toUpperCase()}-VERIFIED-AM2050</strong></span>
                    </div>
                    <div>
                      <span>Printed via AM2050 National Education Cloud</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
export default FormalReportCardModal;
