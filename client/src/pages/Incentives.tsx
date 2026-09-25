/* AM2050 — Field Ledger Modernism: World-Class Executive Incentives Management Suite
   Covers CCT Grants, Nutrition Stipends, Uniform Subsidies, Automated Attendance Computing,
   Batch Approvals, Multi-Channel Disbursements, and Official A4 Printable Community Vouchers. */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Banknote,
  Calculator,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Filter,
  Layers,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  XCircle,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  CreditCard,
  Building2,
  QrCode,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from "@/api/client";

const api = {
  get: async <T,>(url: string) => {
    const res = await apiClient.request<T>(url, { method: "GET" });
    if (!res.success) throw new Error(res.error);
    return { data: res.data };
  },
  post: async <T,>(url: string, body?: unknown) => {
    const res = await apiClient.request<T>(url, { method: "POST", body });
    if (!res.success) throw new Error(res.error);
    return { data: res.data };
  },
};
import { PrintableVoucherModal, VoucherManifestData } from '../components/incentives/PrintableVoucherModal';
import { DonorLedgerModal, IncentiveRecord } from '../components/governance/DonorLedgerModal';

interface IncentiveItem {
  id: string;
  child_id: string;
  child_unique_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  photo_url?: string;
  month: string;
  attendance_rate: number | string;
  eligibility_status: 'eligible' | 'ineligible';
  payment_status: 'pending' | 'approved' | 'disbursed' | 'rejected';
  amount: number | string;
  payment_method: string;
  recipient_name?: string;
  recipient_phone?: string;
  household_code?: string;
  ward_name?: string;
  community_name?: string;
  school_name?: string;
  class_name?: string;
  disbursement_reference?: string;
  batch_reference?: string;
  disbursement_date?: string;
  created_at: string;
}

interface SummaryKpis {
  totalEvaluated: number;
  totalEligible: number;
  totalIneligible: number;
  totalApproved: number;
  totalDisbursed: number;
  totalEligibleAmount: number;
  totalApprovedAmount: number;
  totalDisbursedAmount: number;
}

interface Props {
  role?: string;
}

const PROGRAM_TYPES = [
  { id: 'cct', label: 'Conditional Cash Transfer (CCT)', baseAmount: 5000, desc: 'Monthly basic education re-enrollment stipend' },
  { id: 'uniform', label: 'Uniform & Materials Grant', baseAmount: 7500, desc: 'One-off start of term uniform subsidy' },
  { id: 'nutrition', label: 'Nutrition & Meals Support', baseAmount: 4000, desc: 'School meal nutritional welfare supplement' },
  { id: 'transport', label: 'Remote Commute Transport Subsidy', baseAmount: 3500, desc: 'Hard-to-reach settlement transit incentive' },
  { id: 'tsangaya', label: 'Tsangaya Integration Stipend', baseAmount: 6000, desc: 'Integrated Almajiri modern curriculum stipend' },
];

