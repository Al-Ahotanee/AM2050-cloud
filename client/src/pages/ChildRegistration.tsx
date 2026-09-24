/* AM2050 — Field Ledger Modernism: a detailed registration form persists the complete child record before any enrollment, ID card, or QR attendance token is made available. */
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, Crosshair, ImagePlus, Save } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { apiClient } from "@/api/client";
import { createLocalChild } from "@/lib/fieldStore";
import { PassportCameraModal } from "@/components/shared/PassportCameraModal";
import { GpsCaptureControl } from "@/components/shared/GpsCaptureControl";
import { DuplicateMatch, DuplicateWarningModal } from "@/components/shared/DuplicateWarningModal";

type Household = {
  id: string;
  household_code: string;
  father_name: string | null;
  mother_name: string | null;
  phone_number: string | null;
};

type Geo = {
  id: string;
  name: string;
  ward_id?: string;
  ward_name?: string;
};

type Tsangaya = {
  id: string;
  tsangaya_name: string;
  ward_id: string;
  community_id: string;
};

type Form = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  estimatedAge: string;
  gender: string;
  householdId: string;
  guardianName: string;
  guardianPhone: string;
  wardId: string;
  communityId: string;
  tsangayaId: string;
  disabilityStatus: string;
  isAlmajiri: boolean;
  educationStatus: string;
  attendanceBarrier: string;
  healthNote: string;
  gps: string;
  photoUrl: string;
  remarks: string;
};

const blank = (): Form => ({
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  estimatedAge: "",
  gender: "",
  householdId: "",
  guardianName: "",
  guardianPhone: "",
  wardId: "",
  communityId: "",
  tsangayaId: "",
  disabilityStatus: "none",
  isAlmajiri: false,
  educationStatus: "not_enrolled",
  attendanceBarrier: "",
  healthNote: "",
  gps: "",
  photoUrl: "",
  remarks: "",
});

