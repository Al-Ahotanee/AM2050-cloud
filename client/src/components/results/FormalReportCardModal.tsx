import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Award, ExternalLink, Calendar, BookOpen, UserCheck, ShieldCheck } from 'lucide-react';

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
    child_id?: string;
    child_unique_id?: string;
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
    ward?: string;
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
  // Safe fallback: never empty when sheets has items
  const displaySheets = useMemo(() => {
    if (!sheets || sheets.length === 0) return [];
    if (!activeStudentId) return sheets;

    const target = String(activeStudentId).trim().toLowerCase();
    const matched = sheets.filter((s) => {
      const idMatch = String(s.student?.id || '').toLowerCase() === target;
      const childIdMatch = String(s.student?.child_id || '').toLowerCase() === target;
      const enrMatch = String(s.enrollmentId || '').toLowerCase() === target;
      const ninMatch = String(s.student?.child_unique_id || s.student?.nin || '').toLowerCase() === target;
      return idMatch || childIdMatch || enrMatch || ninMatch;
    });

    return matched.length > 0 ? matched : [sheets[0]];
  }, [sheets, activeStudentId]);

  if (!isOpen || displaySheets.length === 0) return null;

  // Direct, rock-solid browser printing using standard body portal
  const handlePrint = () => {
    window.print();
  };

  // Secondary bulletproof option: Opens dedicated printable tab
  const handleOpenPrintTab = () => {
    const printNode = document.getElementById('am2050-print-portal') || document.getElementById('formal-report-dossier-preview');
    if (!printNode) {
      window.print();
      return;
    }

    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    const stylesHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((s) => s.outerHTML)
      .join('\n');

    printWin.document.open();
    printWin.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AM2050 Terminal Academic Report Dossier — GDJSS AHOTO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${stylesHtml}
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 8mm 8mm 8mm;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .dossier-sheet-page {
      page-break-after: always !important;
      break-after: page !important;
      min-height: 275mm !important;
      width: 100% !important;
      max-width: 210mm !important;
      padding: 8mm 10mm !important;
      margin: 0 auto 20px auto !important;
      box-shadow: none !important;
      border: 1px solid #cbd5e1 !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
    }
    .dossier-sheet-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
      margin-bottom: 0 !important;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-900 p-4">
  <div class="no-print max-w-[210mm] mx-auto mb-4 bg-slate-900 text-white p-3.5 rounded-xl shadow-lg flex items-center justify-between">
    <div>
      <h3 class="text-sm font-bold">Printable Official A4 Academic Dossier (${displaySheets.length} Learners)</h3>
      <p class="text-xs text-slate-400">Jigawa State SUBEB · Government Day Junior Secondary School Ahoto</p>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.print()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow transition-colors">
        Print / Save to PDF
      </button>
      <button onclick="window.close()" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg">
        Close Window
      </button>
    </div>
  </div>
  <div class="max-w-[210mm] mx-auto">
    ${printNode.innerHTML}
  </div>
</body>
</html>`);
    printWin.document.close();
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

  // Pilot geography defaults: Jigawa State, Buji LGA, Ahoto Ward
  const schoolState = schoolInfo?.state || 'Jigawa';
  const schoolLga = schoolInfo?.lga || 'Buji';
  const schoolWard = schoolInfo?.ward || 'Ahoto';
  const schoolCode = schoolInfo?.code || 'AM2050-SCH-0003';
  const schoolName = schoolInfo?.name || 'GOVERNMENT DAY JUNIOR SECONDARY SCHOOL AHOTO';

  // Single sheet renderer (used for both screen modal and body print portal)
  const renderSheetContent = (sheet: StudentReportSheet, sheetIdx: number, isLast: boolean) => {
    const stu = sheet.student;
    const summary = sheet.summary;
    const att = sheet.attendance;

    const stuId = stu.id || stu.child_id || sheet.enrollmentId || '';
    const uniqueIdentifier =
      stu.child_unique_id ||
      stu.nin ||
      stu.am2050_id ||
      (stuId ? `NG-STU-${stuId.slice(-6).toUpperCase()}` : 'NG-STU-001');

    return (
      <div
        key={stuId || sheetIdx}
        className={`dossier-sheet-page bg-white text-slate-900 border border-slate-300 shadow-sm p-8 sm:p-10 mx-auto max-w-[210mm] min-h-[297mm] ${
          !isLast ? 'mb-8' : ''
        }`}
      >
        {/* UPPER HALF: HEADER, BIODATA, COGNITIVE DOMAIN, AFFECTIVE DOMAIN */}
        <div>
          {/* 1. OFFICIAL ACADEMIC HEADER */}
          <div className="border-b-4 border-double border-emerald-800 pb-4 mb-5">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Coat of Arms / SUBEB Emblem */}
              <div className="w-20 h-20 shrink-0 flex flex-col items-center justify-center p-1 border border-slate-200 rounded-lg bg-emerald-50">
                <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-black text-xs shadow-sm">
                  UBEC
                </div>
                <span className="text-[9px] uppercase tracking-tighter text-emerald-900 font-bold mt-1 text-center leading-none">
                  Jigawa SUBEB
                </span>
              </div>

              {/* Center: Institutional Identity */}
              <div className="text-center flex-1">
                <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600">
                  Federal Republic of Nigeria • State Universal Basic Education Board
                </div>
                <h1 className="text-2xl sm:text-3xl font-black uppercase text-emerald-900 tracking-tight my-0.5">
                  {schoolName}
                </h1>
                <div className="text-xs font-semibold text-slate-700">
                  School Registry Code: <span className="font-mono text-emerald-800 font-bold">{schoolCode}</span> • LGA: <span className="font-bold">{schoolLga}</span> • State: <span className="font-bold">{schoolState}</span> (Ward: {schoolWard})
                </div>
                <div className="inline-block mt-2 px-4 py-1 bg-emerald-800 text-white text-xs font-bold uppercase tracking-wider rounded-md shadow-sm">
                  Continuous Assessment (40%) & Terminal Examination (60%) Dossier
                </div>
              </div>

              {/* Right: AM2050 Biometric / Registry Badge */}
              <div className="w-20 h-20 shrink-0 flex flex-col items-center justify-center p-1 border border-slate-200 rounded-lg bg-slate-50">
                <div className="w-10 h-10 rounded-lg bg-slate-800 text-emerald-400 flex items-center justify-center font-black text-xs shadow-sm">
                  AM2050
                </div>
                <span className="text-[9px] uppercase tracking-tighter text-slate-600 font-bold mt-1 text-center leading-none">
                  Pilot Jigawa
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
              <span className="text-slate-500 font-medium block text-[10px] uppercase">National Learner ID / NIN</span>
              <span className="font-mono font-bold text-emerald-800 text-sm">
                {uniqueIdentifier}
              </span>
            </div>

            <div>
              <span className="text-slate-500 font-medium block text-[10px] uppercase">Class Arm & Level</span>
              <span className="font-bold text-slate-900 text-sm">
                {classInfo?.name || 'JSS 1'} ({classInfo?.level || 'Junior Secondary'})
              </span>
            </div>

            <div>
              <span className="text-slate-500 font-medium block text-[10px] uppercase">Session & Term</span>
              <span className="font-bold text-slate-900 text-sm">
                {termInfo?.name || 'First Term'} ({termInfo?.academicYear || '2025/2026'})
              </span>
            </div>

            <div className="border-t border-slate-200 pt-2 col-span-2 sm:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500">Gender: </span>
                <strong className="text-slate-800 capitalize">{stu.gender || 'Not specified'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Class Form Master: </span>
                <strong className="text-slate-800">{classInfo?.teacherName || 'Suleiman Ibrahim'}</strong>
              </div>
              <div>
                <span className="text-slate-500">Term Attendance: </span>
                <strong className="text-emerald-800 font-bold">{att?.present ?? 0} Days Present</strong>
                <span className="text-slate-400"> / {att?.total ?? 0}</span>
              </div>
              <div>
                <span className="text-slate-500">Class Standing: </span>
                <strong className="text-blue-900 font-black">
                  {summary.positionText || (summary.rank ? `${summary.rank} of ${sheets.length}` : 'Evaluated')}
                </strong>
              </div>
            </div>
          </div>

          {/* 3. COGNITIVE DOMAIN: SUBJECT SCORES TABLE */}
          <div className="mb-5 overflow-hidden border border-slate-300 rounded-lg">
            <div className="bg-slate-100 px-3 py-2 border-b border-slate-300 flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-xs text-slate-800 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-emerald-800" />
                Cognitive Domain (Continuous Assessment & Terminal Examinations)
              </span>
              <span className="text-[10px] font-mono text-slate-500 font-semibold">
                Grading Policy: CA (40%) + Exam (60%) = Total (100%)
              </span>
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300 text-slate-700 font-extrabold text-[11px]">
                  <th className="py-2 px-3 border-r border-slate-200 w-8 text-center">S/N</th>
                  <th className="py-2 px-3 border-r border-slate-200">Curriculum Subject</th>
                  <th className="py-2 px-2.5 border-r border-slate-200 text-center w-16">CA (40)</th>
                  <th className="py-2 px-2.5 border-r border-slate-200 text-center w-16">Exam (60)</th>
                  <th className="py-2 px-2.5 border-r border-slate-200 text-center w-20">Total (100)</th>
                  <th className="py-2 px-2.5 border-r border-slate-200 text-center w-14">Grade</th>
                  <th className="py-2 px-2.5 border-r border-slate-200 text-center w-24">Class Avg</th>
                  <th className="py-2 px-3">Subject Teacher Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sheet.results.map((res, rIdx) => {
                  const total = res.score ?? ((res.caScore ?? 0) + (res.examScore ?? 0));
                  const grade = res.grade || (total >= 75 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 40 ? 'D' : 'F');
                  return (
                    <tr key={res.id || rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}>
                      <td className="py-1.5 px-3 border-r border-slate-200 text-center font-mono text-[11px] text-slate-500">
                        {rIdx + 1}
                      </td>
                      <td className="py-1.5 px-3 border-r border-slate-200 font-bold text-slate-900">
                        {res.subject}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono text-slate-700">
                        {res.caScore !== null ? res.caScore : '—'}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono text-slate-700">
                        {res.examScore !== null ? res.examScore : '—'}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono font-bold text-slate-900">
                        {total}
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-black">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] border ${getGradeColor(grade)}`}>
                          {grade}
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 border-r border-slate-200 text-center font-mono text-slate-500 text-[11px]">
                        {res.stats?.avg ? `${Math.round(res.stats.avg)}%` : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-[11px] text-slate-600 italic">
                        {res.notes || getGradeRemark(grade)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Cognitive Domain Cumulative Totals */}
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={2} className="py-2.5 px-3 border-r border-slate-300 text-right uppercase tracking-wider">
                    Cumulative Performance Summary:
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-slate-300 text-center font-mono text-slate-700">
                    {sheet.results.reduce((a, b) => a + (b.caScore ?? 0), 0)}
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-slate-300 text-center font-mono text-slate-700">
                    {sheet.results.reduce((a, b) => a + (b.examScore ?? 0), 0)}
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-slate-300 text-center font-mono text-emerald-900 text-sm">
                    {summary.totalScore} <span className="text-[10px] text-slate-500 font-normal">/ {summary.maxObtainable}</span>
                  </td>
                  <td className="py-2.5 px-2.5 border-r border-slate-300 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-black border ${getGradeColor(summary.overallGrade)}`}>
                      {summary.overallGrade}
                    </span>
                  </td>
                  <td colSpan={2} className="py-2.5 px-3 text-slate-800">
                    Terminal Average: <strong className="font-mono text-emerald-800 text-sm">{summary.averageScore}%</strong> • Decision: <strong className="uppercase text-emerald-900 font-bold">{summary.decision}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 4. AFFECTIVE & PSYCHOMOTOR BEHAVIORAL DOMAINS */}
          <div className="grid grid-cols-2 gap-4 mb-5 text-xs">
            {/* Affective Domain Ratings */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
              <h4 className="text-[11px] font-black uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>Affective Domain (Character & Social Conduct)</span>
                <span className="text-[9px] font-mono text-slate-400 font-normal">Rated 1 (Poor) to 5 (Exemplary)</span>
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Punctuality:</span>
                  <span className="font-bold font-mono text-emerald-800">5 / 5 ★★★★★</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Neatness & Decorum:</span>
                  <span className="font-bold font-mono text-emerald-800">5 / 5 ★★★★★</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Attentiveness & Focus:</span>
                  <span className="font-bold font-mono text-emerald-800">4 / 5 ★★★★☆</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Honesty & Reliability:</span>
                  <span className="font-bold font-mono text-emerald-800">5 / 5 ★★★★★</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Teamwork & Comradeship:</span>
                  <span className="font-bold font-mono text-emerald-800">4 / 5 ★★★★☆</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                  <span className="text-slate-600">Leadership Initiative:</span>
                  <span className="font-bold font-mono text-emerald-800">4 / 5 ★★★★☆</span>
                </div>
              </div>
            </div>

            {/* Grading Scale Legend */}
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50">
              <h4 className="text-[11px] font-black uppercase text-slate-800 mb-2 border-b border-slate-200 pb-1">
                UBEC Standard Assessment Grading Key
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

        {/* LOWER HALF: ATTESTATIONS, REMARKS, OFFICIAL SEAL & FOOTER */}
        <div className="border-t-2 border-slate-300 pt-4 mt-2">
          <div className="grid grid-cols-2 gap-6 text-xs mb-4">
            {/* Form Teacher Remark */}
            <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/70">
              <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                Class Form Master's Recommendation:
              </span>
              <p className="italic text-slate-800 font-medium min-h-[32px] text-xs">
                {summary.averageScore >= 70
                  ? `An exceptional academic performance. Demonstrates disciplined mastery across basic science and humanities. Promoted with commendable honors.`
                  : summary.averageScore >= 50
                  ? `A very creditable result with consistent classroom engagement. Capable of distinction with dedicated focus on exam preparation.`
                  : `Demonstrates potential. Recommended for targeted literacy and remedial math mentoring in the coming term.`}
              </p>
              <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[11px]">
                <div>
                  <span className="font-serif italic font-bold text-slate-700">
                    {classInfo?.teacherName || 'Suleiman Ibrahim'}
                  </span>
                  <span className="text-slate-400 block text-[9px] uppercase">Form Master Signature</span>
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
                  ? `Results verified and approved. Promoted with commendable standing to the subsequent academic level.`
                  : `Results verified. Academic advisory issued; guardian conference scheduled.`}
              </p>

              {/* Simulated Official Seal Stamp */}
              <div className="absolute right-4 top-2 pointer-events-none opacity-80 rotate-[-8deg] border-2 border-dashed border-emerald-700 rounded-full w-20 h-20 flex flex-col items-center justify-center p-1 text-center">
                <span className="text-[7px] font-black text-emerald-800 uppercase leading-none">OFFICIAL SEAL</span>
                <span className="text-[8px] font-black text-emerald-900 leading-tight">GDJSS AHOTO</span>
                <span className="text-[6px] font-bold text-emerald-700">SUBEB JIGAWA</span>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-300 flex items-center justify-between text-[11px]">
                <div>
                  <span className="font-serif italic font-bold text-slate-800">
                    Mallam Usman Bello Ahoto
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
              <span>Digital Verification Hash: <strong className="font-mono text-slate-700">{(stuId || 'AM2050').slice(0, 10).toUpperCase()}-VERIFIED-AM2050-JIGAWA</strong></span>
            </div>
            <div>
              <span>Universal Basic Education Board • Jigawa State</span>
            </div>
          </div>
        </div>

      </div>
    );
  };

  return (
    <>
      {/* 1. Global Print Stylesheet: cleanly hides everything in #root and isolates the print portal */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media screen {
              #am2050-print-portal {
                display: none !important;
              }
            }

            @media print {
              /* Hide the entire app, modal overlays, fixed backdrops, navigation */
              #root,
              .no-print,
              dialog {
                display: none !important;
              }

              /* Display the clean body portal natively */
              #am2050-print-portal {
                display: block !important;
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #0f172a !important;
                visibility: visible !important;
              }

              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #0f172a !important;
                width: 100% !important;
                height: auto !important;
                overflow: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }

              @page {
                size: A4 portrait;
                margin: 8mm 8mm 8mm 8mm;
              }

              .dossier-sheet-page {
                page-break-after: always !important;
                break-after: page !important;
                min-height: 275mm !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 8mm 10mm !important;
                margin: 0 auto !important;
                box-shadow: none !important;
                border: 1px solid #cbd5e1 !important;
                background: #ffffff !important;
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }

              .dossier-sheet-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
            }
          `,
        }}
      />

      {/* 2. Direct Body Portal for 100% Reliable Native Printing */}
      {createPortal(
        <div id="am2050-print-portal">
          {displaySheets.map((sheet, idx) =>
            renderSheetContent(sheet, idx, idx === displaySheets.length - 1)
          )}
        </div>,
        document.body
      )}

      {/* 3. Screen Modal Overlay (Hidden automatically during print) */}
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
        
        {/* Main Modal Shell */}
        <div className="relative w-full max-w-5xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[96vh] flex flex-col">
          
          {/* Top Control Toolbar */}
          <div className="bg-slate-900 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">
                  Universal Basic Education Terminal Report Dossier
                </h2>
                <p className="text-xs text-slate-400">
                  {displaySheets.length > 1
                    ? `Class Batch Preview (${displaySheets.length} Learners · ${classInfo?.name || 'Class'})`
                    : `${displaySheets[0]?.student.first_name} ${displaySheets[0]?.student.last_name} • ${classInfo?.name || 'Class'} • ${termInfo?.name || 'Current Term'}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Print A4 Dossier {displaySheets.length > 1 ? `(${displaySheets.length})` : ''}</span>
              </button>

              <button
                onClick={handleOpenPrintTab}
                title="Opens the document in a clean new tab for full-screen inspection or browser PDF saving"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Tab</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Screen Preview */}
          <div
            id="formal-report-dossier-preview"
            className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100"
          >
            {displaySheets.map((sheet, sheetIdx) =>
              renderSheetContent(sheet, sheetIdx, sheetIdx === displaySheets.length - 1)
            )}
          </div>

        </div>
      </div>
    </>
  );
};
export default FormalReportCardModal;