export function Incentives({ role }: Props) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'roster' | 'eligibility' | 'batch' | 'vouchers' | 'donor'>('roster');

  // Filters & State
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Data
  const [loading, setLoading] = useState<boolean>(true);
  const [incentives, setIncentives] = useState<IncentiveItem[]>([]);
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const limit = 50;

  // KPIs
  const [kpis, setKpis] = useState<SummaryKpis>({
    totalEvaluated: 0,
    totalEligible: 0,
    totalIneligible: 0,
    totalApproved: 0,
    totalDisbursed: 0,
    totalEligibleAmount: 0,
    totalApprovedAmount: 0,
    totalDisbursedAmount: 0,
  });

  // Batch Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Eligibility Compute Engine State
  const [selectedProgramType, setSelectedProgramType] = useState<string>('cct');
  const [attendanceThreshold, setAttendanceThreshold] = useState<number>(80);
  const [customAmount, setCustomAmount] = useState<number>(5000);
  const [computing, setComputing] = useState<boolean>(false);

  // Batch Action State
  const [batchActionType, setBatchActionType] = useState<'selected' | 'all_eligible'>('selected');
  const [batchMethod, setBatchMethod] = useState<string>('bank_transfer');
  const [batchReferenceInput, setBatchReferenceInput] = useState<string>(() => `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-NIBSS`);
  const [processingBatch, setProcessingBatch] = useState<boolean>(false);

  // Modals
  const [voucherModalOpen, setVoucherModalOpen] = useState<boolean>(false);
  const [voucherManifest, setVoucherManifest] = useState<VoucherManifestData | null>(null);
  const [donorModalOpen, setDonorModalOpen] = useState<boolean>(false);
  const [loadingVoucher, setLoadingVoucher] = useState<boolean>(false);

  // Community / Ward Options
  const [wards, setWards] = useState<{ id: string; name: string }[]>([]);
  const [communities, setCommunities] = useState<{ id: string; name: string; ward_id: string }[]>([]);
  const [selectedWard, setSelectedWard] = useState<string>('');
  const [selectedCommunity, setSelectedCommunity] = useState<string>('');

  // Fetch Lookups
  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>('/wards')
      .then((res) => setWards(res.data?.data || []))
      .catch(() => {});
    api.get<{ data: { id: string; name: string; ward_id: string }[] }>('/communities')
      .then((res) => setCommunities(res.data?.data || []))
      .catch(() => {});
  }, []);

  // Fetch Summary KPIs
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get<{ month: string; kpis: SummaryKpis }>(`/incentives/summary?month=${month}`);
      if (res.data?.kpis) {
        setKpis(res.data.kpis);
      }
    } catch (err: any) {
      console.error('Failed to load incentives summary', err);
    }
  }, [month]);

  // Fetch Roster Data
  const fetchIncentives = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('month', month);
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) params.set('payment_status', statusFilter);
      if (eligibilityFilter) params.set('eligibility_status', eligibilityFilter);
      if (paymentMethodFilter) params.set('payment_method', paymentMethodFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (selectedWard) params.set('ward_id', selectedWard);
      if (selectedCommunity) params.set('community_id', selectedCommunity);

      const res = await api.get<{ data: IncentiveItem[]; total: number }>(`/incentives?${params.toString()}`);
      setIncentives(res.data?.data || []);
      setTotalRecords(res.data?.total || 0);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to fetch incentives roster');
    } finally {
      setLoading(false);
    }
  }, [month, page, statusFilter, eligibilityFilter, paymentMethodFilter, searchQuery, selectedWard, selectedCommunity]);

  useEffect(() => {
    fetchSummary();
    fetchIncentives();
  }, [fetchSummary, fetchIncentives]);

  // Selection Toggles
  const toggleSelectAll = () => {
    if (selectedIds.size === incentives.length && incentives.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(incentives.map((i) => i.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Automated Compute Engine
  const handleRunCompute = async () => {
    setComputing(true);
    try {
      const res = await api.post<{ evaluated: number; eligible: number; ineligible: number; month: string }>(
        '/incentives/compute',
        {
          month,
          attendanceThreshold,
          amount: customAmount,
        }
      );
      toast.success(
        `Eligibility computed for ${month}: ${res.data?.eligible ?? 0} eligible, ${res.data?.ineligible ?? 0} ineligible out of ${res.data?.evaluated ?? 0} enrolled children!`
      );
      fetchSummary();
      fetchIncentives();
      setActiveTab('roster');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to compute eligibility');
    } finally {
      setComputing(false);
    }
  };

  // Batch Approval
  const handleBatchApprove = async (approve: boolean) => {
    if (batchActionType === 'selected' && selectedIds.size === 0) {
      toast.error('Please select at least one record from the ledger.');
      return;
    }
    setProcessingBatch(true);
    try {
      const payload: any = {
        paymentStatus: approve ? 'approved' : 'rejected',
      };
      if (batchActionType === 'selected') {
        payload.ids = Array.from(selectedIds);
      } else {
        payload.month = month;
      }

      const res = await api.post<{ count: number; paymentStatus: string }>('/incentives/batch-approve', payload);
      toast.success(
        `Successfully ${approve ? 'approved' : 'rejected'} ${res.data?.count ?? 0} incentive disbursement record(s)!`
      );
      setSelectedIds(new Set());
      fetchSummary();
      fetchIncentives();
    } catch (err: any) {
      toast.error(err?.message || 'Batch approval failed');
    } finally {
      setProcessingBatch(false);
    }
  };

  // Batch Disbursement
  const handleBatchDisburse = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select approved incentive records to include in this disbursement batch.');
      return;
    }
    setProcessingBatch(true);
    try {
      const payload = {
        ids: Array.from(selectedIds),
        paymentMethod: batchMethod,
        batchReference: batchReferenceInput.trim() || `BATCH-${Date.now()}`,
      };

      const res = await api.post<{ disbursedCount: number; totalAmount: number; batchReference: string }>(
        '/incentives/batch-disburse',
        payload
      );
      toast.success(
        `Disbursement batch ${res.data?.batchReference} executed: ${res.data?.disbursedCount} beneficiary payments processed (₦${Number(res.data?.totalAmount).toLocaleString()})!`
      );
      setSelectedIds(new Set());
      fetchSummary();
      fetchIncentives();
    } catch (err: any) {
      toast.error(err?.message || 'Batch disbursement execution failed');
    } finally {
      setProcessingBatch(false);
    }
  };

  // Open Printable Voucher Sheet
  const handleGenerateVoucherManifest = async () => {
    setLoadingVoucher(true);
    try {
      const params = new URLSearchParams();
      params.set('month', month);
      if (selectedWard) params.set('ward_id', selectedWard);
      if (selectedCommunity) params.set('community_id', selectedCommunity);
      params.set('payment_status', statusFilter || 'approved');

      const res = await api.get<VoucherManifestData>(`/incentives/voucher-manifest?${params.toString()}`);
      if (!res.data || !res.data.beneficiaries || res.data.beneficiaries.length === 0) {
        toast.info('No eligible beneficiaries found for the selected community & month filter.');
      }
      setVoucherManifest(res.data);
      setVoucherModalOpen(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to compile voucher manifest');
    } finally {
      setLoadingVoucher(false);
    }
  };

  // Format Helpers
  const formatNaira = (val: number | string) => `₦${Number(val || 0).toLocaleString()}`;

  // Filtered communities by selected ward
  const filteredCommunities = useMemo(() => {
    if (!selectedWard) return communities;
    return communities.filter((c) => c.ward_id === selectedWard);
  }, [communities, selectedWard]);

  // Convert for DonorLedgerModal
  const donorLedgerRecords: IncentiveRecord[] = useMemo(() => {
    return incentives.map((i) => ({
      id: i.id,
      child_id: i.child_id,
      child_unique_id: i.child_unique_id,
      first_name: i.first_name,
      last_name: i.last_name,
      month: i.month,
      attendance_rate: String(i.attendance_rate),
      eligibility_status: i.eligibility_status,
      payment_status: i.payment_status,
      disbursement_reference: i.disbursement_reference || null,
      configured_amount: i.amount,
    }));
  }, [incentives]);

  return (
    <div className="space-y-6 pb-12">
      {/* Executive Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-6 md:p-8 text-white shadow-xl border border-emerald-900/40">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Sparkles size={14} className="text-emerald-400" />
              <span>Programmatic Welfare & CCT Disbursement Suite</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Incentives & Grant Management
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Automated attendance-based cash grant eligibility compute, multi-channel bulk disbursements, 
              SUBEB-certified community cash vouchers, and donor audit manifests.
            </p>
          </div>

          {/* Top Quick Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setActiveTab('eligibility')}
              className="action-press inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/50"
            >
              <Calculator size={15} />
              Run Compute Engine
            </button>
            <button
              onClick={handleGenerateVoucherManifest}
              disabled={loadingVoucher}
              className="action-press inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm"
            >
              <Printer size={15} className="text-emerald-400" />
              {loadingVoucher ? 'Loading...' : 'Print Voucher Sheet (A4)'}
            </button>
            <button
              onClick={() => setDonorModalOpen(true)}
              className="action-press inline-flex items-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-emerald-300 shadow-sm"
            >
              <ShieldCheck size={15} />
              Donor Audit
            </button>
          </div>
        </div>

        {/* Decorative Grid Mesh */}
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Evaluated */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Evaluated Beneficiaries</span>
            <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <Users size={18} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900">{kpis.totalEvaluated.toLocaleString()}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="font-semibold text-emerald-600">{kpis.totalEligible.toLocaleString()} Eligible</span>
              <span className="text-slate-300">•</span>
              <span className="font-medium text-rose-500">{kpis.totalIneligible.toLocaleString()} Ineligible</span>
            </div>
          </div>
        </div>

        {/* Approved Funds */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Approved Allocation</span>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-700">{formatNaira(kpis.totalApprovedAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-bold text-slate-700">{kpis.totalApproved.toLocaleString()}</span> awards authorized for release
            </p>
          </div>
        </div>

        {/* Disbursed Funds */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Disbursed To Date</span>
            <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
              <Banknote size={18} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-purple-700">{formatNaira(kpis.totalDisbursedAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-bold text-slate-700">{kpis.totalDisbursed.toLocaleString()}</span> verified payouts settled
            </p>
          </div>
        </div>

        {/* Pending Clearance */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Eligible Pipeline</span>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-600">{formatNaira(kpis.totalEligibleAmount)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Total monthly qualification pool
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 rounded-xl shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('roster')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'roster'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers size={15} />
            Payroll & Beneficiary Ledger
          </button>

          <button
            onClick={() => setActiveTab('eligibility')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'eligibility'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Calculator size={15} />
            Automated Eligibility Engine
          </button>

          <button
            onClick={() => setActiveTab('batch')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'batch'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Wallet size={15} />
            Batch Approvals & Disbursements
          </button>

          <button
            onClick={() => setActiveTab('vouchers')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'vouchers'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Printer size={15} />
            Printable Community Vouchers
          </button>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => {
            fetchSummary();
            fetchIncentives();
          }}
          disabled={loading}
          className="action-press inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Sync
        </button>
      </div>

      {/* TAB 1: PAYROLL & BENEFICIARY LEDGER */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              {/* Search */}
              <div className="md:col-span-2 relative">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search child name, ID, household, or guardian..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Month */}
              <div>
                <input
                  type="date"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-mono text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Payment Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none"
                >
                  <option value="">All Payment Statuses</option>
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="disbursed">Disbursed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Eligibility Filter */}
              <div>
                <select
                  value={eligibilityFilter}
                  onChange={(e) => setEligibilityFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none"
                >
                  <option value="">All Eligibility</option>
                  <option value="eligible">Eligible (&gt;= 80%)</option>
                  <option value="ineligible">Ineligible (&lt; 80%)</option>
                </select>
              </div>

              {/* Payment Method Filter */}
              <div>
                <select
                  value={paymentMethodFilter}
                  onChange={(e) => setPaymentMethodFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-700 focus:border-emerald-500 focus:bg-white focus:outline-none"
                >
                  <option value="">All Channels</option>
                  <option value="bank_transfer">Bank Transfer (NIBSS)</option>
                  <option value="mobile_money">Mobile Money (OPay)</option>
                  <option value="cash_agent">Community Cash Agent</option>
                  <option value="voucher">Physical Voucher</option>
                </select>
              </div>
            </div>

            {/* Batch Selection Action Bar */}
            {selectedIds.size > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                    {selectedIds.size}
                  </span>
                  <span className="text-xs font-bold text-emerald-950">
                    Beneficiary Records Selected for Action
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleBatchApprove(true)}
                    disabled={processingBatch}
                    className="action-press inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 shadow-sm"
                  >
                    <CheckCircle2 size={13} />
                    Approve Selected
                  </button>

                  <button
                    onClick={() => {
                      setBatchActionType('selected');
                      setActiveTab('batch');
                    }}
                    className="action-press inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-sm"
                  >
                    <Wallet size={13} />
                    Proceed to Disburse ({selectedIds.size})
                  </button>

                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="action-press rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={incentives.length > 0 && selectedIds.size === incentives.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="py-3 px-3">Beneficiary Child</th>
                    <th className="py-3 px-3">School & Community</th>
                    <th className="py-3 px-3">Guardian / Payout Target</th>
                    <th className="py-3 px-3 text-center">Attendance</th>
                    <th className="py-3 px-3 text-right">Amount (₦)</th>
                    <th className="py-3 px-3 text-center">Eligibility</th>
                    <th className="py-3 px-3 text-center">Payment Status</th>
                    <th className="py-3 px-3 text-center">Channel / Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-emerald-600" />
                        Loading incentives roster...
                      </td>
                    </tr>
                  ) : incentives.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <DollarSign size={28} className="mx-auto mb-2 text-slate-300" />
                        No incentive records found for the selected criteria.
                        <div className="mt-2">
                          <button
                            onClick={() => setActiveTab('eligibility')}
                            className="text-xs font-bold text-emerald-700 underline"
                          >
                            Run Automated Compute Engine to generate this month's register
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    incentives.map((item) => (
                      <tr
                        key={item.id}
                        className={`transition-colors hover:bg-slate-50/70 ${
                          selectedIds.has(item.id) ? 'bg-emerald-50/40' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelectOne(item.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {item.first_name} {item.last_name}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {item.child_unique_id} · {item.gender}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800 truncate max-w-[180px]">
                            {item.school_name || 'Enrolled School'}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {item.community_name || item.ward_name || 'Ahoto Ward'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">
                            {item.recipient_name || 'Primary Guardian'}
                          </div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {item.recipient_phone || item.household_code || '—'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                              Number(item.attendance_rate) >= 80
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {Number(item.attendance_rate).toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {formatNaira(item.amount)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.eligibility_status === 'eligible'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {item.eligibility_status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              item.payment_status === 'disbursed'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : item.payment_status === 'approved'
                                ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                : item.payment_status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {item.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-mono text-[10px] font-semibold text-slate-700 capitalize">
                            {item.payment_method.replace('_', ' ')}
                          </div>
                          {item.disbursement_reference && (
                            <div className="font-mono text-[9px] text-emerald-700 truncate max-w-[120px]">
                              {item.disbursement_reference}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50 text-xs text-slate-500">
              <div>
                Showing <span className="font-bold text-slate-700">{incentives.length}</span> of{' '}
                <span className="font-bold text-slate-700">{totalRecords}</span> entries
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="font-mono font-bold text-slate-700">Page {page}</span>
                <button
                  disabled={page * limit >= totalRecords}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATED ELIGIBILITY ENGINE */}
      {activeTab === 'eligibility' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Card */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calculator size={18} className="text-emerald-700" />
                Automated Attendance & Grant Eligibility Calculator
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Computes real-time student attendance percentages from daily QR code scans and enrollments,
                and generates eligible payroll records based on program rules.
              </p>
            </div>

            {/* Program Selection Cards */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block mb-2">
                Select Intervention Program Track
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROGRAM_TYPES.map((pt) => (
                  <div
                    key={pt.id}
                    onClick={() => {
                      setSelectedProgramType(pt.id);
                      setCustomAmount(pt.baseAmount);
                    }}
                    className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                      selectedProgramType === pt.id
                        ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                        : 'border-slate-200 bg-slate-50/30 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">{pt.label}</span>
                      <span className="font-mono font-black text-xs text-emerald-800">
                        {formatNaira(pt.baseAmount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{pt.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Threshold & Parameters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
              {/* Billing Month */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Evaluation Month</label>
                <input
                  type="date"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
                />
              </div>

              {/* Attendance Threshold Slider */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Attendance Threshold</label>
                  <span className="font-mono font-black text-xs text-emerald-700">{attendanceThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={attendanceThreshold}
                  onChange={(e) => setAttendanceThreshold(Number(e.target.value))}
                  className="w-full accent-emerald-700"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                  <span>50%</span>
                  <span>Default: 80%</span>
                  <span>95%</span>
                </div>
              </div>

              {/* Amount Per Beneficiary */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Grant Amount (NGN)</label>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono font-bold text-slate-800"
                />
              </div>
            </div>

            {/* Execute Button */}
            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={handleRunCompute}
                disabled={computing}
                className="action-press inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-2.5 text-xs font-bold shadow-md shadow-emerald-950/20 disabled:opacity-50"
              >
                <Sparkles size={16} />
                {computing ? 'Computing All Active Enrollments...' : 'Execute Eligibility Computation'}
              </button>
            </div>
          </div>

          {/* Guidelines & Compliance Card */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-6 shadow-sm space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert size={16} className="text-emerald-700" />
              Statutory Eligibility Safeguards
            </h4>

            <ul className="text-xs space-y-3 text-slate-600">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Strict Daily QR Attendance:</strong> Eligibility uses cryptographically verified QR scans recorded once per day per school session.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Deduplication Guard:</strong> Once a child is paid or approved for a month, re-computing preserves settled disbursement references.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                <span>
                  <strong>Direct Beneficiary Tie:</strong> Guardian BVN and phone numbers are reconciled directly against the Household Registry.
                </span>
              </li>
            </ul>

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                SUBEB Jigawa Protocol
              </p>
              <p className="text-xs text-emerald-800 mt-1">
                Field mobilizers in Ahoto Ward can print physical verification sheets to ensure 100% guardian receipt verification in the field.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BATCH APPROVALS & DISBURSEMENTS */}
      {activeTab === 'batch' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Batch Approval Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-emerald-700" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Programmatic Batch Approval</h3>
                <p className="text-xs text-slate-500">Authorize computed eligible records for financial release</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700 block">Approval Scope</label>
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setBatchActionType('selected')}
                  className={`cursor-pointer rounded-xl border p-3 text-xs ${
                    batchActionType === 'selected'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <p>Selected In Ledger</p>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">{selectedIds.size} records selected</p>
                </div>
                <div
                  onClick={() => setBatchActionType('all_eligible')}
                  className={`cursor-pointer rounded-xl border p-3 text-xs ${
                    batchActionType === 'all_eligible'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <p>All Eligible For Month</p>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">{kpis.totalEligible} total eligible</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={() => handleBatchApprove(true)}
                disabled={processingBatch}
                className="action-press flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white py-2.5 text-xs font-bold shadow disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
                Authorize & Approve Batch
              </button>
              <button
                onClick={() => handleBatchApprove(false)}
                disabled={processingBatch}
                className="action-press inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 py-2.5 px-4 text-xs font-bold disabled:opacity-50"
              >
                <XCircle size={15} />
                Reject Batch
              </button>
            </div>
          </div>

          {/* Batch Disbursement Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              <Wallet size={20} className="text-purple-700" />
              <div>
                <h3 className="text-base font-bold text-slate-900">Multi-Channel Batch Disbursement</h3>
                <p className="text-xs text-slate-500">Dispatch approved funds through commercial banking or field cash</p>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">Disbursement Channel</label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'bank_transfer', label: 'Commercial Bank (NIBSS)', icon: Building2 },
                  { id: 'mobile_money', label: 'Mobile Money (OPay)', icon: CreditCard },
                  { id: 'cash_agent', label: 'Village Cash Agent', icon: Banknote },
                  { id: 'voucher', label: 'Community Voucher Sheet', icon: QrCode },
                ].map((ch) => {
                  const Icon = ch.icon;
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setBatchMethod(ch.id)}
                      className={`cursor-pointer rounded-xl border p-2.5 flex items-center gap-2 text-xs transition-all ${
                        batchMethod === ch.id
                          ? 'border-purple-600 bg-purple-50 text-purple-900 font-bold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon size={16} className={batchMethod === ch.id ? 'text-purple-700' : 'text-slate-400'} />
                      <span>{ch.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Batch Reference */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Batch Payment Reference</label>
              <input
                type="text"
                value={batchReferenceInput}
                onChange={(e) => setBatchReferenceInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono text-slate-800"
              />
            </div>

            {/* Disburse Button */}
            <div className="pt-2">
              <button
                onClick={handleBatchDisburse}
                disabled={processingBatch || selectedIds.size === 0}
                className="action-press w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white py-2.5 text-xs font-bold shadow disabled:opacity-50"
              >
                <Banknote size={16} />
                Execute Disbursement For {selectedIds.size} Selected Records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRINTABLE COMMUNITY VOUCHERS */}
      {activeTab === 'vouchers' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Printer size={18} className="text-emerald-700" />
                Community Physical Cash Disbursement Vouchers
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Generates certified A4 landscape printable disbursement sheets for field mobilizers, village heads (Sarki),
                and SUBEB officers with guardian thumbprint verification boxes.
              </p>
            </div>

            <button
              onClick={handleGenerateVoucherManifest}
              disabled={loadingVoucher}
              className="action-press inline-flex items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-5 py-2.5 text-xs font-bold shadow-md shadow-emerald-950/20 disabled:opacity-50"
            >
              <Printer size={16} />
              {loadingVoucher ? 'Generating Manifest...' : 'Compile & Print Official A4 Voucher Sheet'}
            </button>
          </div>

          {/* Filtering for voucher generation */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Ward</label>
              <select
                value={selectedWard}
                onChange={(e) => {
                  setSelectedWard(e.target.value);
                  setSelectedCommunity('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">All Wards (Ahoto Ward)</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Community / Village</label>
              <select
                value={selectedCommunity}
                onChange={(e) => setSelectedCommunity(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="">All Communities</option>
                {filteredCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Billing Month</label>
              <input
                type="date"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase text-slate-600 block mb-1">Payment Status Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <option value="approved">Approved For Payout</option>
                <option value="disbursed">Already Disbursed</option>
                <option value="pending">Pending Approval</option>
                <option value="">All Records</option>
              </select>
            </div>
          </div>

          <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50/50">
            <ShieldCheck size={32} className="mx-auto mb-2 text-emerald-700" />
            <h4 className="text-sm font-bold text-slate-900">Ready for Field Distribution</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Click the button above to generate the SUBEB Jigawa official A4 printable voucher manifest.
              The sheet formats automatically into landscape mode for single-sheet field printing.
            </p>
          </div>
        </div>
      )}

      {/* Printable Voucher Modal */}
      <PrintableVoucherModal
        isOpen={voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        manifest={voucherManifest}
      />

      {/* Donor Ledger Modal */}
      <DonorLedgerModal
        isOpen={donorModalOpen}
        onClose={() => setDonorModalOpen(false)}
        incentives={donorLedgerRecords}
      />
    </div>
  );
}
export default Incentives;
