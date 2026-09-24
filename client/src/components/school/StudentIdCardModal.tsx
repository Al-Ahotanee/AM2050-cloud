/* AM2050 — Field Ledger Modernism: Biometric PVC Student ID Card Modal.
   Compliant with ISO/IEC 7810 CR80 standard (85.6mm × 54mm) for direct PVC badge printing
   or laminated cardstock distribution across Northern Nigerian basic education schools. */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Download, Printer, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

export interface StudentIdCardData {
  id: string;
  childCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  photoUrl?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  estimatedAge?: number | null;
  schoolName?: string | null;
  className?: string | null;
  wardName?: string | null;
  lgaName?: string | null;
  stateName?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  attendanceToken?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  student: StudentIdCardData | null;
}

export function StudentIdCardModal({ isOpen, onClose, student }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [side, setSide] = useState<"front" | "back">("front");

  const fullName = student
    ? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ").toUpperCase()
    : "STUDENT RECORD";

  const tokenValue = student
    ? student.attendanceToken || student.childCode || student.id
    : "AM2050-DEMO";

  const rawQrValue = `AM2050:${tokenValue}`;

  useEffect(() => {
    if (!isOpen || !student) return;
    QRCode.toDataURL(rawQrValue, {
      width: 256,
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#123148",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch((err) => {
        console.error("QR Code Error:", err);
        toast.error("Failed to generate student attendance QR code.");
      });
  }, [isOpen, student, rawQrValue]);

  if (!isOpen || !student) return null;

  const school = student.schoolName || "SUBEB Community Basic School";
  const ward = student.wardName || "Central Ward";
  const lga = student.lgaName || "Dutse LGA";
  const state = student.stateName || "Jigawa State";
  const ageDisplay = student.estimatedAge ? `${student.estimatedAge} YRS` : student.dateOfBirth || "N/A";
  const genderDisplay = student.gender ? student.gender.toUpperCase() : "RECORDED";

  const handlePrint = () => {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=700,height=500");
    if (!printWindow) {
      toast.error("Please allow pop-ups to print PVC ID card.");
      return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AM2050 PVC Card - ${student.childCode}</title>
  <style>
    @page {
      size: 85.6mm 53.98mm;
      margin: 0;
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
      width: 85.6mm;
      height: 53.98mm;
      overflow: hidden;
    }
    .card-cr80 {
      width: 85.6mm;
      height: 53.98mm;
      padding: 3mm 3.5mm;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
      background: #ffffff;
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #167a4c;
      padding-bottom: 1.5mm;
    }
    .brand-mark {
      font-size: 11pt;
      font-weight: 900;
      letter-spacing: -0.4px;
      color: #123148;
      display: flex;
      align-items: center;
      gap: 1.5mm;
    }
    .brand-mark .year {
      color: #167a4c;
    }
    .header-titles {
      text-align: right;
    }
    .gov-title {
      font-size: 5pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #167a4c;
      text-transform: uppercase;
    }
    .tagline-sub {
      font-size: 3.8pt;
      font-weight: 700;
      color: #57707f;
      letter-spacing: 0.2px;
    }
    .ribbon-ng {
      height: 1.5px;
      display: flex;
      width: 100%;
      margin-top: 1mm;
      margin-bottom: 1mm;
    }
    .ribbon-green { background: #008751; flex: 1; }
    .ribbon-white { background: #ffffff; flex: 1; }

    .card-body {
      display: flex;
      gap: 3mm;
      align-items: center;
      flex: 1;
      margin-top: 1mm;
    }
    .photo-frame {
      width: 22mm;
      height: 29.3mm; /* 3:4 aspect ratio */
      border: 1.2px solid #123148;
      border-radius: 1.5mm;
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
      font-size: 7.5pt;
      font-weight: 800;
      line-height: 1.15;
      color: #123148;
      margin-bottom: 1.5mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .grid-info {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.8mm 2mm;
      font-size: 4.8pt;
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
      width: 20mm;
      height: 20mm;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border: 0.8px solid #c7d2d6;
      border-radius: 1mm;
      padding: 0.5mm;
      background: #ffffff;
    }
    .qr-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .qr-label {
      font-size: 3.2pt;
      font-weight: 800;
      color: #167a4c;
      letter-spacing: 0.2px;
      margin-top: 0.5mm;
    }

    .card-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      border-top: 0.8px solid #d4dfd8;
      padding-top: 1mm;
      font-size: 4.2pt;
    }
    .child-code {
      font-family: monospace;
      font-size: 5.5pt;
      font-weight: 800;
      color: #167a4c;
    }
    .signature-slot {
      text-align: right;
      border-top: 0.6px dashed #718592;
      padding-top: 0.5mm;
      min-width: 25mm;
      font-size: 3.8pt;
      color: #57707f;
      font-weight: 600;
    }

    /* Back of Card */
    .card-back {
      width: 85.6mm;
      height: 53.98mm;
      padding: 3.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: #fbfdfb;
      border: 0.5px solid #d4dfd8;
      font-size: 4.5pt;
      line-height: 1.35;
      color: #334d5c;
    }
    .back-title {
      font-size: 6pt;
      font-weight: 800;
      color: #123148;
      text-transform: uppercase;
      border-bottom: 1px solid #167a4c;
      padding-bottom: 1mm;
      margin-bottom: 1.5mm;
    }
    .terms-ol {
      margin: 0;
      padding-left: 3.5mm;
    }
    .terms-ol li {
      margin-bottom: 1mm;
    }
    .back-contact {
      background: #eff5f1;
      border: 0.8px solid #c7d2d6;
      border-radius: 1mm;
      padding: 1.5mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <!-- FRONT SIDE -->
  <div class="card-cr80">
    <div>
      <div class="header-bar">
        <div class="brand-mark">
          <span>AM<span class="year">2050</span></span>
        </div>
        <div class="header-titles">
          <div class="gov-title">Universal Basic Education · Jigawa</div>
          <div class="tagline-sub">ZERO OUT-OF-SCHOOL CHILDREN IN AREWA BY 2050</div>
        </div>
      </div>
      <div class="ribbon-ng">
        <div class="ribbon-green"></div>
        <div class="ribbon-white"></div>
        <div class="ribbon-green"></div>
      </div>
    </div>

    <div class="card-body">
      <div class="photo-frame">
        ${
          student.photoUrl
            ? `<img src="${student.photoUrl}" alt="${fullName}" />`
            : `<div style="font-size:4.5pt; text-align:center; color:#718592; font-weight:700;">VERIFIED<br/>3:4 PHOTO<br/>REQUIRED</div>`
        }
      </div>

      <div class="details">
        <div class="student-name">${fullName}</div>
        <div class="grid-info">
          <span class="info-lbl">School:</span>
          <span class="info-val">${school}</span>

          <span class="info-lbl">LGA / Ward:</span>
          <span class="info-val">${lga} · ${ward}</span>

          <span class="info-lbl">Age / Sex:</span>
          <span class="info-val">${ageDisplay} · ${genderDisplay}</span>

          <span class="info-lbl">Guardian:</span>
          <span class="info-val">${student.guardianName || "Household Registry"} (${student.guardianPhone || "N/A"})</span>
        </div>
      </div>

      <div class="qr-frame">
        <img src="${qrDataUrl}" alt="QR Attendance Token" />
        <div class="qr-label">ATTENDANCE QR</div>
      </div>
    </div>

    <div class="card-footer">
      <div>
        <div class="child-code">${student.childCode}</div>
        <div style="font-size:3.5pt; color:#617985;">SECURITY REF: ${tokenValue.substring(0, 16)}</div>
      </div>
      <div class="signature-slot">
        Headmaster Stamp & Signature
      </div>
    </div>
  </div>

  <!-- BACK SIDE -->
  <div class="card-cr80 card-back">
    <div>
      <div class="back-title">SUBEB / AM2050 Field Directives & Verification</div>
      <ol class="terms-ol">
        <li><strong>Official Credential:</strong> This biometric card is the official property of the Universal Basic Education Board & AM2050 Initiative. Valid across all accredited public and Tsangaya learning centres.</li>
        <li><strong>CCT Stipend Trigger:</strong> Present this card daily. Morning biometric QR roll-call triggers verified monthly Conditional Cash Transfer (CCT) stipends to the student's registered household.</li>
        <li><strong>Replacement & Misplacement:</strong> Report lost or damaged cards immediately to your community Headmaster or SUBEB Field Enumerator.</li>
      </ol>
    </div>

    <div>
      <div class="back-contact">
        <div>
          <div style="font-size:4pt; color:#617985;">HOTLINE & VERIFICATION:</div>
          <div style="font-size:5.5pt; color:#123148;">0800-AM2050-JIGAWA (Toll-Free)</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:4pt; color:#617985;">DATABASE SYNCHRONISED</div>
          <div style="font-family:monospace; font-size:5pt; color:#167a4c;">VERIFIED LIVE RECORD</div>
        </div>
      </div>
      <div style="text-align:center; font-size:3.5pt; color:#718592; margin-top:1.5mm;">
        FEDERAL REPUBLIC OF NIGERIA · UNIVERSAL BASIC EDUCATION COMMISSION · AM2050 DIRECTIVE
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#082236]/65 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-xl border border-[#c7d2d6] bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#e2eae5] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eff5f1] px-2 py-0.5 font-mono text-xs font-bold text-[#167a4c]">
                CR80 STANDARD
              </span>
              <span className="text-xs font-semibold text-[#57707f]">85.6mm × 54.0mm Standard</span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-[#123148]">
              Official Student ID Card
            </h2>
          </div>
          <button
            onClick={onClose}
            className="action-press grid size-8 place-items-center rounded-lg border border-[#c7d2d6] text-[#57707f] hover:bg-[#eff5f1]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Side Toggle */}
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setSide("front")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
              side === "front"
                ? "bg-[#167a4c] text-white shadow-sm"
                : "border border-[#c7d2d6] bg-white text-[#57707f] hover:bg-[#eff5f1]"
            }`}
          >
            Front Side
          </button>
          <button
            onClick={() => setSide("back")}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
              side === "back"
                ? "bg-[#167a4c] text-white shadow-sm"
                : "border border-[#c7d2d6] bg-white text-[#57707f] hover:bg-[#eff5f1]"
            }`}
          >
            Back Side (Terms & Directives)
          </button>
        </div>

        {/* Visual Card Preview */}
        <div className="mt-6 flex justify-center">
          {side === "front" ? (
            <div
              className="relative w-[420px] rounded-xl border-2 border-[#123148]/80 bg-white p-4 shadow-xl select-none"
              style={{ aspectRatio: "1.586" }}
            >
              {/* National Tricolor Top Stripe */}
              <div className="absolute top-0 left-0 right-0 h-1.5 overflow-hidden rounded-t-[10px] flex">
                <div className="h-full flex-1 bg-[#008751]" />
                <div className="h-full flex-1 bg-white" />
                <div className="h-full flex-1 bg-[#008751]" />
              </div>

              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#e2eae5] pt-1 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-black tracking-tight text-[#123148]">
                    AM<span className="text-[#167a4c]">2050</span>
                  </span>
                  <div className="h-3 w-[1px] bg-[#c7d2d6]" />
                  <span className="text-[9px] font-extrabold tracking-wider text-[#167a4c] uppercase">
                    SUBEB JIGAWA
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[7.5px] font-bold text-[#57707f] tracking-tight uppercase">
                    AREWA MISSION 2050
                  </p>
                  <p className="text-[6.5px] font-extrabold text-[#167a4c]">
                    BASIC EDUCATION IDENTITY
                  </p>
                </div>
              </div>

              {/* Card Main Body */}
              <div className="mt-3 flex gap-3 items-center">
                {/* 3:4 Biometric Photo */}
                <div className="relative size-24 w-[76px] h-[101px] shrink-0 rounded border-2 border-[#123148] bg-[#eff5f1] overflow-hidden shadow-inner flex items-center justify-center">
                  {student.photoUrl ? (
                    <img
                      src={student.photoUrl}
                      alt={fullName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-1">
                      <ShieldCheck className="mx-auto size-6 text-[#718592]" />
                      <span className="block mt-1 font-mono text-[8px] font-bold text-[#718592]">
                        STUDENT PHOTO
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-[#123148]/80 py-0.5 text-center text-[7px] font-black text-white uppercase tracking-wider">
                    VERIFIED
                  </div>
                </div>

                {/* Information Fields */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div>
                    <span className="text-[8px] font-bold uppercase text-[#617985]">
                      Learner Full Name
                    </span>
                    <p className="truncate font-display text-xs font-black text-[#123148]">
                      {fullName}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
                    <div>
                      <span className="block text-[7.5px] font-bold uppercase text-[#617985]">
                        School / Centre
                      </span>
                      <p className="truncate font-bold text-[#123148]">{school}</p>
                    </div>
                    <div>
                      <span className="block text-[7.5px] font-bold uppercase text-[#617985]">
                        Ward / LGA
                      </span>
                      <p className="truncate font-bold text-[#123148]">{ward} · {lga}</p>
                    </div>
                    <div>
                      <span className="block text-[7.5px] font-bold uppercase text-[#617985]">
                        Age / Gender
                      </span>
                      <p className="font-bold text-[#123148]">{ageDisplay} · {genderDisplay}</p>
                    </div>
                    <div>
                      <span className="block text-[7.5px] font-bold uppercase text-[#617985]">
                        Guardian Contact
                      </span>
                      <p className="truncate font-bold text-[#123148]">{student.guardianPhone || "N/A"}</p>
                    </div>
                  </div>
                </div>

                {/* Scannable Attendance QR */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="size-20 rounded border border-[#c7d2d6] bg-white p-1 shadow-sm">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Attendance QR Code"
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="size-full bg-neutral-100 animate-pulse" />
                    )}
                  </div>
                  <span className="mt-1 text-[7.5px] font-black text-[#167a4c] tracking-tight uppercase">
                    SCAN ROLL-CALL
                  </span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between border-t border-[#e2eae5] pt-1.5">
                <div>
                  <span className="font-mono text-[10px] font-black text-[#167a4c]">
                    {student.childCode}
                  </span>
                  <p className="text-[7px] text-[#718592]">
                    SECURITY TOKEN: {tokenValue.substring(0, 14)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="w-24 border-b border-dashed border-[#718592] pb-0.5" />
                  <span className="text-[7px] font-semibold text-[#57707f]">
                    Headmaster Signature
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="relative w-[420px] rounded-xl border-2 border-[#123148]/80 bg-[#fbfdfb] p-5 shadow-xl select-none flex flex-col justify-between"
              style={{ aspectRatio: "1.586" }}
            >
              <div>
                <div className="flex items-center justify-between border-b border-[#167a4c] pb-1.5">
                  <span className="font-display text-xs font-black text-[#123148] uppercase tracking-wide">
                    Terms & Directives of Issuance
                  </span>
                  <span className="text-[8px] font-bold text-[#167a4c]">
                    SUBEB COMPLIANT
                  </span>
                </div>
                <ol className="mt-3 space-y-2 text-[9px] leading-relaxed text-[#334d5c]">
                  <li>
                    <strong>1. Official Credential:</strong> This card is the official property of the Universal Basic Education Board & AM2050 Initiative. Valid across all accredited public and Tsangaya learning centres.
                  </li>
                  <li>
                    <strong>2. Attendance & Verification:</strong> Present this card daily. Morning QR roll-call confirms attendance and qualifies eligible households for designated educational support and stipends.
                  </li>
                  <li>
                    <strong>3. Safe Custody:</strong> Keep clean and unbent. Report lost or damaged cards immediately to your community Headmaster or SUBEB Field Officer.
                  </li>
                </ol>
              </div>

              <div className="rounded border border-[#c7d2d6] bg-[#eff5f1] p-2 flex items-center justify-between">
                <div>
                  <p className="text-[7.5px] font-bold text-[#617985] uppercase">
                    EMERGENCY / TOLL-FREE INQUIRIES
                  </p>
                  <p className="font-mono text-[10px] font-black text-[#123148]">
                    0800-AM2050-JIGAWA
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 rounded bg-[#167a4c] px-2 py-0.5 text-[8px] font-bold text-white">
                    <CheckCircle2 size={10} /> VERIFIED LIVE
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2eae5] pt-4">
          <p className="text-xs text-[#57707f]">
            Ready for standard Fargo/Zebra PVC printers or cardstock lamination.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="action-press rounded-lg border border-[#c7d2d6] bg-white px-4 py-2 text-xs font-semibold text-[#57707f] hover:bg-[#eff5f1]"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="action-press inline-flex items-center gap-2 rounded-lg bg-[#167a4c] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#12643e]"
            >
              <Printer size={15} />
              Print Student ID Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
