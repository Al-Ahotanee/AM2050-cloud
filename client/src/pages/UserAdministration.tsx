/* AM2050 — Field Ledger Modernism: User Management with Multi-Community Mobilizer Coverage & Scope Control. */
import { FormEvent, useEffect, useState } from "react";
import { Check, Edit2, MapPin, Plus, RefreshCw, Shield, UserCog, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { LedgerColumn, LedgerTable } from "@/components/shared/LedgerTable";
import { StatusBadge } from "@/components/shared/StatusBadge";

type User = {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string | null;
  assigned_scope_type: string | null;
  assigned_scope_id: string | null;
  assigned_communities?: { id: string; name: string; ward_id: string }[];
  is_active: number | boolean;
};

type Scope = {
  id: string;
  state_name?: string;
  lga_name?: string;
  ward_name?: string;
  school_name?: string;
  class_name?: string;
  name?: string;
};

type Community = {
  id: string;
  name: string;
  ward_id: string;
};

const roles = [
  "super_admin",
  "program_admin",
  "lga_supervisor",
  "ward_supervisor",
  "headmaster",
  "mobilizer",
  "almajiri_liaison",
  "guardian",
];

const resources: Record<string, string> = {
  state: "/states?limit=250",
  lga: "/lgas?limit=250",
  ward: "/wards?limit=250",
  school: "/schools?limit=250",
  class: "/classes?limit=250",
};

const scopeLabel = (s: Scope) =>
  s.state_name || s.lga_name || s.ward_name || s.school_name || s.class_name || s.name || s.id;

export default function UserAdministration() {
  const [users, setUsers] = useState<User[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [show, setShow] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    role: "ward_supervisor",
    phone: "",
    email: "",
    password: "",
    assignedScopeType: "ward",
    assignedScopeId: "",
    assignedCommunityIds: [] as string[],
    isActive: true,
  });

  const load = async () => {
    setLoading(true);
    const r = await apiClient.request<User[]>("/users?limit=250");
    if (r.success) {
      setUsers(r.data.filter((u) => u.role !== "teacher"));
    } else {
      toast.error(r.error);
    }
    setLoading(false);
  };

  const loadScopes = async (type: string) => {
    if (!type || !resources[type]) {
      setScopes([]);
      return;
    }
    const r = await apiClient.request<Scope[]>(resources[type]);
    if (r.success) setScopes(r.data);
  };

  const loadCommunitiesForWard = async (wardId: string) => {
    if (!wardId) {
      setCommunities([]);
      return;
    }
    const r = await apiClient.request<Community[]>(`/communities?ward_id=${wardId}&limit=250`);
    if (r.success) {
      setCommunities(r.data);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (form.role === "super_admin") {
      setScopes([]);
      return;
    }
    if (form.role === "mobilizer") {
      if (form.assignedScopeType !== "ward") {
        setForm((v) => ({ ...v, assignedScopeType: "ward", assignedScopeId: "" }));
      }
    }
    void loadScopes(form.assignedScopeType);
  }, [form.role, form.assignedScopeType]);

  useEffect(() => {
    if (form.role === "mobilizer" && form.assignedScopeId) {
      void loadCommunitiesForWard(form.assignedScopeId);
    } else {
      setCommunities([]);
    }
  }, [form.role, form.assignedScopeId]);

  const openCreateModal = () => {
    setEditingUserId(null);
    setForm({
      name: "",
      role: "ward_supervisor",
      phone: "",
      email: "",
      password: "",
      assignedScopeType: "ward",
      assignedScopeId: "",
      assignedCommunityIds: [],
      isActive: true,
    });
    setShow(true);
  };

  const openEditModal = (u: User) => {
    setEditingUserId(u.id);
    const commIds = u.assigned_communities ? u.assigned_communities.map((c) => c.id) : [];
    setForm({
      name: u.name,
      role: u.role,
      phone: u.phone,
      email: u.email || "",
      password: "",
      assignedScopeType: u.assigned_scope_type || "ward",
      assignedScopeId: u.assigned_scope_id || "",
      assignedCommunityIds: commIds,
      isActive: !!u.is_active,
    });
    setShow(true);
  };

  const toggleCommunity = (id: string) => {
    setForm((prev) => {
      const exists = prev.assignedCommunityIds.includes(id);
      if (exists) {
        return { ...prev, assignedCommunityIds: prev.assignedCommunityIds.filter((cid) => cid !== id) };
      }
      if (prev.assignedCommunityIds.length >= 5) {
        toast.warning("A mobilizer can be assigned to a maximum of 5 communities.");
        return prev;
      }
      return { ...prev, assignedCommunityIds: [...prev.assignedCommunityIds, id] };
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || (!editingUserId && !form.password)) {
      toast.error("Complete the user identity and password.");
      return;
    }
    if (form.role !== "super_admin" && !form.assignedScopeId) {
      toast.error("Assigned scope is required.");
      return;
    }
    if (form.role === "mobilizer") {
      if (form.assignedCommunityIds.length < 1 || form.assignedCommunityIds.length > 5) {
        toast.error("A mobilizer must be assigned to between 1 and 5 communities within their ward.");
        return;
      }
    }

    setSaving(true);
    const payload: any = {
      name: form.name,
      role: form.role,
      phone: form.phone,
      email: form.email || null,
      isActive: form.isActive,
      assignedScopeType: form.role === "super_admin" ? null : form.assignedScopeType,
      assignedScopeId: form.role === "super_admin" ? null : form.assignedScopeId,
    };
    if (form.password) {
      payload.password = form.password;
    }
    if (form.role === "mobilizer") {
      payload.assignedCommunityIds = form.assignedCommunityIds;
    }

    let r;
    if (editingUserId) {
      r = await apiClient.request(`/users/${editingUserId}`, {
        method: "PUT",
        body: payload,
      });
    } else {
      r = await apiClient.request("/users", {
        method: "POST",
        body: payload,
      });
    }
    setSaving(false);

    if (!r.success) {
      toast.error(r.error);
      return;
    }

    toast.success(editingUserId ? "User account updated." : "User account created.");
    setShow(false);
    await load();
  };

  const columns: LedgerColumn<User & { localId: string }>[] = [
    {
      key: "user",
      label: "User",
      cell: (r) => (
        <div>
          <p className="font-semibold text-[#234c64]">{r.name}</p>
          <p className="font-mono text-xs text-[#718592]">{r.phone}</p>
          {r.email && <p className="text-[11px] text-[#8ea4b3]">{r.email}</p>}
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      cell: (r) => (
        <span className="inline-flex items-center gap-1 rounded bg-[#e8f1ed] px-2 py-0.5 text-xs font-semibold capitalize text-[#167a4c]">
          <Shield size={12} />
          {r.role.replaceAll("_", " ")}
        </span>
      ),
    },
    {
      key: "scope",
      label: "Scope & Assigned Coverage",
      cell: (r) => {
        if (r.role === "super_admin") {
          return <span className="font-mono text-xs text-[#57707f]">All Wards / System Wide</span>;
        }
        if (r.role === "mobilizer") {
          const comms = r.assigned_communities || [];
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs font-medium text-[#234c64]">
                <MapPin size={12} className="text-[#167a4c]" />
                <span>Ward Scope: <strong className="font-mono">{r.assigned_scope_id?.slice(0, 8)}…</strong></span>
              </div>
              {comms.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {comms.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-0.5 rounded border border-[#b2d5c3] bg-[#edf8f1] px-1.5 py-0.5 text-[11px] font-medium text-[#167a4c]"
                    >
                      {c.name}
                    </span>
                  ))}
                  <span className="text-[10px] text-[#718592] self-center">({comms.length}/5 communities)</span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  ⚠️ No communities assigned (1 to 5 required)
                </span>
              )}
            </div>
          );
        }
        return (
          <div className="text-xs text-[#234c64]">
            <span className="capitalize font-medium">{r.assigned_scope_type || "System"}:</span>{" "}
            <span className="font-mono text-[#718592]">{r.assigned_scope_id || "Unscoped"}</span>
          </div>
        );
      },
    },
    {
      key: "state",
      label: "State",
      cell: (r) => (
        <StatusBadge label={r.is_active ? "Active" : "Inactive"} tone={r.is_active ? "success" : "attention"} />
      ),
    },
    {
      key: "actions",
      label: "Action",
      cell: (r) => (
        <button
          onClick={() => openEditModal(r)}
          className="action-press inline-flex items-center gap-1 rounded border border-[#cfd9d2] bg-white px-2.5 py-1 text-xs font-semibold text-[#234c64] hover:bg-[#f4f7f5]"
        >
          <Edit2 size={12} />
          Edit & Assign
        </button>
      ),
    },
  ];

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1440px]">
        <header className="flex flex-col justify-between gap-4 border-b border-[#cfd9d2] pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="coordinate-label">System Administration</p>
            <div className="mt-2 flex items-center gap-2">
              <UserCog className="text-[#167a4c]" />
              <h1 className="font-display text-3xl font-semibold">User & Mobilizer Management</h1>
            </div>
            <p className="mt-2 text-[#57707f]">
              Manage programme, supervision, mobilizer field coverage (1–5 communities), and guardian accounts.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => void load()}
              className="action-press inline-flex h-10 items-center gap-2 rounded-md border border-[#b9c9c0] bg-white px-4 text-sm font-semibold text-[#183a2d] shadow-sm hover:bg-[#f4f7f5] whitespace-nowrap shrink-0"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              onClick={openCreateModal}
              className="action-press inline-flex h-10 items-center gap-2 rounded-md bg-[#167a4c] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#12643e] whitespace-nowrap shrink-0"
            >
              <Plus size={16} />
              Add user
            </button>
          </div>
        </header>

        <section className="mt-5">
          <LedgerTable
            rows={users.map((u) => ({ ...u, localId: u.id }))}
            columns={columns}
            emptyMessage={loading ? "Loading user accounts…" : "No user accounts are recorded."}
          />
        </section>

        {show && (
          <div className="fixed inset-0 z-50 grid overflow-y-auto bg-[#082236]/45 p-4 sm:place-items-center">
            <form
              onSubmit={submit}
              className="my-4 w-full max-w-2xl border-t-4 border-[#167a4c] bg-[#fbfaf6] p-6 shadow-xl rounded-b-lg"
            >
              <div className="flex justify-between items-start border-b border-[#cfd9d2] pb-3">
                <div>
                  <p className="coordinate-label">
                    {editingUserId ? "Modify Account" : "New User Account"}
                  </p>
                  <h2 className="font-display text-xl font-semibold">
                    {editingUserId ? "Edit User & Coverage" : "Add System User"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShow(false)}
                  className="rounded p-1 hover:bg-[#e7eee9] text-[#57707f]"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-semibold text-[#234c64]">Full Name</span>
                  <input
                    required
                    className="field-input w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm"
                    value={form.name}
                    onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-semibold text-[#234c64]">Phone Number</span>
                  <input
                    required
                    placeholder="08012345678"
                    className="field-input w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm font-mono"
                    value={form.phone}
                    onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-semibold text-[#234c64]">Email (Optional)</span>
                  <input
                    type="email"
                    className="field-input w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm"
                    value={form.email}
                    onChange={(e) => setForm((v) => ({ ...v, email: e.target.value }))}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-semibold text-[#234c64]">
                    {editingUserId ? "New Password (Leave blank to keep current)" : "Temporary Password (min 14 chars)"}
                  </span>
                  <input
                    type="password"
                    minLength={editingUserId ? 0 : 14}
                    required={!editingUserId}
                    className="field-input w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm"
                    value={form.password}
                    onChange={(e) => setForm((v) => ({ ...v, password: e.target.value }))}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-semibold text-[#234c64]">System Role</span>
                  <select
                    className="field-input field-select w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm capitalize"
                    value={form.role}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        role: e.target.value,
                        assignedScopeType: e.target.value === "mobilizer" ? "ward" : v.assignedScopeType,
                        assignedScopeId: "",
                        assignedCommunityIds: [],
                      }))
                    }
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>

                {form.role !== "super_admin" && (
                  <label>
                    <span className="mb-1 block text-sm font-semibold text-[#234c64]">Scope Level</span>
                    <select
                      disabled={form.role === "mobilizer"}
                      className="field-input field-select w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm capitalize disabled:bg-[#f0f2f1]"
                      value={form.assignedScopeType}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, assignedScopeType: e.target.value, assignedScopeId: "", assignedCommunityIds: [] }))
                      }
                    >
                      {Object.keys(resources).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {form.role !== "super_admin" && (
                  <label className="sm:col-span-2">
                    <span className="mb-1 block text-sm font-semibold text-[#234c64]">
                      {form.role === "mobilizer" ? "Assigned Ward (Coverage Hub)" : "Assigned Scope Location"}
                    </span>
                    <select
                      required
                      className="field-input field-select w-full rounded border border-[#b9c9c0] bg-white px-3 py-2 text-sm"
                      value={form.assignedScopeId}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, assignedScopeId: e.target.value, assignedCommunityIds: [] }))
                      }
                    >
                      <option value="">Choose {form.assignedScopeType}…</option>
                      {scopes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {scopeLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {/* Mobilizer Multi-Community Assignment Selection (1 to 5 communities) */}
                {form.role === "mobilizer" && (
                  <div className="sm:col-span-2 rounded-lg border border-[#b9c9c0] bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#cfd9d2] pb-2">
                      <div className="flex items-center gap-1.5">
                        <Users size={16} className="text-[#167a4c]" />
                        <span className="font-semibold text-sm text-[#234c64]">
                          Mobilizer Assigned Communities
                        </span>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          form.assignedCommunityIds.length >= 1 && form.assignedCommunityIds.length <= 5
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {form.assignedCommunityIds.length} of 5 Selected (1 to 5 required)
                      </span>
                    </div>

                    {!form.assignedScopeId ? (
                      <p className="mt-3 text-xs text-[#718592] italic">
                        Select an assigned ward first to load the ward’s operational communities.
                      </p>
                    ) : communities.length === 0 ? (
                      <p className="mt-3 text-xs text-[#718592] italic">
                        No communities found for the selected ward.
                      </p>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {communities.map((c) => {
                          const isSelected = form.assignedCommunityIds.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleCommunity(c.id)}
                              className={`flex items-center justify-between rounded border px-3 py-2 text-left text-xs transition-colors ${
                                isSelected
                                  ? "border-[#167a4c] bg-[#e7f4eb] text-[#167a4c] font-semibold"
                                  : "border-[#cfd9d2] bg-[#fbfaf6] text-[#234c64] hover:bg-[#f0f4f2]"
                              }`}
                            >
                              <span className="truncate">{c.name}</span>
                              <div
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  isSelected
                                    ? "border-[#167a4c] bg-[#167a4c] text-white"
                                    : "border-[#9bb0a3] bg-white"
                                }`}
                              >
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2.5 border-t border-[#cfd9d2] pt-4">
                <button
                  type="button"
                  onClick={() => setShow(false)}
                  className="rounded-md border border-[#b9c9c0] bg-white px-4 py-2 text-sm font-semibold text-[#57707f] hover:bg-[#f4f7f5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="action-press rounded-md bg-[#167a4c] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#12643e] disabled:opacity-60"
                >
                  {saving ? "Saving…" : editingUserId ? "Update User & Scope" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}