export default function ChildRegistration() {
  const [form, setForm] = useState<Form>(blank);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [wards, setWards] = useState<Geo[]>([]);
  const [communities, setCommunities] = useState<Geo[]>([]);
  const [tsangaya, setTsangaya] = useState<Tsangaya[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiClient.request<Household[]>("/households?limit=500"),
      apiClient.request<Geo[]>("/wards?limit=500"),
      apiClient.request<Geo[]>("/communities?limit=500"),
      apiClient.request<Tsangaya[]>("/tsangaya-schools?limit=500"),
    ]).then(([householdRows, wardRows, communityRows, tsangayaRows]) => {
      if (householdRows.success) setHouseholds(householdRows.data);
      if (wardRows.success) setWards(wardRows.data);
      if (communityRows.success) setCommunities(communityRows.data);
      if (tsangayaRows.success) setTsangaya(tsangayaRows.data);
    });
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    if (key === "firstName" || key === "lastName") {
      setDuplicateConfirmed(false);
    }
    setForm((current) => ({ ...current, [key]: value }));
  };

  const chooseHousehold = (id: string) => {
    const household = households.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      householdId: id,
      guardianName: [household?.father_name, household?.mother_name].filter(Boolean).join(" / ") || current.guardianName,
      guardianPhone: household?.phone_number || current.guardianPhone,
      communityId: "",
      wardId: "",
    }));
  };

  const localCommunities = useMemo(
    () => communities.filter((item) => item.ward_id === form.wardId),
    [communities, form.wardId]
  );

  const localTsangaya = useMemo(
    () =>
      tsangaya.filter(
        (item) => item.ward_id === form.wardId && item.community_id === form.communityId
      ),
    [tsangaya, form.wardId, form.communityId]
  );

  const gps = () => {
    if (!navigator.geolocation) {
      toast.error("Location capture is unavailable on this device.");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        set("gps", `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`);
        setCapturing(false);
      },
      () => {
        setCapturing(false);
        toast.error("Location could not be captured. Check permission and try again.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const executeSave = async () => {
    setSaving(true);
    const body = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || undefined,
      estimatedAge: form.estimatedAge ? Number(form.estimatedAge) : undefined,
      householdId: form.isAlmajiri ? undefined : form.householdId,
      guardianPhone: form.guardianPhone.trim() || undefined,
      wardId: form.isAlmajiri ? form.wardId : undefined,
      communityId: form.isAlmajiri ? form.communityId : undefined,
      tsangayaId: form.isAlmajiri ? form.tsangayaId : undefined,
      disabilityStatus: form.disabilityStatus,
      almajiriStatus: form.isAlmajiri ? "almajiri" : "not_almajiri",
      childStatus: "active",
      photoUrl: form.photoUrl,
      registrationDetails: JSON.stringify({
        middleName: form.middleName,
        guardianName: form.guardianName,
        educationStatus: form.educationStatus,
        attendanceBarrier: form.attendanceBarrier,
        healthNote: form.healthNote,
        gps: form.gps,
        remarks: form.remarks,
        tsangayaName: tsangaya.find((item) => item.id === form.tsangayaId)?.tsangaya_name || "",
      }),
    };

    const response = await apiClient.request("/children", { method: "POST", body });
    setSaving(false);
    if (response.success) {
      setSaved(true);
      toast.success("Formal child record registered.");
      return;
    }
    if (!form.isAlmajiri && (!navigator.onLine || response.error.includes("Unable to reach"))) {
      createLocalChild({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        surname: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        householdId: form.householdId,
        guardianName: form.guardianName.trim(),
        guardianPhone: form.guardianPhone.trim(),
        community: "",
        disabilityStatus: form.disabilityStatus,
        isAlmajiri: false,
        gps: form.gps,
      });
      setSaved(true);
      toast.success("Record queued for secure sync when the device reconnects.");
      return;
    }
    toast.error(response.error);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const required = (
      form.isAlmajiri
        ? ["firstName", "lastName", "gender", "photoUrl", "wardId", "communityId", "tsangayaId"]
        : ["firstName", "lastName", "gender", "photoUrl", "householdId", "guardianPhone"]
    ) as (keyof Form)[];

    const next = Object.fromEntries(required.filter((key) => !form[key]).map((key) => [key, "Required"]));
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error("Complete every required field before saving.");
      return;
    }

    if (!duplicateConfirmed && navigator.onLine) {
      setSaving(true);
      try {
        const params = new URLSearchParams({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        });
        if (form.estimatedAge) params.set("estimatedAge", form.estimatedAge);
        if (form.wardId) params.set("wardId", form.wardId);

        const dupRes = await apiClient.request<{
          duplicate_found: boolean;
          risk_level: string;
          matches: DuplicateMatch[];
        }>(`/children/check-duplicate?${params.toString()}`);

        if (dupRes.success && dupRes.data.duplicate_found && dupRes.data.matches.length > 0) {
          setSaving(false);
          setDuplicateMatches(dupRes.data.matches);
          setDuplicateModalOpen(true);
          return;
        }
      } catch (err) {
        console.warn("Duplicate check error:", err);
      }
    }

    await executeSave();
  };

  if (saved) {
    return (
      <main className="paper-grain grid min-h-[calc(100vh-5.15rem)] place-items-center p-4">
        <section className="w-full max-w-xl border-t-4 border-[#167a4c] bg-white p-7 shadow-[0_14px_40px_rgba(18,49,72,.08)]">
          <CheckCircle2 className="text-[#167a4c]" size={32} />
          <p className="coordinate-label mt-5">Official child registration</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Record saved</h1>
          <p className="mt-2 text-[#57707f]">
            {form.firstName} {form.lastName} has been added to the Child Register. The formal registration form is
            available from the register. Student ID and QR are created only after enrollment.
          </p>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => {
                setForm(blank());
                setErrors({});
                setSaved(false);
              }}
              className="action-press rounded-md bg-[#167a4c] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Register another child
            </button>
            <Link
              href="/children"
              className="action-press rounded-md border border-[#b9c9c0] bg-white px-4 py-2.5 text-sm font-semibold text-[#234c64]"
            >
              Open Child Register
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="paper-grain min-h-[calc(100vh-5.15rem)]">
      <form onSubmit={submit} className="mx-auto max-w-5xl bg-[#fcfbf8] shadow-sm">
        <header className="border-b-4 border-[#167a4c] px-5 py-7 sm:px-9">
          <Link href="/children" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0e5a38]">
            <ArrowLeft size={16} />
            Child Register
          </Link>
          <div className="mt-5 flex justify-between gap-4">
            <div>
              <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-wider text-[#167a4c]">Official Registration Form</p>
              <h1 className="mt-1 font-display text-3xl font-semibold">Child registration</h1>
              <p className="mt-1 text-sm italic text-[#167a4c]">Every child counted. Every child learning.</p>
            </div>
            <p className="font-mono text-xs text-[#57707f]">
              DOCUMENT: REGISTRATION PENDING
              <br />
              DATE: {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
        </header>
        <div className="space-y-6 px-5 py-7 sm:px-9">
          <Section code="A" title="Child identity and photograph">
            <div className="flex flex-col gap-6 md:flex-row md:items-start">
              <div className="w-full sm:w-48 shrink-0 flex flex-col items-center">
                <div
                  onClick={() => setCameraOpen(true)}
                  className={`group relative flex aspect-[3/4] w-40 sm:w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition hover:border-[#167a4c] hover:bg-[#f0f6f2] ${
                    errors.photoUrl ? "border-[#ae3f32] bg-[#fdf4f4]" : "border-[#b9c9c0] bg-[#f8faf9]"
                  }`}
                >
                  {form.photoUrl ? (
                    <div className="relative h-full w-full">
                      <img src={form.photoUrl} alt="Child preview" className="h-full w-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-[#123148]/80 py-1.5 text-center text-[10px] font-medium text-white backdrop-blur-xs">
                        Change Photo
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center p-4 text-center">
                      <div className="grid size-12 place-items-center rounded-full bg-[#167a4c]/10 text-[#167a4c] transition group-hover:scale-105">
                        <Camera size={22} />
                      </div>
                      <span className="mt-3 text-xs font-semibold text-[#123148]">Student Photo</span>
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
                {errors.photoUrl && <span className="mt-1.5 text-center text-xs font-semibold text-[#ae3f32]">{errors.photoUrl}</span>}
              </div>

              <div className="flex-1 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="First name" required error={errors.firstName}>
                  <input
                    className="field-input"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                  />
                </Field>
                <Field label="Middle name">
                  <input
                    className="field-input"
                    value={form.middleName}
                    onChange={(e) => set("middleName", e.target.value)}
                  />
                </Field>
                <Field label="Surname" required error={errors.lastName}>
                  <input
                    className="field-input"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                  />
                </Field>
                <Field label="Date of birth">
                  <input
                    type="date"
                    className="field-input"
                    value={form.dateOfBirth}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                  />
                </Field>
                <Field label="Estimated age">
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={form.estimatedAge}
                    onChange={(e) => set("estimatedAge", e.target.value)}
                  />
                </Field>
                <Field label="Gender" required error={errors.gender}>
                  <select
                    className="field-input field-select"
                    value={form.gender}
                    onChange={(e) => set("gender", e.target.value)}
                  >
                    <option value="">Select gender</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </Field>
                <Field label="Disability / special need">
                  <select
                    className="field-input field-select"
                    value={form.disabilityStatus}
                    onChange={(e) => set("disabilityStatus", e.target.value)}
                  >
                    <option value="none">None reported</option>
                    <option value="physical">Physical / mobility</option>
                    <option value="visual">Visual</option>
                    <option value="hearing">Hearing</option>
                    <option value="cognitive">Learning / cognitive</option>
                  </select>
                </Field>
              </div>
            </div>
          </Section>

          <Section code="B" title="Care arrangement and location">
            <label className="flex items-center gap-3 border border-[#c7d2d6] bg-[#f7faf7] p-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.isAlmajiri}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    isAlmajiri: e.target.checked,
                    householdId: "",
                    wardId: "",
                    communityId: "",
                    tsangayaId: "",
                  }))
                }
              />
              This child is an Almajiri student mapped to a Tsangaya school
            </label>
            {form.isAlmajiri ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Ward" required error={errors.wardId}>
                  <select
                    className="field-input field-select"
                    value={form.wardId}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        wardId: e.target.value,
                        communityId: "",
                        tsangayaId: "",
                      }))
                    }
                  >
                    <option value="">Choose ward</option>
                    {wards.map((ward) => (
                      <option key={ward.id} value={ward.id}>
                        {ward.ward_name || ward.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Community" required error={errors.communityId}>
                  <select
                    disabled={!form.wardId}
                    className="field-input field-select"
                    value={form.communityId}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, communityId: e.target.value, tsangayaId: "" }))
                    }
                  >
                    <option value="">Choose community</option>
                    {localCommunities.map((community) => (
                      <option key={community.id} value={community.id}>
                        {community.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tsangaya school" required error={errors.tsangayaId}>
                  <select
                    disabled={!form.communityId}
                    className="field-input field-select"
                    value={form.tsangayaId}
                    onChange={(e) => set("tsangayaId", e.target.value)}
                  >
                    <option value="">Choose Tsangaya school</option>
                    {localTsangaya.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.tsangaya_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="self-end text-sm leading-6 text-[#57707f]">
                  Almajiri children are registered against their selected Tsangaya school only. No household is linked.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Linked household" required error={errors.householdId}>
                  <select
                    className="field-input field-select"
                    value={form.householdId}
                    onChange={(e) => chooseHousehold(e.target.value)}
                  >
                    <option value="">Select household</option>
                    {households.map((household) => (
                      <option key={household.id} value={household.id}>
                        {household.household_code} —{" "}
                        {[household.father_name, household.mother_name].filter(Boolean).join(" / ") ||
                          "Household contact"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Guardian / household lead">
                  <input
                    className="field-input"
                    value={form.guardianName}
                    onChange={(e) => set("guardianName", e.target.value)}
                  />
                </Field>
                <Field label="Guardian phone" required error={errors.guardianPhone}>
                  <input
                    inputMode="tel"
                    className="field-input"
                    value={form.guardianPhone}
                    onChange={(e) => set("guardianPhone", e.target.value)}
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section code="C" title="Education and wellbeing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Current education status">
                <select
                  className="field-input field-select"
                  value={form.educationStatus}
                  onChange={(e) => set("educationStatus", e.target.value)}
                >
                  <option value="not_enrolled">Not enrolled</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="out_of_school">Out of school</option>
                </select>
              </Field>
              <Field label="Primary barrier where applicable">
                <select
                  className="field-input field-select"
                  value={form.attendanceBarrier}
                  onChange={(e) => set("attendanceBarrier", e.target.value)}
                >
                  <option value="">Not recorded</option>
                  <option>Cost</option>
                  <option>Distance</option>
                  <option>Insecurity</option>
                  <option>Child labour</option>
                  <option>Disability</option>
                  <option>Other</option>
                </select>
              </Field>
              <Field label="Health or support note" wide>
                <textarea
                  className="field-input min-h-20"
                  value={form.healthNote}
                  onChange={(e) => set("healthNote", e.target.value)}
                />
              </Field>
              <Field label="Enumerator remarks" wide>
                <textarea
                  className="field-input min-h-20"
                  value={form.remarks}
                  onChange={(e) => set("remarks", e.target.value)}
                />
              </Field>
              <Field label="GPS coordinates (high-precision field lock)" wide>
                <GpsCaptureControl
                  value={form.gps}
                  onChange={(res) => set("gps", res.raw)}
                  wardName={wards.find((w) => w.id === form.wardId)?.name}
                />
              </Field>
            </div>
          </Section>

          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#cfd9d2] pt-5">
            <p className="text-xs text-[#617985]">Confidential — for authorised AM2050 programme use.</p>
            <button
              disabled={saving}
              className="action-press inline-flex items-center gap-2 rounded-md bg-[#167a4c] px-5 py-3 text-sm font-semibold text-white"
            >
              <Save size={17} />
              {saving ? "Saving…" : "Save official child record"}
            </button>
          </footer>
        </div>
      </form>

      {/* Verified 3:4 Passport Camera & Cropper Modal */}
      <PassportCameraModal
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => {
          set("photoUrl", dataUrl);
          setErrors((current) => ({ ...current, photoUrl: "" }));
          setCameraOpen(false);
        }}
        title="Child Biometric Passport Photograph"
        subtitle="Position the child within the oval guide. Ensures standard 3:4 aspect ratio for AM2050 student ID cards."
      />

      {/* Phonetic & Anti-Fraud Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        onProceed={() => {
          setDuplicateModalOpen(false);
          setDuplicateConfirmed(true);
          void executeSave();
        }}
        candidateName={`${form.firstName} ${form.lastName}`.trim()}
        matches={duplicateMatches}
      />
    </main>
  );
}

function Section({ code, title, children }: { code: string; title: string; children: ReactNode }) {
  return (
    <section className="border border-[#c7d2d6] bg-white">
      <header className="flex items-center gap-3 border-b border-[#c7d2d6] bg-[#eff5f1] px-4 py-3">
        <span className="grid size-7 place-items-center rounded-full bg-[#123148] font-display text-sm font-semibold text-white">
          {code}
        </span>
        <h2 className="font-display font-semibold text-[#123148]">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
  wide,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="mb-1 block text-sm font-semibold text-[#234c64]">
        {label}
        {required && <span className="ml-1 text-[#ae3f32]">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs font-semibold text-[#ae3f32]">{error}</span>}
    </label>
  );
}
