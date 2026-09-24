/* AM2050 — Field Ledger Modernism: Batch Student ID Card Generator (A4 Printable Sheets).
   ISO/IEC 7810 CR80 Standard (85.6mm × 54mm).
   Formats 8 cards per A4 sheet (2 columns × 4 rows) with cutter crop-marks and duplex alignment. */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  FileDown,
  Layers,
  LoaderCircle,
  Printer,
  Scissors,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";

export interface BatchStudentItem {
  id: string;
  childCode: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  photoUrl?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  estimatedAge?: number | null;
  schoolName?: string | null;
  className?: string | null;
  wardName?: string | null;
  lgaName?: string | null;
  stateName?: string | null;
  attendanceToken?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  students: BatchStudentItem[];
  title?: string;
  defaultSchoolName?: string;
  defaultClassName?: string;
}

type PrintMode = "front-only" | "back-only" | "duplex";

export function BatchStudentIdCardModal({
  isOpen,
  onClose,
  students,
  title = "Batch Student ID Card Generation",
  defaultSchoolName,
  defaultClassName,
}: Props) {
  const [printMode, setPrintMode] = useState<PrintMode>("front-only");
  const [showCutGuides, setShowCutGuides] = useState(true);
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [generatingQr, setGeneratingQr] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string>("all");
  const [selectedClass, setSelectedClass] = useState<string>("all");

  // Distinct schools and classes for filtering
  const distinctSchools = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.schoolName) set.add(s.schoolName);
    });
    return Array.from(set).sort();
  }, [students]);

  const distinctClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set).sort();
  }, [students]);

  // Filter students based on selection
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedSchool !== "all" && s.schoolName !== selectedSchool) return false;
      if (selectedClass !== "all" && s.className !== selectedClass) return false;
      return true;
    });
  }, [students, selectedSchool, selectedClass]);

  // Generate QR codes for all filtered students
  useEffect(() => {
    if (!isOpen || filteredStudents.length === 0) return;

    let active = true;
    setGeneratingQr(true);

    const generateAll = async () => {
      const newMap: Record<string, string> = {};
      for (const s of filteredStudents) {
        if (!active) return;
        const token = s.attendanceToken || s.childCode || s.id;
        const qrRaw = `AM2050:${token}`;
        try {
          const dataUrl = await QRCode.toDataURL(qrRaw, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: "M",
            color: {
              dark: "#123148",
              light: "#ffffff",
            },
          });
          newMap[s.id] = dataUrl;
        } catch {
          // Fallback if individual QR fails
        }
      }
      if (active) {
        setQrMap(newMap);
        setGeneratingQr(false);
      }
    };

    void generateAll();

    return () => {
      active = false;
    };
  }, [isOpen, filteredStudents]);

  if (!isOpen) return null;

  // Split students into pages of 8 cards each (2 columns × 4 rows)
  const CARDS_PER_PAGE = 8;
  const pages: BatchStudentItem[][] = [];
  for (let i = 0; i < filteredStudents.length; i += CARDS_PER_PAGE) {
    pages.push(filteredStudents.slice(i, i + CARDS_PER_PAGE));
  }

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print the A4 card sheets.");
      return;
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - ${filteredStudents.length} Students</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 8mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Plus Jakarta Sans", sans-serif;
      background: #ffffff;
      color: #123148;
    }
    .sheet-page {
      width: 194mm;
      min-height: 277mm;
      margin: 0 auto;
      page-break-after: always;
      display: grid;
      grid-template-columns: repeat(2, 85.6mm);
      grid-template-rows: repeat(4, 53.98mm);
      gap: 5mm 6mm;
      justify-content: center;
      align-content: start;
      padding: 4mm 0;
    }
    .sheet-page:last-child {
      page-break-after: auto;
    }

    /* Individual CR80 Card Box */
    .card-outer {
      width: 85.6mm;
      height: 53.98mm;
      position: relative;
      ${showCutGuides ? "border: 0.6px dashed #718592;" : "border: 0.4px solid #d4dfd8;"}
      background: #ffffff;
      padding: 2.8mm 3.2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      border-radius: 1.5mm;
    }

    /* Crop Marks / Corner Guides */
    .crop-mark-tl { position: absolute; top: 0; left: 0; width: 4mm; height: 4mm; border-top: 0.6px solid #167a4c; border-left: 0.6px solid #167a4c; }
    .crop-mark-tr { position: absolute; top: 0; right: 0; width: 4mm; height: 4mm; border-top: 0.6px solid #167a4c; border-right: 0.6px solid #167a4c; }
    .crop-mark-bl { position: absolute; bottom: 0; left: 0; width: 4mm; height: 4mm; border-bottom: 0.6px solid #167a4c; border-left: 0.6px solid #167a4c; }
    .crop-mark-br { position: absolute; bottom: 0; right: 0; width: 4mm; height: 4mm; border-bottom: 0.6px solid #167a4c; border-right: 0.6px solid #167a4c; }

    /* Card Front Header */
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.2px solid #167a4c;
      padding-bottom: 1.2mm;
    }
    .brand-mark {
      font-size: 10pt;
      font-weight: 900;
      color: #123148;
      letter-spacing: -0.3px;
    }
    .brand-mark .year { color: #167a4c; }
    .header-titles { text-align: right; }
    .gov-title {
      font-size: 4.8pt;
      font-weight: 800;
      color: #167a4c;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .tagline-sub {
      font-size: 3.5pt;
      font-weight: 700;
      color: #617985;
    }

    /* Card Front Body */
    .card-body {
      display: flex;
      gap: 2.5mm;
      align-items: center;
      flex: 1;
      margin-top: 1mm;
    }
    .photo-frame {
      width: 21mm;
      height: 28mm;
      border: 1px solid #123148;
      border-radius: 1.2mm;
      overflow: hidden;
      background: #eff5f1;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .details {
      flex: 1;
      min-width: 0;
    }
    .student-name {
      font-size: 7pt;
      font-weight: 800;
      line-height: 1.15;
      color: #123148;
      margin-bottom: 1.2mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
    }
    .grid-info {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.6mm 1.8mm;
      font-size: 4.5pt;
      line-height: 1.2;
    }
    .info-lbl {
      font-weight: 700;
      color: #617985;
      text-transform: uppercase;
    }
    .info-val {
      font-weight: 700;
      color: #123148;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .qr-frame {
      width: 19mm;
      height: 19mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 0.6px solid #c7d2d6;
      border-radius: 1mm;
      padding: 0.4mm;
      background: #ffffff;
    }
    .qr-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* Card Front Footer */
    .card-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      border-top: 0.6px solid #d4dfd8;
      padding-top: 0.8mm;
      font-size: 4pt;
    }
    .child-code {
      font-family: monospace;
      font-size: 5.2pt;
      font-weight: 800;
      color: #167a4c;
    }
    .signature-slot {
      text-align: right;
      border-top: 0.5px dashed #718592;
      padding-top: 0.4mm;
      min-width: 22mm;
      font-size: 3.5pt;
      color: #57707f;
      font-weight: 600;
    }

    /* Card Back Layout */
    .card-back {
      padding: 3mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fbfdfb;
      font-size: 4.4pt;
      line-height: 1.35;
      color: #334d5c;
    }
    .back-title {
      font-size: 5.5pt;
      font-weight: 800;
      color: #123148;
      text-transform: uppercase;
      border-bottom: 0.8px solid #167a4c;
      padding-bottom: 0.8mm;
      margin-bottom: 1.2mm;
    }
    .terms-ol {
      margin: 0;
      padding-left: 3.2mm;
    }
    .terms-ol li {
      margin-bottom: 0.8mm;
    }
    .back-contact {
      background: #eff5f1;
      border: 0.6px solid #c7d2d6;
      border-radius: 1mm;
      padding: 1.2mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
    }
  </style>
</head>
<body>
  ${pages
    .map(
      (pageStudents, pageIdx) => `
    <!-- PAGE ${pageIdx + 1}: ${printMode === "back-only" ? "BACKS" : "FRONTS"} -->
    <div class="sheet-page">
      ${pageStudents
        .map((student) => {
          const fullName = [student.firstName, student.middleName, student.lastName]
            .filter(Boolean)
            .join(" ");
          const qrCodeUrl = qrMap[student.id] || "";
          const school = student.schoolName || defaultSchoolName || "Community Basic School";
          const className = student.className || defaultClassName || "Primary Class";
          const lga = student.lgaName || "Local Government";
          const state = student.stateName || "State";
          const ageDisplay = student.estimatedAge ? student.estimatedAge + " YRS" : "RECORDED";
          const genderDisplay = student.gender ? student.gender.toUpperCase() : "RECORDED";

          if (printMode === "back-only") {
            return `
            <div class="card-outer card-back">
              ${showCutGuides ? '<div class="crop-mark-tl"></div><div class="crop-mark-tr"></div><div class="crop-mark-bl"></div><div class="crop-mark-br"></div>' : ""}
              <div>
                <div class="back-title">STUDENT RECORD & TERMS OF ISSUANCE</div>
                <ol class="terms-ol">
                  <li>This card verifies official student registration in the AM2050 education monitoring programme.</li>
                  <li>Scan the QR code during morning roll-call for immediate biometric attendance confirmation.</li>
                  <li>Property of SUBEB / State Ministry of Basic Education. If found, return to <strong>${school}</strong> or nearest education office.</li>
                </ol>
              </div>
              <div class="back-contact">
                <span>CHILD ID: <strong>${student.childCode}</strong></span>
                <span>${lga}, ${state}</span>
              </div>
            </div>`;
          }

          return `
          <div class="card-outer">
            ${showCutGuides ? '<div class="crop-mark-tl"></div><div class="crop-mark-tr"></div><div class="crop-mark-bl"></div><div class="crop-mark-br"></div>' : ""}
            <div>
              <div class="header-bar">
                <div class="brand-mark">
                  <span>AM<span class="year">2050</span></span>
                </div>
                <div class="header-titles">
                  <div class="gov-title">FEDERAL MINISTRY OF EDUCATION</div>
                  <div class="tagline-sub">ZERO OUT-OF-SCHOOL CHILDREN IN AREWA BY 2050</div>
                </div>
              </div>
            </div>

            <div class="card-body">
              <div class="photo-frame">
                ${
                  student.photoUrl
                    ? `<img src="${student.photoUrl}" alt="Photo" />`
                    : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#718592" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`
                }
              </div>

              <div class="details">
                <div class="student-name">${fullName}</div>
                <div class="grid-info">
                  <span class="info-lbl">School:</span>
                  <span class="info-val">${school}</span>
                  <span class="info-lbl">Class:</span>
                  <span class="info-val">${className}</span>
                  <span class="info-lbl">LGA/State:</span>
                  <span class="info-val">${lga} · ${state}</span>
                  <span class="info-lbl">Sex/Age:</span>
                  <span class="info-val">${genderDisplay} · ${ageDisplay}</span>
                </div>
              </div>

              <div class="qr-frame">
                ${qrCodeUrl ? `<img src="${qrCodeUrl}" alt="QR" />` : ""}
              </div>
            </div>

            <div class="card-footer">
              <span class="child-code">${student.childCode}</span>
              <span style="font-size: 3.5pt; color: #617985;">OFFICIAL STUDENT ID</span>
              <div class="signature-slot">Headmaster Signature</div>
            </div>
          </div>`;
        })
        .join("")}
    </div>
    `
    )
    .join("")}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 grid overflow-y-auto bg-[#082236]/65 p-3 backdrop-blur-sm sm:place-items-center">
      <div className="my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-[#fbfaf6] shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#cfd9d2] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#e7f4eb] text-[#167a4c]">
              <Layers size={19} />
            </div>
            <div>
              <p className="coordinate-label text-[#167a4c]">CR80 Batch Printing</p>
              <h2 className="font-display text-lg font-semibold text-[#123148]">
                {title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1 text-[#57707f] hover:bg-[#f0f4f1]"
          >
            <X size={20} />
          </button>
        </header>

        {/* Toolbar & Filter Controls */}
        <div className="border-b border-[#d8e0da] bg-[#f5f8f6] p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* School Filter */}
            {distinctSchools.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#38566a]">
                  School Scope
                </label>
                <select
                  value={selectedSchool}
                  onChange={(e) => {
                    setSelectedSchool(e.target.value);
                    setSelectedClass("all");
                  }}
                  className="field-input field-select !min-h-9 !py-1 text-xs"
                >
                  <option value="all">All Schools ({students.length})</option>
                  {distinctSchools.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Class Filter */}
            {distinctClasses.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#38566a]">
                  Class Scope
                </label>
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="field-input field-select !min-h-9 !py-1 text-xs"
                >
                  <option value="all">All Classes</option>
                  {distinctClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Print Side Selection */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#38566a]">
                Card Side
              </label>
              <select
                value={printMode}
                onChange={(e) => setPrintMode(e.target.value as PrintMode)}
                className="field-input field-select !min-h-9 !py-1 text-xs font-medium"
              >
                <option value="front-only">Front Badges (Roll-Call)</option>
                <option value="back-only">Back Terms (Security)</option>
              </select>
            </div>

            {/* Cutting Guides Toggle */}
            <div className="flex flex-col justify-end">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[#c5d3cb] bg-white px-3 py-2 text-xs font-semibold text-[#183a2d]">
                <input
                  type="checkbox"
                  checked={showCutGuides}
                  onChange={(e) => setShowCutGuides(e.target.checked)}
                  className="rounded border-[#167a4c] text-[#167a4c]"
                />
                <Scissors size={14} className="text-[#167a4c]" />
                <span>Cutting guides & crop marks</span>
              </label>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#57707f]">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#123148]">
                {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>
                <strong>{pages.length}</strong> A4 Sheet{pages.length === 1 ? "" : "s"} (8 cards / page)
              </span>
            </div>
            {generatingQr && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#167a4c]">
                <LoaderCircle size={13} className="animate-spin" />
                <span>Rendering attendance QR tokens…</span>
              </span>
            )}
          </div>
        </div>

        {/* Live A4 Sheet Preview */}
        <div className="max-h-[50vh] overflow-y-auto bg-[#e8edea] p-4">
          {pages.length === 0 ? (
            <div className="rounded border border-dashed border-[#b9c9c0] bg-white p-8 text-center text-sm text-[#718592]">
              No students match the selected school and class filter.
            </div>
          ) : (
            <div className="space-y-6">
              {pages.map((pageStudents, pageIdx) => (
                <div
                  key={pageIdx}
                  className="mx-auto max-w-[680px] rounded-lg border border-[#c5d3cb] bg-white p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between border-b border-[#e8ece7] pb-1.5 font-mono text-[0.62rem] uppercase text-[#718592]">
                    <span>
                      A4 Sheet {pageIdx + 1} of {pages.length}
                    </span>
                    <span>{pageStudents.length} CR80 Cards (2 × 4 Grid)</span>
                  </div>

                  {/* 2-column Grid Preview */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {pageStudents.map((student) => {
                      const fullName = [student.firstName, student.lastName].join(" ");
                      const qrUrl = qrMap[student.id];
                      return (
                        <div
                          key={student.id}
                          className="flex h-24 flex-col justify-between rounded border border-[#d8e0da] bg-[#fafcfa] p-2 text-[0.62rem]"
                        >
                          <div className="flex items-center justify-between border-b border-[#167a4c] pb-1">
                            <span className="font-extrabold text-[#123148]">
                              AM<span className="text-[#167a4c]">2050</span>
                            </span>
                            <span className="truncate text-[0.52rem] font-bold text-[#167a4c]">
                              {student.schoolName || defaultSchoolName || "BASIC SCHOOL"}
                            </span>
                          </div>

                          <div className="my-1 flex items-center gap-1.5">
                            <div className="size-10 shrink-0 overflow-hidden rounded border border-[#123148] bg-[#eff5f1]">
                              {student.photoUrl ? (
                                <img
                                  src={student.photoUrl}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : (
                                <div className="grid size-full place-items-center font-mono text-[0.5rem] font-bold text-[#718592]">
                                  NO PIC
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 leading-tight">
                              <p className="truncate font-bold text-[#123148]">{fullName}</p>
                              <p className="font-mono text-[0.55rem] text-[#167a4c]">
                                {student.childCode}
                              </p>
                              <p className="truncate text-[0.52rem] text-[#718592]">
                                {student.className || defaultClassName || "Primary"}
                              </p>
                            </div>
                            <div className="size-9 shrink-0 border border-[#c7d2d6] bg-white p-0.5">
                              {qrUrl ? (
                                <img src={qrUrl} alt="" className="size-full object-contain" />
                              ) : (
                                <div className="grid size-full place-items-center text-[0.45rem]">
                                  QR…
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between border-t border-[#e8ece7] pt-0.5 text-[0.5rem] text-[#718592]">
                            <span>CR80 PVC / Laminated</span>
                            <span>SUBEB Verified</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="flex flex-col items-center justify-between gap-3 border-t border-[#cfd9d2] bg-white px-5 py-3.5 sm:flex-row">
          <p className="text-xs text-[#57707f]">
            Standard CR80 85.6mm × 54mm dimensions with standard guillotine crop lines.
          </p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="action-press inline-flex h-10 items-center px-4 text-xs font-semibold text-[#57707f] hover:text-[#123148]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredStudents.length === 0 || generatingQr}
              className="action-press inline-flex h-10 items-center gap-2 rounded-md bg-[#167a4c] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#12643e] disabled:opacity-50"
            >
              <Printer size={16} />
              <span>Print A4 Batch ({filteredStudents.length} Cards)</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
