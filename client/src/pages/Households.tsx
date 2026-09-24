/* AM2050 — Field Ledger Modernism: household registration is a complete formal case record with live review and an A4-ready evidence document. */
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Camera, Eye, FileDown, FilePenLine, ImagePlus, Plus, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { LedgerColumn, LedgerTable } from "@/components/shared/LedgerTable";
import { apiClient } from "@/api/client";
import { PassportCameraModal } from "@/components/shared/PassportCameraModal";
import { GpsCaptureControl } from "@/components/shared/GpsCaptureControl";

type Geo={id:string;name:string;ward_id?:string};
type Record={id:string;household_code:string;father_name:string|null;mother_name:string|null;phone_number:string|null;photo_url:string|null;community_id:string|null;community_name:string|null;ward_id:string;ward_name:string;gps_lat:number|null;gps_lng:number|null;poverty_status:string|null;household_type:string|null;registration_details?:string|null};
type Row=Record&{localId:string};
type Details={address:string;occupation:string;consent:string;householdHead:string;relationship:string;maritalStatus:string;livelihood:string;incomeBand:string;householdSize:string;dependentChildren:string;dwellingType:string;waterSource:string;sanitation:string};
type Form={fatherName:string;motherName:string;phoneNumber:string;photoUrl:string;wardId:string;communityId:string;gpsLat:string;gpsLng:string;povertyStatus:string;householdType:string}&Details;
const blank=():Form=>({fatherName:"",motherName:"",phoneNumber:"",photoUrl:"",wardId:"",communityId:"",gpsLat:"",gpsLng:"",povertyStatus:"",householdType:"",address:"",occupation:"",consent:"yes",householdHead:"",relationship:"",maritalStatus:"",livelihood:"",incomeBand:"",householdSize:"",dependentChildren:"",dwellingType:"",waterSource:"",sanitation:""});
const details=(r:Record):Details=>{try{return{...blank(),...JSON.parse(r.registration_details||"{}")} as Details}catch{return blank()}};
const value=(text:string|number|null|undefined,fallback="Not recorded")=>String(text??"").trim()||fallback;

