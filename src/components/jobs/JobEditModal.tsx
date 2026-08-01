import { useState } from "react";
import {
  updateJobFieldsWithAnswer,
  type EmploymentType,
  type JobCard,
} from "../../lib/firestore";
import { safeExternalUrl } from "../../lib/security";
import { deletionProtectionError } from "../../lib/deletionProtection";
import { showToast } from "../ui/Toast";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";

const ONLINE_VIA = ["Naukri.com", "LinkedIn", "Company Website", "Referral", "Others"];
const WALKIN_VIA = ["Job hai", "Brute force", "By friend"];
const EMPLOYMENT_OPTS: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time job" },
  { value: "part_time", label: "Part-time" },
  { value: "internship", label: "Internship" },
];
const PPO_OPTS = [
  { value: "", label: "Not sure" },
  { value: "yes", label: "Yes — PPO de rahe" },
  { value: "no", label: "No PPO" },
  { value: "maybe", label: "Maybe / based on performance" },
];
const INTERNSHIP_DURATION_OPTS = [
  { value: "not sure", label: "Not sure" },
  { value: "1", label: "1 month" },
  { value: "2", label: "2 months" },
  { value: "3", label: "3 months" },
  { value: "4", label: "4 months" },
  { value: "5", label: "5 months" },
  { value: "6", label: "6 months" },
  { value: "12", label: "12 months" },
];
const LAST_DATE_NA = "N/A";
const CTC_NA = "N/A";
const BOND_NA = "N/A";

function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const date = typeof value === "object" && value !== null && "toDate" in value
    ? (value as { toDate: () => Date }).toDate()
    : new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildForm(job: JobCard) {
  const last = toDateInputValue(job.lastDate);
  return {
    company: job.company || "",
    role: job.role || "",
    location: job.location || "",
    ctc: job.ctc || "",
    applyLink: job.applyLink || "",
    appliedVia: job.appliedVia || ((job.jobType ?? "online") === "walkin" ? "Job hai" : "LinkedIn"),
    appliedViaOther: job.appliedViaOther || "",
    batch: Array.isArray(job.batch) ? job.batch.join(", ") : "",
    bond: job.bond || "",
    lastDate: last || LAST_DATE_NA,
    mapLink: job.mapLink || "",
    nearestMetro: job.nearestMetro || "",
    employmentType: (job.employmentType || "full_time") as EmploymentType,
    internshipMonths: job.internshipMonths || "",
    ppo: job.ppo || "",
  };
}

