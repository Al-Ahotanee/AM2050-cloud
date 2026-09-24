/* AM2050 — Field Ledger Modernism: the Child Register is the authoritative formal registration record; student identity and QR records belong only to approved enrollment. */
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { CreditCard, Eye, FileDown, Link2, Plus, Printer, RefreshCw, Search, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { LedgerColumn, LedgerTable } from "@/components/shared/LedgerTable";
import { useAuth } from "@/contexts/AuthContext";
import { StudentIdCardModal } from "@/components/school/StudentIdCardModal";
import { BatchStudentIdCardModal } from "@/components/school/BatchStudentIdCardModal";
type Child={id:string;child_unique_id:string;first_name:string;last_name:string;gender:string;date_of_birth?:string|null;estimated_age?:number|null;disability_status?:string|null;almajiri_status?:string|null;registration_details?:string|null;photo_url:string|null;guardian_phone:string|null;household_code:string|null;household_phone?:string|null;father_name:string|null;mother_name:string|null;ward_name?:string|null;community_name?:string|null};
type Details={middleName?:string;guardianName?:string;educationStatus?:string;attendanceBarrier?:string;healthNote?:string;gps?:string;remarks?:string;tsangayaName?:string};
const guardianConfirmRoles=new Set(["super_admin","program_admin","lga_supervisor","ward_supervisor","mobilizer"]);
const parse=(child:Child):Details=>{try{return JSON.parse(child.registration_details||"{}") as Details}catch{return{}}};
const value=(input:string|number|null|undefined,fallback="Not recorded")=>String(input??"").trim()||fallback;
export default function Children() {
  const { user } = useAuth();
  const schoolRole = user?.role === "headmaster" || user?.role === "teacher";
  const [rows, setRows] = useState<Child[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Child | null>(null);
  const [cardChild, setCardChild] = useState<Child | null>(null);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [linking, setLinking] = useState<Child | null>(null);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = async (currentPage = page, currentLimit = pageSize, currentSearch = debouncedSearch) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(currentLimit),
    });
    if (currentSearch.trim()) params.set("search", currentSearch.trim());
    const response = await apiClient.request<Child[]>(`/children?${params.toString()}`);
    if (response.success) {
      setRows(response.data);
      if (response.pagination) {
        setTotal(response.pagination.total);
      } else {
        setTotal(response.data.length);
      }
    } else {
      toast.error(response.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load(page, pageSize, debouncedSearch);
  }, [page, pageSize, debouncedSearch]);

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (!linking) return;
    setSaving(true);
    const response = await apiClient.request(`/children/${linking.id}/guardian-link`, {
      method: "PUT",
      body: { guardianPhone: phone.replace(/\s+/g, "") },
    });
    setSaving(false);
    if (!response.success) {
      toast.error(response.error);
      return;
    }
    toast.success("Guardian link confirmed.");
    setLinking(null);
    await load();
  };

  const cols: LedgerColumn<Child & { localId: string }>[] = [
    {
      key: "child",
      label: "Child",
      cell: (r) => (
        <div className="flex items-center gap-2">
          {r.photo_url ? (
            <img src={r.photo_url} alt="Child" className="size-9 rounded-sm object-cover" />
          ) : (
            <span className="grid size-9 place-items-center border border-dashed border-[#aab9b5] text-[.55rem] text-[#718592]">
              PHOTO
            </span>
          )}
          <div>
            <p className="font-semibold text-[#234c64]">
              {r.first_name} {r.last_name}
            </p>
            <p className="font-mono text-[.62rem] text-[#718592]">{r.child_unique_id}</p>
          </div>
        </div>
      ),
    },
    {
      key: "household",
      label: "Household",
      cell: (r) => (
        <div className="text-sm text-[#38566a]">
          {r.household_code || "Not recorded"}
          <br />
          <small className="text-[#718592]">
            {r.ward_name || "Ward not recorded"}
            {r.community_name ? ` · ${r.community_name}` : ""}
          </small>
        </div>
      ),
    },
    {
      key: "status",
      label: "Registration status",
      cell: (r) => (
        <span className="text-sm text-[#38566a]">
          {r.almajiri_status === "almajiri" ? "Almajiri / Tsangaya record" : "Household-linked record"}
        </span>
      ),
    },
    {
      key: "action",
      label: "Action",
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="View child registration form" onClick={() => setPreview(r)}>
            <Eye size={16} />
          </IconButton>
          <IconButton label="Print Student ID Card" onClick={() => setCardChild(r)}>
            <CreditCard size={16} />
          </IconButton>
          {!schoolRole && user && guardianConfirmRoles.has(user.role) && (
            <button
              onClick={() => {
                setLinking(r);
                setPhone(r.guardian_phone || "");
              }}
              className="text-sm font-semibold text-[#38566a] hover:underline"
            >
              Confirm guardian
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1440px]">
        <header className="flex flex-col justify-between gap-4 border-b border-[#cfd9d2] pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-[#167a4c]">Child Registry</p>
            <h1 className="mt-1 font-display text-3xl font-semibold">Child Directory</h1>
            <p className="mt-2 text-[#57707f]">
              Register children, review formal registration records, and confirm guardian links. Student ID cards and QR
              tokens are available after enrollment.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => void load()}
              className="action-press inline-flex h-10 items-center gap-2 rounded-md border border-[#b9c9c0] bg-white px-4 text-sm font-semibold text-[#234c64] shadow-sm whitespace-nowrap hover:bg-[#eff5f1]"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => setBatchPrintOpen(true)}
              className="action-press inline-flex h-10 items-center gap-2 rounded-md border border-[#167a4c] bg-[#e7f4eb] px-4 text-sm font-semibold text-[#0e5a38] shadow-sm whitespace-nowrap hover:bg-[#d8eedf]"
            >
              <Printer size={16} />
              <span>Print Batch (A4)</span>
            </button>
            {!schoolRole && (
              <Link
                href="/children/new"
                className="action-press inline-flex h-10 items-center gap-2 rounded-md bg-[#167a4c] px-4 text-sm font-semibold text-white shadow-sm whitespace-nowrap hover:bg-[#12643e]"
              >
                <Plus size={17} />
                <span>Register child</span>
              </Link>
            )}
          </div>
        </header>
        <div className="mt-5 relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718592]" size={16} />
          <input
            className="field-input !h-10 pl-10 rounded-md"
            placeholder="Search child name, registration ID, guardian or household"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <LedgerTable
            rows={rows.map((r) => ({ ...r, localId: r.id }))}
            columns={cols}
            emptyMessage={loading ? "Loading child records…" : "No child record matches this search."}
            serverPagination={{
              page,
              pageSize,
              total,
              onPageChange: setPage,
              onPageSizeChange: (s) => {
                setPageSize(s);
                setPage(1);
              },
            }}
          />
        </div>
        {preview && <ChildRegistrationPreview child={preview} close={() => setPreview(null)} />}
        <StudentIdCardModal
          isOpen={!!cardChild}
          onClose={() => setCardChild(null)}
          student={
            cardChild
              ? {
                  id: cardChild.id,
                  childCode: cardChild.child_unique_id,
                  firstName: cardChild.first_name,
                  middleName: parse(cardChild).middleName,
                  lastName: cardChild.last_name,
                  photoUrl: cardChild.photo_url,
                  gender: cardChild.gender,
                  dateOfBirth: cardChild.date_of_birth,
                  estimatedAge: cardChild.estimated_age,
                  wardName: cardChild.ward_name,
                  guardianPhone: cardChild.guardian_phone || cardChild.household_phone,
                  guardianName:
                    [cardChild.father_name, cardChild.mother_name].filter(Boolean).join(" / ") ||
                    parse(cardChild).guardianName,
                  schoolName: parse(cardChild).tsangayaName,
                }
              : null
          }
        />
        <BatchStudentIdCardModal
          isOpen={batchPrintOpen}
          onClose={() => setBatchPrintOpen(false)}
          students={rows.map((r) => ({
            id: r.id,
            childCode: r.child_unique_id,
            firstName: r.first_name,
            middleName: parse(r).middleName,
            lastName: r.last_name,
            photoUrl: r.photo_url,
            gender: r.gender,
            dateOfBirth: r.date_of_birth,
            estimatedAge: r.estimated_age,
            wardName: r.ward_name,
            schoolName: parse(r).tsangayaName,
            attendanceToken: r.child_unique_id,
          }))}
        />
        {linking && (
          <div className="fixed inset-0 z-50 grid overflow-y-auto bg-[#082236]/45 p-4 sm:place-items-center">
            <form onSubmit={confirm} className="my-4 w-full max-w-lg bg-[#fbfaf6] p-5 shadow-xl">
              <div className="flex justify-between">
                <div>
                  <p className="coordinate-label">Guardian confirmation</p>
                  <h2 className="font-display text-xl font-semibold">
                    {linking.first_name} {linking.last_name}
                  </h2>
                </div>
                <button type="button" onClick={() => setLinking(null)}>
                  <X />
                </button>
              </div>
              <label className="mt-5 block">
                <span className="mb-1 block text-sm font-semibold">Guardian phone</span>
                <input
                  required
                  className="field-input"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <button
                disabled={saving}
                className="action-press mt-5 inline-flex items-center gap-2 rounded-md bg-[#167a4c] px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Link2 size={16} />
                {saving ? "Confirming…" : "Confirm guardian link"}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
function ChildRegistrationPreview({child,close}:{child:Child;close:()=>void}){const d=parse(child);const print=()=>{const node=document.getElementById("child-registration-print");const page=window.open("","_blank","width=900,height=1120");if(!node||!page){toast.error("Allow pop-ups to print this registration form.");return}page.document.write(`<!doctype html><html><head><title>AM2050 Child Registration Form</title><style>@page{size:A4;margin:11mm}*{box-sizing:border-box}body{margin:0;font-family:Arial;color:#123148}.child-form{border:2px solid #123148;min-height:273mm}.child-head{display:grid;grid-template-columns:1fr 32mm;gap:12px;padding:14px 16px;border-bottom:5px solid #167a4c}.child-brand{font-size:25px;font-weight:800;letter-spacing:2px}.child-strap{font-size:9px;color:#167a4c;font-weight:700}.child-photo{width:28mm;height:33mm;object-fit:cover;border:1px solid #718592}.child-section{margin:12px 16px;border:1px solid #aebdc2}.child-section h3{margin:0;padding:7px 10px;border-bottom:1px solid #aebdc2;background:#e7f4eb;font-size:10px;text-transform:uppercase}.child-grid{display:grid;grid-template-columns:1fr 1fr}.child-cell{min-height:48px;padding:8px 10px;border-bottom:1px solid #d4dfd8}.child-cell:nth-child(odd){border-right:1px solid #d4dfd8}.child-label{font-size:7px;color:#617985;font-weight:700;text-transform:uppercase}.child-value{margin-top:4px;font-size:11px;font-weight:700;line-height:1.35}.child-note{margin:0 16px;padding:10px;border-left:3px solid #c88b25;background:#fbf2df;font-size:9px}.child-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:32px 16px 18px}.child-signature{padding-top:7px;border-top:1px solid #123148;font-size:8px}.child-footer{padding:10px 16px;border-top:1px solid #d4dfd8;font-size:8px;color:#617985}</style></head><body>${node.outerHTML}<script>window.print()</script></body></html>`);page.document.close()};const cell=(label:string,input:string|number|null|undefined)=><ChildCell label={label}>{value(input)}</ChildCell>;return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#082236]/55 p-4"><div className="mx-auto my-5 w-full max-w-4xl bg-white shadow-2xl"><div id="child-registration-print" className="child-form"><header className="child-head"><div><p className="child-brand">AM2050</p><p className="child-strap">AREWA MISSION 2050 · OFFICIAL CHILD REGISTRATION</p><h2 className="mt-4 font-display text-xl font-semibold">Formal child registration record</h2><p className="mt-1 font-mono text-xs text-[#57707f]">CHILD REGISTRATION ID: {child.child_unique_id}</p></div><div className="flex justify-between">{child.photo_url?<img className="child-photo" src={child.photo_url} alt="Child"/>:<div className="child-photo grid place-items-center border border-dashed text-center text-[.6rem] text-[#718592]">CHILD<br/>PHOTO</div>}<button aria-label="Close child registration preview" className="no-print self-start" onClick={close}><X/></button></div></header><ChildSection title="1. Child identity"><ChildGrid>{cell("Child name",[child.first_name,d.middleName,child.last_name].filter(Boolean).join(" "))}{cell("Registration ID",child.child_unique_id)}{cell("Gender",child.gender)}{cell("Date of birth",child.date_of_birth)}{cell("Estimated age",child.estimated_age)}{cell("Disability / special need",child.disability_status)}</ChildGrid></ChildSection><ChildSection title="2. Care arrangement and location"><ChildGrid>{cell("Registration pathway",child.almajiri_status==="almajiri"?"Almajiri / Tsangaya school":"Household-linked child")}{cell("Household reference",child.household_code)}{cell("Parents / household contacts",[child.father_name,child.mother_name].filter(Boolean).join(" / "))}{cell("Guardian contact",child.guardian_phone||child.household_phone)}{cell("Ward",child.ward_name)}{cell("Community",child.community_name)}{cell("Tsangaya school",d.tsangayaName)}{cell("GPS coordinates",d.gps)}</ChildGrid></ChildSection><ChildSection title="3. Education and wellbeing"><ChildGrid>{cell("Education status",d.educationStatus)}{cell("Primary barrier",d.attendanceBarrier)}{cell("Health or support note",d.healthNote)}{cell("Enumerator remarks",d.remarks)}</ChildGrid></ChildSection><p className="child-note">This is a confidential AM2050 child registration record. It confirms registry information only; student ID and attendance QR token are created from the confirmed school enrollment record.</p><div className="child-signatures"><div className="child-signature">Parent or guardian signature / date</div><div className="child-signature">Enumerator signature / date</div><div className="child-signature">AM2050 verification / date</div></div><footer className="child-footer">AM2050 · AREWA MISSION 2050 · CONFIDENTIAL CHILD REGISTRATION RECORD</footer></div><footer className="no-print flex justify-end border-x border-b border-[#123148] bg-white p-4"><button onClick={print} className="action-press inline-flex gap-2 rounded bg-[#167a4c] px-4 py-2 text-white"><FileDown size={16}/>Print / save PDF</button></footer></div></div>}
function ChildSection({title,children}:{title:string;children:ReactNode}){return <section className="child-section"><h3>{title}</h3>{children}</section>}function ChildGrid({children}:{children:ReactNode}){return <div className="child-grid">{children}</div>}function ChildCell({label,children}:{label:string;children:ReactNode}){return <div className="child-cell"><p className="child-label">{label}</p><p className="child-value">{children}</p></div>}function IconButton({label,onClick,children}:{label:string;onClick:()=>void;children:ReactNode}){return <button type="button" aria-label={label} title={label} onClick={onClick} className="action-press grid size-8 place-items-center rounded border border-[#b9c9c0] bg-white text-[#234c64]">{children}</button>}
