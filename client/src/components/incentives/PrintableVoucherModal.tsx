/* AM2050 — Field Ledger Modernism: Official A4 Printable Community Disbursement Voucher Sheet.
   Certified for SUBEB Jigawa / Ahoto Ward, Buji LGA Field Operations. */
import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Download, ShieldCheck } from 'lucide-react';

export interface VoucherBeneficiary {
  id: string;
  child_unique_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  guardian_phone?: string;
  household_code?: string;
  recipient_name?: string;
  attendance_rate: number | string;
  amount: number;
  payment_status: string;
  disbursement_reference?: string;
  school_name?: string;
  class_name?: string;
  community_name?: string;
}

export interface VoucherManifestData {
  manifestReference: string;
  generatedAt: string;
  month: string;
  state: string;
  lga: string;
  ward: string;
  community: string;
  totalBeneficiaries: number;
  totalAmount: number;
  beneficiaries: VoucherBeneficiary[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  manifest: VoucherManifestData | null;
}

export function PrintableVoucherModal({ isOpen, onClose, manifest }: Props) {
  if (!isOpen || !manifest) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = [
      'S/N',
      'Child Unique ID',
      'Child Name',
      'Gender',
      'Household Code',
      'Registered Guardian',
      'Guardian Phone',
      'School',
      'Class',
      'Attendance %',
      'Amount (NGN)',
      'Payment Status',
      'Disbursement Reference'
    ];

    const rows = manifest.beneficiaries.map((b, idx) => [
      idx + 1,
      b.child_unique_id,
      `"${b.first_name} ${b.last_name}"`,
      b.gender,
      b.household_code || '—',
      `"${b.recipient_name || 'Guardian'}"`,
      b.guardian_phone || '—',
      `"${b.school_name || 'Enrolled School'}"`,
      `"${b.class_name || 'Class'}"`,
      `${Number(b.attendance_rate).toFixed(1)}%`,
      b.amount,
      b.payment_status,
      b.disbursement_reference || '—'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(',')).join('\n')].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Voucher_Manifest_${manifest.ward}_${manifest.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #am2050-voucher-printable, #am2050-voucher-printable * {
                visibility: visible;
              }
              #am2050-voucher-printable {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: #ffffff !important;
                color: #0f172a !important;
                padding: 10mm !important;
                margin: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              @page {
                size: A4 landscape;
                margin: 8mm;
              }
            }
          `,
        }}
      />

      <div className="relative w-full max-w-5xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Modal Top Action Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50 no-print">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-700" />
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Official Community Disbursement Voucher Sheet
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Ref: {manifest.manifestReference} · {manifest.ward} ({manifest.community})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="action-press inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="action-press inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-1.5 text-xs font-bold shadow"
            >
              <Printer size={14} />
              Print Voucher Sheet (A4)
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable A4 Content Container */}
        <div id="am2050-voucher-printable" className="p-8 overflow-y-auto flex-1 text-slate-900 bg-white">
          {/* Header */}
          <div className="border-b-2 border-emerald-900 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-emerald-700"></span>
                  <span className="text-xs font-black tracking-widest uppercase text-emerald-800 font-mono">
                    AREWA MISSION 2050 • PILOT INTERVENTION PROGRAMME
                  </span>
                </div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight mt-1">
                  OFFICIAL COMMUNITY CASH DISBURSEMENT VOUCHER
                </h1>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  State Universal Basic Education Board (SUBEB) & Islamic Education Bureau Field Operations
                </p>
              </div>

              <div className="text-right">
                <div className="inline-block rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    Voucher Manifest Ref
                  </p>
                  <p className="font-mono text-xs font-bold text-emerald-950">
                    {manifest.manifestReference}
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Generated: {manifest.generatedAt}
                </p>
              </div>
            </div>

            {/* Jurisdiction / Meta Grid */}
            <div className="mt-4 grid grid-cols-6 gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">State</span>
                <span className="font-semibold text-slate-800">{manifest.state}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">LGA</span>
                <span className="font-semibold text-slate-800">{manifest.lga}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Ward</span>
                <span className="font-semibold text-slate-800">{manifest.ward}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Community</span>
                <span className="font-semibold text-slate-800">{manifest.community}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Billing Month</span>
                <span className="font-semibold text-slate-800 font-mono">{manifest.month}</span>
              </div>
              <div className="text-right border-l border-slate-200 pl-2">
                <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Payroll</span>
                <span className="font-black text-emerald-700 font-mono text-sm">
                  ₦{manifest.totalAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Beneficiary Roster Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                  <th className="py-2 px-2 w-8">#</th>
                  <th className="py-2 px-2">Child ID & Name</th>
                  <th className="py-2 px-2">School & Class</th>
                  <th className="py-2 px-2">Registered Guardian / Phone</th>
                  <th className="py-2 px-2 text-center">Attn %</th>
                  <th className="py-2 px-2 text-right">Amount (₦)</th>
                  <th className="py-2 px-2 text-center">Status</th>
                  <th className="py-2 px-3 text-center w-36">Guardian Thumbprint / Sign</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {manifest.beneficiaries.map((b, idx) => (
                  <tr key={b.id || idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-2">
                      <div className="font-bold text-slate-900">
                        {b.first_name} {b.last_name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {b.child_unique_id} · {b.gender}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="text-slate-800 font-medium truncate max-w-[160px]">
                        {b.school_name || 'Enrolled Primary/JSS'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {b.class_name || 'Basic Education'}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="text-slate-800 font-medium">
                        {b.recipient_name || 'Primary Guardian'}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {b.guardian_phone || b.household_code || '—'}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono font-bold">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        Number(b.attendance_rate) >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {Number(b.attendance_rate).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                      ₦{Number(b.amount).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        b.payment_status === 'disbursed'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : b.payment_status === 'approved'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {b.payment_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center border-l border-slate-200">
                      <div className="h-10 w-full border border-dashed border-slate-300 rounded bg-slate-50/50 flex items-center justify-center">
                        <span className="text-[9px] text-slate-400 italic">Signature / Thumb</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tri-Party Sign-Off Block */}
          <div className="mt-8 pt-6 border-t-2 border-slate-300">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-4">
              Official Tripartite Verification & Reconciliation Signatures
            </p>
            <div className="grid grid-cols-3 gap-6">
              <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 text-center">
                <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold text-slate-900 text-xs">Community / Village Head</p>
                <p className="text-[10px] text-slate-500">Traditional Council Endorsement</p>
                <div className="mt-2 text-[9px] font-mono text-slate-400">Date: ____ / ____ / 2026</div>
              </div>

              <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 text-center">
                <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold text-slate-900 text-xs">Assigned Ward Mobilizer</p>
                <p className="text-[10px] text-slate-500">Field Disbursement Agent</p>
                <div className="mt-2 text-[9px] font-mono text-slate-400">Date: ____ / ____ / 2026</div>
              </div>

              <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 text-center">
                <div className="h-12 border-b border-dashed border-slate-400 mb-2"></div>
                <p className="font-bold text-slate-900 text-xs">AM2050 / SUBEB Supervisor</p>
                <p className="text-[10px] text-slate-500">Compliance & Audit Sign-Off</p>
                <div className="mt-2 text-[9px] font-mono text-slate-400">Date: ____ / ____ / 2026</div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-between items-center text-[9px] text-slate-400 font-mono">
              <span>AREWA MISSION 2050 • SYSTEM GENERATED AUDIT LEDGER</span>
              <span>VERIFIED SUBEB JIGAWA INTERVENTION • PAGE 1 OF 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