interface Props {
  job: JobCard;
  onePasswordAnswer: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function JobEditModal({ job, onePasswordAnswer, onClose, onSaved }: Props) {
  const auth = useStore($auth);
  const isWalkin = (job.jobType ?? "online") === "walkin";
  const viaOpts = isWalkin ? WALKIN_VIA : ONLINE_VIA;
  const [form, setForm] = useState(() => buildForm(job));
  const [saving, setSaving] = useState(false);

  const set = (key: keyof ReturnType<typeof buildForm>, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.role.trim()) { showToast("Role required hai.", "error"); return; }
    if (form.employmentType === "internship" && !form.internshipMonths.trim()) {
      showToast("Internship duration select karo.", "error");
      return;
    }
    let applyLink = form.applyLink.trim();
    if (applyLink) {
      const safe = safeExternalUrl(applyLink);
      if (!safe) { showToast("Apply link valid https:// URL hona chahiye.", "error"); return; }
      applyLink = safe;
    }
    let mapLink = form.mapLink.trim();
    if (mapLink) {
      const safe = safeExternalUrl(mapLink);
      if (!safe) { showToast("Map link valid https:// URL hona chahiye.", "error"); return; }
      mapLink = safe;
    }

    setSaving(true);
    try {
      if (!auth.user) throw new Error("Not logged in.");
      if (!onePasswordAnswer.trim()) throw new Error("One Password answer missing hai.");
      await updateJobFieldsWithAnswer(auth.user.uid, job.id, onePasswordAnswer, {
        company: form.company,
        role: form.role,
        location: form.location,
        ctc: form.ctc,
        applyLink,
        appliedVia: form.appliedVia,
        appliedViaOther: form.appliedViaOther,
        batch: form.batch.split(",").map(b => b.trim()).filter(Boolean),
        bond: form.bond,
        lastDate: form.lastDate && form.lastDate !== LAST_DATE_NA ? new Date(form.lastDate) : null,
        mapLink,
        nearestMetro: form.nearestMetro,
        employmentType: form.employmentType,
        internshipMonths: form.internshipMonths,
        ppo: form.ppo,
      });
      showToast("Job updated.", "success");
      onSaved?.();
      onClose();
    } catch (error: any) {
      showToast(deletionProtectionError(error) || error?.message || "Update fail ho gaya.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        onClick={() => { if (!saving) onClose(); }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 9100 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-edit-title"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 9101, width: "min(560px, calc(100vw - 28px))", maxHeight: "calc(100vh - 40px)",
          overflowY: "auto", padding: 24,
          background: "var(--canvas, #fdfcfc)", border: "1.5px solid var(--hairline, #e2dede)",
          borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit",
        }}
      >
        <h2 id="job-edit-title" style={{ margin: "0 0 4px", fontSize: 17, color: "var(--ink)" }}>Edit job</h2>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--mute)" }}>
          {job.company || "Company"} — {job.role || "Role"}
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="two-col">
            <div className="form-group">
              <label className="form-label">company</label>
              <input className="form-input" value={form.company} onChange={e => set("company", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">role *</label>
              <input className="form-input" value={form.role} onChange={e => set("role", e.target.value)} required />
            </div>
          </div>

          <div className="two-col">
            <div className="form-group">
              <label className="form-label">location</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{form.employmentType === "internship" ? "stipend / ctc" : "ctc"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  className="form-input"
                  value={form.ctc === CTC_NA ? "" : form.ctc}
                  disabled={form.ctc === CTC_NA}
                  onChange={e => set("ctc", e.target.value)}
                  style={{ flex: 1, minWidth: 140, opacity: form.ctc === CTC_NA ? 0.45 : 1 }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.ctc === CTC_NA}
                    onChange={e => set("ctc", e.target.checked ? CTC_NA : "")}
                    style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                  />
                  N/A
                </label>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">employment type</label>
            <select className="form-select" value={form.employmentType} onChange={e => set("employmentType", e.target.value)}>
              {EMPLOYMENT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {form.employmentType === "internship" && (
            <div className="two-col">
              <div className="form-group">
                <label className="form-label">duration</label>
                <select className="form-select" value={form.internshipMonths} onChange={e => set("internshipMonths", e.target.value)}>
                  <option value="" disabled>Select duration…</option>
                  {INTERNSHIP_DURATION_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {form.internshipMonths
                    && !INTERNSHIP_DURATION_OPTS.some(o => o.value === form.internshipMonths)
                    && <option value={form.internshipMonths}>{form.internshipMonths}</option>}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">PPO offer?</label>
                <select className="form-select" value={form.ppo} onChange={e => set("ppo", e.target.value)}>
                  {PPO_OPTS.map(o => <option key={o.value || "unsure"} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {!isWalkin && (
            <div className="form-group">
              <label className="form-label">apply link</label>
              <input className="form-input" type="url" value={form.applyLink} onChange={e => set("applyLink", e.target.value)} placeholder="https://…" />
            </div>
          )}

          {isWalkin && (
            <>
              <div className="form-group">
                <label className="form-label">map link</label>
                <input className="form-input" type="url" value={form.mapLink} onChange={e => set("mapLink", e.target.value)} placeholder="https://maps…" />
              </div>
              <div className="form-group">
                <label className="form-label">nearest metro</label>
                <input className="form-input" value={form.nearestMetro} onChange={e => set("nearestMetro", e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">apply link <span style={{ color: "var(--mute)", fontWeight: 500 }}>(optional)</span></label>
                <input className="form-input" type="url" value={form.applyLink} onChange={e => set("applyLink", e.target.value)} />
              </div>
            </>
          )}

          <div className="two-col">
            <div className="form-group">
              <label className="form-label">source / via</label>
              <select className="form-select" value={form.appliedVia} onChange={e => set("appliedVia", e.target.value)}>
                {viaOpts.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            {form.appliedVia === "Others" && (
              <div className="form-group">
                <label className="form-label">platform name</label>
                <input className="form-input" value={form.appliedViaOther} onChange={e => set("appliedViaOther", e.target.value)} />
              </div>
            )}
          </div>

          <div className="two-col">
            <div className="form-group">
              <label className="form-label">batch</label>
              <input className="form-input" value={form.batch} onChange={e => set("batch", e.target.value)} placeholder="2025 or comma-separated" />
            </div>
            <div className="form-group">
              <label className="form-label">bond</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  className="form-input"
                  value={form.bond === BOND_NA ? "" : form.bond}
                  disabled={form.bond === BOND_NA}
                  onChange={e => set("bond", e.target.value)}
                  style={{ flex: 1, minWidth: 140, opacity: form.bond === BOND_NA ? 0.45 : 1 }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.bond === BOND_NA}
                    onChange={e => set("bond", e.target.checked ? BOND_NA : "")}
                    style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                  />
                  N/A
                </label>
              </div>
            </div>
          </div>

          {!isWalkin && (
            <div className="form-group">
              <label className="form-label">last date</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  className="form-input"
                  type="date"
                  value={form.lastDate === LAST_DATE_NA ? "" : form.lastDate}
                  disabled={form.lastDate === LAST_DATE_NA}
                  onChange={e => set("lastDate", e.target.value)}
                  style={{ maxWidth: 180, colorScheme: "light", opacity: form.lastDate === LAST_DATE_NA ? 0.45 : 1 }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.lastDate === LAST_DATE_NA}
                    onChange={e => set("lastDate", e.target.checked ? LAST_DATE_NA : "")}
                    style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                  />
                  N/A
                </label>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 6 }}>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Saving…</> : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