export default function Households() {
  const [tab, setTab] = useState<"form" | "register">("form");
  const [rows, setRows] = useState<Row[]>([]);
  const [wards, setWards] = useState<Geo[]>([]);
  const [communities, setCommunities] = useState<Geo[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [filterCommunity, setFilterCommunity] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = async (
    currentPage = page,
    currentLimit = pageSize,
    currentSearch = debouncedSearch,
    currentWard = filterWard,
    currentCommunity = filterCommunity
  ) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(currentPage),
      limit: String(currentLimit),
    });
    if (currentSearch.trim()) params.set("search", currentSearch.trim());
    if (currentWard) params.set("ward_id", currentWard);
    if (currentCommunity) params.set("community_id", currentCommunity);

    const [households, wardRows, communityRows] = await Promise.all([
      apiClient.request<Record[]>(`/households?${params.toString()}`),
      wards.length === 0 ? apiClient.request<Geo[]>("/wards?limit=250") : Promise.resolve(null),
      communities.length === 0 ? apiClient.request<Geo[]>("/communities?limit=500") : Promise.resolve(null),
    ]);

    if (households.success) {
      setRows(households.data.map((record) => ({ ...record, localId: record.id })));
      if (households.pagination) {
        setTotal(households.pagination.total);
      } else {
        setTotal(households.data.length);
      }
    }
    if (wardRows && wardRows.success) setWards(wardRows.data);
    if (communityRows && communityRows.success) setCommunities(communityRows.data);
    setLoading(false);
  };

  useEffect(() => {
    void load(page, pageSize, debouncedSearch, filterWard, filterCommunity);
  }, [page, pageSize, debouncedSearch, filterWard, filterCommunity]);

  const set = <K extends keyof Form>(key: K, input: Form[K]) =>
    setForm((current) => ({ ...current, [key]: input }));
  const selected = communities.filter((item) => item.ward_id === form.wardId);
  const registerCommunities = useMemo(
    () => communities.filter((item) => !filterWard || item.ward_id === filterWard),
    [communities, filterWard]
  );

  const create = () => {
    setEditing(null);
    setForm(blank());
    setTab("form");
  };

  const edit = (r: Row) => {
    setEditing(r);
    setForm({
      ...blank(),
      fatherName: r.father_name || "",
      motherName: r.mother_name || "",
      phoneNumber: r.phone_number || "",
      photoUrl: r.photo_url || "",
      wardId: r.ward_id,
      communityId: r.community_id || "",
      gpsLat: r.gps_lat?.toString() || "",
      gpsLng: r.gps_lng?.toString() || "",
      povertyStatus: r.poverty_status || "",
      householdType: r.household_type || "",
      ...details(r),
    });
    setTab("form");
  };

  const photo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/") || file.size > 700000) {
      toast.error("Use a clear image smaller than 700 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("photoUrl", String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.wardId || !form.communityId || !form.phoneNumber || (!form.fatherName && !form.motherName)) {
      toast.error("Complete the primary contact, phone, ward, and community.");
      return;
    }
    setSaving(true);
    const {
      fatherName,
      motherName,
      phoneNumber,
      photoUrl,
      wardId,
      communityId,
      gpsLat,
      gpsLng,
      povertyStatus,
      householdType,
      ...registrationDetails
    } = form;
    const body = {
      fatherName: fatherName || null,
      motherName: motherName || null,
      phoneNumber,
      photoUrl: photoUrl || null,
      wardId,
      communityId,
      gpsLat: gpsLat ? Number(gpsLat) : null,
      gpsLng: gpsLng ? Number(gpsLng) : null,
      povertyStatus: povertyStatus || null,
      householdType: householdType || null,
      registrationDetails: JSON.stringify(registrationDetails),
    };
    const response = editing
      ? await apiClient.request(`/households/${editing.id}`, { method: "PUT", body })
      : await apiClient.request("/households", { method: "POST", body });
    setSaving(false);
    if (!response.success) {
      toast.error(response.error);
      return;
    }
    toast.success(editing ? "Household record updated." : "Household registered.");
    create();
    setTab("register");
    void load();
  };

  const print = (r: Row) => {
    const source = document.getElementById("household-print");
    if (!source) {
      toast.error("Open the household record before printing.");
      return;
    }
    const page = window.open("", "_blank", "width=900,height=1120");
    if (!page) {
      toast.error("Allow pop-ups to print this household record.");
      return;
    }
    page.document.write(`<!doctype html><html><head><title>AM2050 Household Record</title><style>@page{size:A4;margin:11mm}*{box-sizing:border-box}body{margin:0;color:#123148;font-family:Arial,sans-serif}.print-record{border:2px solid #123148;min-height:273mm}.record-header{display:grid;grid-template-columns:1fr 32mm;gap:12px;padding:14px 16px;border-bottom:5px solid #167a4c}.record-brand{font-size:25px;font-weight:800;letter-spacing:2px}.record-strap{font-size:9px;color:#167a4c;font-weight:700;letter-spacing:.6px}.record-title{font-size:18px;margin:11px 0 4px}.record-photo{width:28mm;height:33mm;object-fit:cover;border:1px solid #718592}.record-block{margin:12px 16px;border:1px solid #aebdc2}.record-section{padding:7px 10px;background:#e7f4eb;border-bottom:1px solid #aebdc2;font-size:10px;font-weight:800;text-transform:uppercase}.record-grid{display:grid;grid-template-columns:1fr 1fr}.record-cell{min-height:48px;padding:8px 10px;border-bottom:1px solid #d4dfd8}.record-cell:nth-child(odd){border-right:1px solid #d4dfd8}.record-label{font-size:7px;color:#617985;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.record-value{font-size:11px;font-weight:700;margin-top:4px;line-height:1.35}.record-note{margin:0 16px;padding:10px;border-left:3px solid #c88b25;background:#fbf2df;font-size:9px;line-height:1.45}.record-signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:32px 16px 18px}.record-signature{padding-top:7px;border-top:1px solid #123148;font-size:8px}.record-footer{padding:10px 16px;border-top:1px solid #d4dfd8;font-size:8px;color:#617985}</style></head><body>${source.outerHTML}<script>window.print()</script></body></html>`);
    page.document.close();
  };

  const cols: LedgerColumn<Row>[] = [
    {
      key: "household",
      label: "Household",
      cell: (r) => (
        <div className="flex gap-2">
          <Photo record={r} small />
          <div>
            <b>{r.household_code}</b>
            <p>{[r.father_name, r.mother_name].filter(Boolean).join(" / ") || "Contact not recorded"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "area",
      label: "Community / ward",
      cell: (r) => (
        <span>
          {r.community_name || "—"}
          <br />
          {r.ward_name}
        </span>
      ),
    },
    {
      key: "action",
      label: "Action",
      cell: (r) => (
        <div className="flex gap-1">
          <IconButton label="View household record" onClick={() => setPreview(r)}>
            <Eye size={15} />
          </IconButton>
          <IconButton label="Edit household record" onClick={() => edit(r)}>
            <FilePenLine size={15} />
          </IconButton>
          <IconButton label="Print or save household record as PDF" onClick={() => print(r)}>
            <FileDown size={15} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)] p-6">
      <section className="mx-auto max-w-6xl">
        <header className="flex justify-between border-b pb-5">
          <div>
            <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-[#167a4c]">Community Records</p>
            <h1 className="font-display text-3xl font-semibold">Household register</h1>
          </div>
          <button onClick={create} className="action-press rounded bg-[#167a4c] px-4 py-2 text-white">
            <Plus size={16} className="inline" /> New household
          </button>
        </header>
        <div className="mt-4 flex gap-5 border-b">
          <Tab active={tab === "form"} onClick={() => setTab("form")}>
            Registration form
          </Tab>
          <Tab active={tab === "register"} onClick={() => setTab("register")}>
            Household register
          </Tab>
        </div>
        {tab === "form" ? (
          <form onSubmit={save} className="mt-5 border-t-4 border-[#167a4c] bg-white p-6">
            <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-[#167a4c]">Formal Household Record</p>
            <h2 className="font-display text-xl">{editing ? "Edit household registration" : "Household registration form"}</h2>
            <p className="mt-1 text-sm text-[#57707f]">Complete this record before registering linked children.</p>
            <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-start">
              <div className="w-full sm:w-48 shrink-0 flex flex-col items-center">
                <div
                  onClick={() => setCameraOpen(true)}
                  className="group relative flex aspect-[3/4] w-40 sm:w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-[#b9c9c0] bg-[#f8faf9] transition hover:border-[#167a4c] hover:bg-[#f0f6f2]"
                >
                  {form.photoUrl ? (
                    <div className="relative h-full w-full">
                      <img
                        src={form.photoUrl}
                        alt="Household representative"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-[#123148]/80 py-1.5 text-center text-[10px] font-medium text-white backdrop-blur-xs">
                        Change Photo
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center p-4 text-center">
                      <div className="grid size-12 place-items-center rounded-full bg-[#167a4c]/10 text-[#167a4c] transition group-hover:scale-105">
                        <Camera size={22} />
                      </div>
                      <span className="mt-3 text-xs font-semibold text-[#123148]">Representative Photo</span>
                      <span className="mt-1 text-[11px] text-[#57707f]">Take photo or upload</span>
                    </div>
                  )}
                </div>
                {form.photoUrl && (
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="mt-2 text-xs font-semibold text-[#0e5a38] hover:underline"
                  >
                    Change / Retake Photo
                  </button>
                )}
              </div>
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <Field label="Father / primary contact">
                  <input className="field-input" value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} />
                </Field>
                <Field label="Mother / secondary contact">
                  <input className="field-input" value={form.motherName} onChange={(e) => set("motherName", e.target.value)} />
                </Field>
                <Field label="Household head">
                  <input className="field-input" value={form.householdHead} onChange={(e) => set("householdHead", e.target.value)} />
                </Field>
                <Field label="Primary phone">
                  <input required className="field-input" value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} />
                </Field>
                <Field label="Relationship to household">
                  <input className="field-input" value={form.relationship} onChange={(e) => set("relationship", e.target.value)} />
                </Field>
                <Field label="Marital / care arrangement">
                  <input className="field-input" value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} />
                </Field>
              </div>
            </div>
            <FormBlock title="Location and dwelling">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Ward">
                  <select
                    required
                    className="field-input field-select"
                    value={form.wardId}
                    onChange={(e) => {
                      set("wardId", e.target.value);
                      set("communityId", "");
                    }}
                  >
                    <option value="">Choose ward</option>
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Community">
                  <select
                    required
                    className="field-input field-select"
                    value={form.communityId}
                    onChange={(e) => set("communityId", e.target.value)}
                  >
                    <option value="">Choose community</option>
                    {selected.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Address / landmark">
                  <input className="field-input" value={form.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field label="Dwelling type">
                  <input className="field-input" value={form.dwellingType} onChange={(e) => set("dwellingType", e.target.value)} />
                </Field>
                <Field label="Water source">
                  <input className="field-input" value={form.waterSource} onChange={(e) => set("waterSource", e.target.value)} />
                </Field>
                <Field label="Sanitation arrangement">
                  <input className="field-input" value={form.sanitation} onChange={(e) => set("sanitation", e.target.value)} />
                </Field>
                <div className="sm:col-span-3">
                  <Field label="GPS Geolocation (High-Precision Field Lock)">
                    <GpsCaptureControl
                      value={form.gpsLat && form.gpsLng ? `${form.gpsLat}, ${form.gpsLng}` : ""}
                      onChange={(res) => {
                        set("gpsLat", res.lat.toFixed(6));
                        set("gpsLng", res.lng.toFixed(6));
                      }}
                      wardName={wards.find((w) => w.id === form.wardId)?.name}
                    />
                  </Field>
                </div>
              </div>
            </FormBlock>
            <FormBlock title="Composition, livelihood, and consent">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Household type">
                  <input className="field-input" value={form.householdType} onChange={(e) => set("householdType", e.target.value)} />
                </Field>
                <Field label="Household size">
                  <input
                    type="number"
                    min="1"
                    className="field-input"
                    value={form.householdSize}
                    onChange={(e) => set("householdSize", e.target.value)}
                  />
                </Field>
                <Field label="Dependent children">
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={form.dependentChildren}
                    onChange={(e) => set("dependentChildren", e.target.value)}
                  />
                </Field>
                <Field label="Occupation">
                  <input className="field-input" value={form.occupation} onChange={(e) => set("occupation", e.target.value)} />
                </Field>
                <Field label="Primary livelihood">
                  <input className="field-input" value={form.livelihood} onChange={(e) => set("livelihood", e.target.value)} />
                </Field>
                <Field label="Income band">
                  <input className="field-input" value={form.incomeBand} onChange={(e) => set("incomeBand", e.target.value)} />
                </Field>
                <Field label="Poverty assessment">
                  <select
                    className="field-input field-select"
                    value={form.povertyStatus}
                    onChange={(e) => set("povertyStatus", e.target.value)}
                  >
                    <option value="">Not assessed</option>
                    <option value="extreme_poor">Extreme poverty</option>
                    <option value="poor">Poor</option>
                    <option value="moderate">Moderate</option>
                    <option value="not_poor">Not poor</option>
                  </select>
                </Field>
                <Field label="Registration consent">
                  <select className="field-input field-select" value={form.consent} onChange={(e) => set("consent", e.target.value)}>
                    <option value="yes">Confirmed</option>
                    <option value="no">Not confirmed</option>
                  </select>
                </Field>
              </div>
            </FormBlock>
            <button disabled={saving} className="action-press mt-6 rounded bg-[#167a4c] px-5 py-2 text-white">
              {saving ? "Saving…" : "Save household record"}
            </button>
          </form>
        ) : (
          <section className="mt-5">
            <div className="grid gap-2 md:grid-cols-[minmax(16rem,1fr)_minmax(12rem,.6fr)_minmax(12rem,.6fr)_auto]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#718592]" />
                <input
                  className="field-input pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search household"
                />
              </div>
              <select
                className="field-input field-select"
                value={filterWard}
                onChange={(e) => {
                  setFilterWard(e.target.value);
                  setFilterCommunity("");
                }}
              >
                <option value="">All wards</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select
                className="field-input field-select"
                value={filterCommunity}
                onChange={(e) => setFilterCommunity(e.target.value)}
              >
                <option value="">All communities</option>
                {registerCommunities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                aria-label="Refresh household register"
                onClick={() => void load()}
                className="action-press rounded border px-3"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-4">
              <LedgerTable
                rows={rows}
                columns={cols}
                emptyMessage={loading ? "Loading household records…" : "No household matches the selected filters."}
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
          </section>
        )}
        {preview && <Preview record={preview} close={() => setPreview(null)} print={() => print(preview)} />}
      </section>
      <PassportCameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          set("photoUrl", dataUrl);
          setCameraOpen(false);
        }}
        title="Household Representative Photograph"
        subtitle="Align the caregiver or household head within the oval. Standard 3:4 aspect ratio with automatic compression."
      />
    </main>
  );
}

function Preview({record,close,print}:{record:Row;close:()=>void;print:()=>void}){const d=details(record);const cell=(name:string,input:string|number|null|undefined)=><Cell label={name}>{value(input)}</Cell>;return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#082236]/55 p-4"><div className="mx-auto my-5 w-full max-w-4xl bg-white shadow-2xl"><div id="household-print" className="print-record"><header className="record-header"><div><p className="record-brand">AM2050</p><p className="record-strap">AREWA MISSION 2050 · HOUSEHOLD AND COMMUNITY REGISTRY</p><h2 className="record-title">Formal household registration record</h2><p className="font-mono text-xs text-[#57707f]">HOUSEHOLD REFERENCE: {record.household_code}</p></div><div className="flex justify-between"><Photo record={record}/><button aria-label="Close household preview" className="no-print self-start" onClick={close}><X/></button></div></header><Block title="1. Household identity and responsible adults"><Grid>{cell("Household head",d.householdHead||record.father_name||record.mother_name)}{cell("Household reference",record.household_code)}{cell("Primary contact",record.father_name)}{cell("Secondary contact",record.mother_name)}{cell("Primary phone",record.phone_number)}{cell("Relationship to household",d.relationship)}{cell("Marital / care arrangement",d.maritalStatus)}{cell("Household type",record.household_type)}</Grid></Block><Block title="2. Location and dwelling"><Grid>{cell("Ward",record.ward_name)}{cell("Community",record.community_name)}{cell("Address / landmark",d.address)}{cell("GPS coordinates",record.gps_lat!=null&&record.gps_lng!=null?`${record.gps_lat}, ${record.gps_lng}`:null)}{cell("Dwelling type",d.dwellingType)}{cell("Water source",d.waterSource)}{cell("Sanitation arrangement",d.sanitation)}</Grid></Block><Block title="3. Household composition and livelihood"><Grid>{cell("Household size",d.householdSize)}{cell("Dependent children",d.dependentChildren)}{cell("Occupation",d.occupation)}{cell("Primary livelihood",d.livelihood)}{cell("Income band",d.incomeBand)}{cell("Poverty assessment",record.poverty_status||"Not assessed")}</Grid></Block><Block title="4. Consent and verification"><Grid>{cell("Consent to AM2050 registration",d.consent==="yes"?"Confirmed":d.consent==="no"?"Not confirmed":d.consent)}{cell("Record status","Household record filed")}</Grid></Block><p className="record-note">This confidential record supports AM2050 child identification, education-access planning, verified follow-up, and programme reporting only.</p><div className="record-signatures"><Signature>Household representative signature / date</Signature><Signature>Enumerator signature / date</Signature><Signature>AM2050 verification / date</Signature></div><footer className="record-footer">AM2050 · AREWA MISSION 2050 · CONFIDENTIAL HOUSEHOLD RECORD · {record.household_code}</footer></div><footer className="no-print flex justify-end border-x border-b border-[#123148] bg-white p-4"><button onClick={print} className="action-press inline-flex gap-2 rounded bg-[#167a4c] px-4 py-2 text-white"><FileDown size={16}/>Print / save PDF</button></footer></div></div>}
function Photo({record,small=false}:{record:Row;small?:boolean}){return record.photo_url?<img src={record.photo_url} alt="Household representative" className={small?"size-9 object-cover":"record-photo"}/>:<div className={small?"grid size-9 place-items-center border border-dashed text-[.45rem]":"record-photo grid place-items-center border border-dashed text-center text-[.6rem] text-[#718592]"}>HOUSEHOLD<br/>PHOTO</div>}
function Grid({children}:{children:ReactNode}){return <div className="record-grid">{children}</div>};function Block({title,children}:{title:string;children:ReactNode}){return <section className="record-block"><h3 className="record-section">{title}</h3>{children}</section>};function Cell({label,children}:{label:string;children:ReactNode}){return <div className="record-cell"><p className="record-label">{label}</p><p className="record-value">{children}</p></div>};function Signature({children}:{children:ReactNode}){return <div className="record-signature">{children}</div>};function Field({label,children}:{label:string;children:ReactNode}){return <label><span className="mb-1 block text-sm font-semibold">{label}</span>{children}</label>};function FormBlock({title,children}:{title:string;children:ReactNode}){return <section className="mt-5 border border-[#c7d2d6] bg-[#fbfdfb]"><h3 className="border-b border-[#c7d2d6] bg-[#eff5f1] px-4 py-2 font-display text-sm font-semibold">{title}</h3><div className="p-4">{children}</div></section>};function Tab({active,onClick,children}:{active:boolean;onClick:()=>void;children:ReactNode}){return <button onClick={onClick} className={active?"border-b-2 border-[#167a4c] pb-3 font-semibold":"pb-3"}>{children}</button>};function IconButton({label,onClick,children}:{label:string;onClick:()=>void;children:ReactNode}){return <button type="button" aria-label={label} title={label} onClick={onClick} className="action-press grid size-8 place-items-center rounded border border-[#b9c9c0] bg-white text-[#234c64]">{children}</button>}
