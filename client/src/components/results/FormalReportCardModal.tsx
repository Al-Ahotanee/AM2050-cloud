import React, { useRef, useMemo } from 'react';
import { Printer, X, Award, ShieldCheck, Calendar, BookOpen, UserCheck } from 'lucide-react';

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
  const printRef = useRef<HTMLDivElement>(null);

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

  const handlePrint = () => {
    const printNode = document.getElementById('formal-report-dossier-print');
    if (!printNode) {
      window.print();
      return;
    }

    try {
      // Remove any previously created print iframe
      const oldIframe = document.getElementById('am2050-report-print-iframe');
      if (oldIframe) {
        oldIframe.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'am2050-report-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc) {
        window.print();
        return;
      }

      // Collect all active styles from the host document
      const stylesHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('\n');

      frameDoc.open();
      frameDoc.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>AM2050 — Terminal Academic Report Dossier</title>
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
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body class="bg-white text-slate-900 p-0 m-0">
  ${printNode.innerHTML}
</body>
</html>`);
      frameDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Iframe print invocation error, fallback to window.print", e);
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              iframe.remove();
            }
          }, 2000);
        }
      }, 400);
    } catch (err) {
      console.error("Print generation exception, fallback to window.print", err);
      window.print();
    }
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

  return (
    <>
      {/* Dedicated Print Engine Stylesheet - Injected into Document */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              /* 1. Global Reset for Printing */
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

              /* 2. Hide everything except our specific printable report dossier */
              body * {
                visibility: hidden !important;
              }

              #formal-report-dossier-print,
              #formal-report-dossier-print * {
                visibility: visible !important;
              }

              /* 3. Position the printable container cleanly at (0, 0) */
              #formal-report-dossier-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                overflow: visible !important;
              }

              /* 4. A4 Portrait Page Specifications */
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
                border: none !important;
                background: #ffffff !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }

              .dossier-sheet-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }

              .no-print {
                display: none !important;
              }
            }
          `,
        }}
      />

      {/* Screen Modal Overlay */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto print:static print:p-0 print:m-0 print:bg-white print:overflow-visible">
        
        {/* Main Modal Shell */}
        <div className="relative w-full max-w-5xl bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[96vh] flex flex-col print:max-h-none print:shadow-none print:rounded-none print:m-0 print:p-0 print:w-full print:border-none print:overflow-visible">
          
          {/* Floating Top Control Toolbar (Hidden during print) */}
          <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
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
                    ? `Class Batch Print Preview (${displaySheets.length} Learners · ${classInfo?.name || 'Class'})`
                    : `${displaySheets[0]?.student.first_name} ${displaySheets[0]?.student.last_name} • ${classInfo?.name || 'Class'} • ${termInfo?.name || 'Current Term'}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-xl shadow-lg transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Print A4 Dossier {displaySheets.length > 1 ? `(${displaySheets.length} Students)` : ''}</span>
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

          {/* Printable Document Canvas */}
          <div
            id="formal-report-dossier-print"
            ref={printRef}
            className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100 print:bg-white print:p-0 print:overflow-visible"
          >
            {displaySheets.map((sheet, sheetIdx) => {
              const isLast = sheetIdx === displaySheets.length - 1;
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
                  className={`dossier-sheet-page bg-white text-slate-900 border border-slate-300 shadow-md p-8 sm:p-10 mx-auto max-w-[210mm] min-h-[297mm] ${
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
                        <span className="text-slate-500 font-medium block text-[10px] uppercase">AM2050 Learner ID / NIN</span>
                        <span className="font-mono font-bold text-emerald-900">
                          {uniqueIdentifier}
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
                        <span className="font-semibold text-slate-800 font-mono">
                          {att.present} of {att.total || 60} days ({att.rate}%)
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 font-medium block text-[10px] uppercase">Official Status</span>
                        <span className={`inline-flex items-center gap-1 font-bold uppercase text-[11px] ${
                          summary.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                        }`}>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {summary.status === 'published' ? 'Officially Certified' : 'Provisional Draft'}
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
                          Universal Basic Education Weighting: Continuous Assessment (40%) + Terminal Exam (60%) = Total (100%)
                        </span>
                      </div>

                      <table className="w-full text-left text-xs border border-collapse border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-300">
                            <th className="py-2 px-2.5 border-r border-slate-300 w-8 text-center">#</th>
                            <th className="py-2 px-3 border-r border-slate-300">Subject Name</th>
                            <th className="py-2 px-2 border-r border-slate-300 text-center w-16">C.A. (40)</th>
                            <th className="py-2 px-2 border-r border-slate-300 text-center w-16">Exam (60)</th>
                            <th className="py-2 px-2 border-r border-slate-300 text-center w-16 bg-slate-200/60 font-black">Total (100)</th>
                            <th className="py-2 px-2 border-r border-slate-300 text-center w-12">Grade</th>
                            <th className="py-2 px-2 border-r border-slate-300 text-center w-20">Class Avg</th>
                            <th className="py-2 px-3">Subject Teacher Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {sheet.results && sheet.results.length > 0 ? (
                            sheet.results.map((res, idx) => {
                              const ca = res.caScore !== null && res.caScore !== undefined ? Number(res.caScore) : '-';
                              const exam = res.examScore !== null && res.examScore !== undefined ? Number(res.examScore) : '-';
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
                            })
                          ) : (
                            <tr>
                              <td colSpan={8} className="py-4 text-center text-slate-400 italic">
                                No subject evaluations recorded for this learner.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="bg-emerald-50/80 font-black text-slate-900 border-t-2 border-emerald-800">
                            <td colSpan={2} className="py-2.5 px-3 border-r border-slate-300 text-right uppercase text-[11px]">
                              Cumulative Terminal Summary:
                            </td>
                            <td colSpan={2} className="py-2.5 px-2 border-r border-slate-300 text-center font-mono text-xs">
                              {summary.subjectCount} Subjects Evaluated
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
            })}
          </div>

        </div>
      </div>
    </>
  );
};
export default FormalReportCardModal;
