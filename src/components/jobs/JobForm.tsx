import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { createJob, createJobs, subscribeToUserJobs, type EmploymentType, type JobType, type JobCard } from "../../lib/firestore";
import { showToast, ToastProvider } from "../ui/Toast";
import { safeExternalUrl } from "../../lib/security";
import { WALK_IN_ADD_JOB_ENABLED } from "../../lib/features";
import { parseOnlineJobImport } from "../../lib/onlineJobImport";

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

interface OnlineForm {
  company: string; location: string; applyLink: string;
  appliedVia: string; appliedViaOther: string;
  ctc: string; role: string; lastDate: string; bond: string; batch: string;
  employmentType: EmploymentType;
  internshipMonths: string;
  ppo: string;
}

interface WalkinForm {
  role: string; company: string; location: string;
  mapLink: string; nearestMetro: string;
  applyLink: string; appliedVia: string;
  ctc: string; batch: string; bond: string;
  employmentType: EmploymentType;
  internshipMonths: string;
  ppo: string;
}

type ImportProgress = {
  status: "loading" | "complete" | "error";
  title: string;
  message: string;
};

const ONLINE_INIT: OnlineForm = {
  company: "", location: "", applyLink: "",
  appliedVia: "LinkedIn", appliedViaOther: "",
  ctc: "", role: "", lastDate: "", bond: "", batch: "",
  employmentType: "full_time", internshipMonths: "", ppo: "",
};

const WALKIN_INIT: WalkinForm = {
  role: "", company: "", location: "",
  mapLink: "", nearestMetro: "",
  applyLink: "", appliedVia: "Job hai",
  ctc: "", batch: "", bond: "",
  employmentType: "full_time", internshipMonths: "", ppo: "",
};

function employmentPayload(f: { employmentType: EmploymentType; internshipMonths: string; ppo: string }) {
  const isIntern = f.employmentType === "internship";
  return {
    employmentType: f.employmentType,
    internshipMonths: isIntern ? f.internshipMonths.trim() : "",
    ppo: isIntern ? f.ppo : "",
  };
}

export default function JobForm() {
  const auth = useStore($auth);
  const [jobType, setJobType] = useState<JobType | null>(WALK_IN_ADD_JOB_ENABLED ? null : "online");
  const [online, setOnline] = useState<OnlineForm>(ONLINE_INIT);
  const [walkin, setWalkin] = useState<WalkinForm>(WALKIN_INIT);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [pastJobs, setPastJobs] = useState<JobCard[]>([]);

  useEffect(() => {
    if (!auth.user) return;
    const unsub = subscribeToUserJobs(auth.user.uid, setPastJobs);
    return () => unsub();
  }, [auth.user]);

  const suggest = useMemo(() => {
    const uniq = (vals: (string | undefined)[]) =>
      Array.from(new Set(vals.map(v => (v ?? "").trim()).filter(Boolean))).slice(0, 50);
    return {
      company: uniq(pastJobs.map(j => j.company)),
      role: uniq(pastJobs.map(j => j.role)),
      location: uniq(pastJobs.map(j => j.location)),
      ctc: uniq(pastJobs.map(j => j.ctc)),
    };
  }, [pastJobs]);

  const setO = (f: keyof OnlineForm, v: string) => setOnline(p => ({ ...p, [f]: v }));
  const setW = (f: keyof WalkinForm, v: string) => setWalkin(p => ({ ...p, [f]: v }));

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
  };

  function EmploymentFields({
    value,
    months,
    ppo,
    onChange,
  }: {
    value: EmploymentType;
    months: string;
    ppo: string;
    onChange: (field: "employmentType" | "internshipMonths" | "ppo", v: string) => void;
  }) {
    return (
      <>
        <div className="form-group">
          <label className="form-label">role type *</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EMPLOYMENT_OPTS.map(opt => {
              const active = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange("employmentType", opt.value)}
                  style={{
                    fontFamily: "inherit", fontSize: 12, fontWeight: 700,
                    padding: "8px 12px", borderRadius: 6, cursor: "pointer",
                    border: active ? "1.5px solid var(--ink)" : "1.5px solid var(--hairline)",
                    background: active ? "var(--ink)" : "var(--canvas)",
                    color: active ? "var(--canvas)" : "var(--body)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {value === "internship" && (
          <div
            style={{
              border: "1.5px solid var(--hairline)",
              borderRadius: 8,
              padding: "14px 14px 4px",
              background: "var(--surface-soft)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", letterSpacing: "0.04em" }}>
              INTERNSHIP DETAILS
            </div>
            <div className="two-col">
              <div className="form-group">
                <label className="form-label">duration (months)</label>
                <select
                  className="form-select"
                  value={months}
                  onChange={e => onChange("internshipMonths", e.target.value)}
                  style={inputStyle}
                >
                  <option value="" disabled>Select duration…</option>
                  {INTERNSHIP_DURATION_OPTS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">PPO offer?</label>
                <select
                  className="form-select"
                  value={ppo}
                  onChange={e => onChange("ppo", e.target.value)}
                  style={inputStyle}
                >
                  {PPO_OPTS.map(o => (
                    <option key={o.value || "unsure"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: -6 }}>
              <span className="form-hint">CTC / stipend field me stipend bhi likh sakte ho.</span>
            </div>
          </div>
        )}
      </>
    );
  }

  async function submitOnline(e: React.FormEvent) {
    e.preventDefault();
    if (!online.applyLink.trim()) { showToast("Apply link is required.", "error"); return; }
    const applyLink = safeExternalUrl(online.applyLink);
    if (!applyLink) { showToast("Apply link must be a valid https:// URL.", "error"); return; }
    if (!online.role.trim()) { showToast("Role is required.", "error"); return; }
    if (online.employmentType === "internship" && !online.internshipMonths.trim()) {
      showToast("Internship duration (months) daalo.", "error");
      return;
    }
    if (!auth.user || !auth.profile) { showToast("Not logged in.", "error"); return; }
    setLoading(true);
    try {
      await createJob(auth.user.uid, auth.profile.username, {
        jobType: "online",
        company: online.company.trim(),
        location: online.location.trim(),
        applyLink,
        appliedVia: online.appliedVia,
        appliedViaOther: online.appliedVia === "Others" ? online.appliedViaOther.trim() : "",
        ctc: online.ctc.trim(),
        role: online.role.trim(),
        lastDate: online.lastDate && online.lastDate !== LAST_DATE_NA ? new Date(online.lastDate) : null,
        bond: online.bond.trim(),
        batch: online.batch.split(",").map(b => b.trim()).filter(Boolean),
        mapLink: "",
        nearestMetro: "",
        routeOrder: 0,
        ...employmentPayload(online),
      });
      setDone(true);
      showToast("Job added.", "success");
      setTimeout(() => { window.location.href = "/"; }, 900);
    } catch (err: any) {
      showToast(err.message ?? "Failed to add.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleOnlineImport(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const fail = (message: string) => {
      setImportProgress({ status: "error", title: "Import failed", message });
      showToast(message, "error");
      input.value = "";
    };
    if (!auth.user || !auth.profile) { fail("Not logged in."); return; }
    if (!file.name.toLowerCase().endsWith(".json")) { fail("Sirf .json file upload karo."); return; }
    if (file.size > 1024 * 1024) { fail("JSON file maximum 1 MB ho sakti hai."); return; }

    setImporting(true);
    setImportProgress({ status: "loading", title: "Reading JSON file", message: `${file.name} read ho rahi hai…` });
    try {
      const contents = await file.text();
      setImportProgress({ status: "loading", title: "Validating jobs", message: "Fields aur HTTPS apply links check ho rahe hain…" });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const rows = parseOnlineJobImport(contents);
      setImportProgress({ status: "loading", title: "Creating job cards", message: `${rows.length} online cards create ho rahe hain…` });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const count = await createJobs(auth.user.uid, auth.profile.username, rows);
      setImportProgress({ status: "complete", title: "Import complete", message: `${count} online job cards successfully create ho gaye.` });
      showToast(`${count} jobs imported.`, "success");
    } catch (err: any) {
      const message = err.message ?? "JSON import failed.";
      setImportProgress({ status: "error", title: "Import failed", message });
      showToast(message, "error");
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  async function submitWalkin(e: React.FormEvent) {
    e.preventDefault();
    if (!WALK_IN_ADD_JOB_ENABLED) { showToast("Add Job walk-in option is disabled.", "info"); return; }
    if (!walkin.role.trim()) { showToast("Role is required.", "error"); return; }
    if (!walkin.company.trim()) { showToast("Company is required.", "error"); return; }
    if (!walkin.location.trim()) { showToast("Location is required.", "error"); return; }
    const mapLink = walkin.mapLink.trim() ? safeExternalUrl(walkin.mapLink) : "";
    const applyLink = walkin.applyLink.trim() ? safeExternalUrl(walkin.applyLink) : "";
    if (walkin.mapLink.trim() && !mapLink) { showToast("Map link must be a valid https:// URL.", "error"); return; }
    if (walkin.applyLink.trim() && !applyLink) { showToast("Apply link must be a valid https:// URL.", "error"); return; }
    if (walkin.employmentType === "internship" && !walkin.internshipMonths.trim()) {
      showToast("Internship duration (months) daalo.", "error");
      return;
    }
    if (!auth.user || !auth.profile) { showToast("Not logged in.", "error"); return; }
    setLoading(true);
    try {
      await createJob(auth.user.uid, auth.profile.username, {
        jobType: "walkin",
        company: walkin.company.trim(),
        location: walkin.location.trim(),
        applyLink: applyLink ?? "",
        appliedVia: walkin.appliedVia,
        appliedViaOther: "",
        ctc: walkin.ctc.trim(),
        role: walkin.role.trim(),
        lastDate: null,
        bond: walkin.bond.trim(),
        batch: walkin.batch.split(",").map(b => b.trim()).filter(Boolean),
        mapLink: mapLink ?? "",
        nearestMetro: walkin.nearestMetro.trim(),
        routeOrder: Date.now(),
        onRoute: true,
        status: "pending",
        ...employmentPayload(walkin),
      });
      setDone(true);
      showToast("Walk-in added.", "success");
      setTimeout(() => { window.location.href = "/walk-in"; }, 900);
    } catch (err: any) {
      showToast(err.message ?? "Failed to add.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ToastProvider />
      <datalist id="suggest-company">{suggest.company.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="suggest-role">{suggest.role.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="suggest-location">{suggest.location.map(v => <option key={v} value={v} />)}</datalist>
      <datalist id="suggest-ctc">{suggest.ctc.map(v => <option key={v} value={v} />)}</datalist>

      {importProgress && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,0,0,0.38)", backdropFilter: "blur(3px)" }}>
          <div role="dialog" aria-modal="true" aria-live="polite" style={{ width: "min(430px, 100%)", padding: 24, borderRadius: 12, border: "1px solid var(--hairline-strong)", background: "var(--canvas)", boxShadow: "0 18px 60px rgba(15,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {importProgress.status === "loading" ? (
                <div className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
              ) : (
                <span aria-hidden="true" style={{ color: importProgress.status === "complete" ? "#15803d" : "#b91c1c", fontSize: 24 }}>
                  {importProgress.status === "complete" ? "✓" : "!"}
                </span>
              )}
              <div>
                <h2 style={{ margin: 0, color: "var(--ink)", fontSize: 17 }}>{importProgress.title}</h2>
                <p style={{ margin: "5px 0 0", color: "var(--mute)", fontSize: 12, lineHeight: 1.5 }}>{importProgress.message}</p>
              </div>
            </div>
            {importProgress.status !== "loading" && (
              <button type="button" className="btn btn-primary" onClick={() => importProgress.status === "complete" ? window.location.href = "/" : setImportProgress(null)} style={{ marginTop: 20 }}>
                {importProgress.status === "complete" ? "View cards" : "Close"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <a href="/" style={{ fontSize: 13, color: "var(--mute)", textDecoration: "none" }}>
            ← Inbox
          </a>
        </div>
        <h1 className="page-title">Add Job Listing</h1>
        <p className="page-subtitle">
          {jobType === null
            ? "Choose how you found this opportunity."
            : jobType === "online"
              ? "Track an online application."
              : "Track a walk-in interview stop."}
        </p>
      </div>

      {WALK_IN_ADD_JOB_ENABLED && jobType === null && (
        <div
          className="job-type-picker"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 620 }}
        >
          <button
            type="button"
            onClick={() => setJobType("online")}
            className="form-card"
            style={{
              cursor: "pointer", textAlign: "left", border: "1.5px solid var(--hairline)",
              background: "var(--canvas)", padding: "22px 20px",
              fontFamily: "inherit", color: "inherit",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8, fontWeight: 700, color: "var(--ink)" }}>Online</div>
            <div style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.45 }}>
              Portal / LinkedIn form — apply link required, last date, platform.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setJobType("walkin")}
            className="form-card"
            style={{
              cursor: "pointer", textAlign: "left", border: "1.5px solid var(--hairline)",
              background: "var(--canvas)", padding: "22px 20px",
              fontFamily: "inherit", color: "inherit",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 8, fontWeight: 700, color: "var(--ink)" }}>Walk-in</div>
            <div style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.45 }}>
              On-site visit — map, metro, then plan your day’s route order.
            </div>
          </button>
          <style>{`
            @media (max-width: 560px) {
              .job-type-picker { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </div>
      )}

      {jobType === "online" && (
        <div className="form-card" style={{ maxWidth: 620 }}>
          {WALK_IN_ADD_JOB_ENABLED && (
            <button
              type="button"
              onClick={() => setJobType(null)}
              style={{
                background: "none", border: "none", padding: 0, marginBottom: 14,
                fontSize: 12, color: "var(--mute)", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ← change type
            </button>
          )}

          <div style={{ marginBottom: 22, paddingBottom: 20, borderBottom: "1px solid var(--hairline)" }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)" }}>Import online jobs from JSON</div>
            <p className="form-hint" style={{ marginTop: 6 }}>Maximum 100 jobs aur 1 MB file. Role aur HTTPS applyLink required hain.</p>
            <pre style={{ margin: "10px 0 12px", padding: 10, overflowX: "auto", borderRadius: 6, background: "var(--surface-soft)", color: "var(--body)", fontSize: 10, lineHeight: 1.5 }}>
              {`[{"role":"Frontend Developer","company":"TCS","location":"Remote","applyLink":"https://example.com/apply","appliedVia":"LinkedIn"}]`}
            </pre>
            <label className="btn btn-secondary" style={{ opacity: importing ? 0.6 : 1, cursor: importing ? "wait" : "pointer" }}>
              {importing ? "Importing…" : "Upload JSON file"}
              <input type="file" accept=".json,application/json" disabled={importing} onChange={handleOnlineImport} style={{ display: "none" }} />
            </label>
          </div>

          <form onSubmit={submitOnline} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="form-group">
              <label className="form-label">role *</label>
              <input className="form-input" list="suggest-role" placeholder="Frontend Developer, SDE Intern…" value={online.role} onChange={e => setO("role", e.target.value)} style={inputStyle} required />
            </div>

            <EmploymentFields
              value={online.employmentType}
              months={online.internshipMonths}
              ppo={online.ppo}
              onChange={(f, v) => setO(f, v)}
            />

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">company</label>
                <input className="form-input" list="suggest-company" placeholder="Infosys, Wipro…" value={online.company} onChange={e => setO("company", e.target.value)} style={inputStyle} />
              </div>
              <div className="form-group">
                <label className="form-label">location</label>
                <input className="form-input" list="suggest-location" placeholder="Remote / Bangalore" value={online.location} onChange={e => setO("location", e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">apply link *</label>
              <input className="form-input" type="url" placeholder="https://…" value={online.applyLink} onChange={e => setO("applyLink", e.target.value)} style={inputStyle} required />
            </div>

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">applied through</label>
                <select className="form-select" value={online.appliedVia} onChange={e => setO("appliedVia", e.target.value)} style={inputStyle}>
                  {ONLINE_VIA.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  {online.employmentType === "internship" ? "stipend / ctc" : "ctc"}
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    list="suggest-ctc"
                    placeholder={online.employmentType === "internship" ? "₹15–20k /month" : "6 LPA, ₹8–10 LPA"}
                    value={online.ctc === CTC_NA ? "" : online.ctc}
                    disabled={online.ctc === CTC_NA}
                    onChange={e => setO("ctc", e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 140, opacity: online.ctc === CTC_NA ? 0.45 : 1 }}
                  />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}>
                    <input
                      type="checkbox"
                      checked={online.ctc === CTC_NA}
                      onChange={e => setO("ctc", e.target.checked ? CTC_NA : "")}
                      style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                    />
                    N/A
                  </label>
                </div>
              </div>
            </div>

            {online.appliedVia === "Others" && (
              <div className="form-group">
                <label className="form-label">platform name</label>
                <input className="form-input" placeholder="Internshala, Freshersworld…" value={online.appliedViaOther} onChange={e => setO("appliedViaOther", e.target.value)} style={inputStyle} />
              </div>
            )}

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">eligible batch</label>
                <input className="form-input" placeholder="2025 or 2024,2025" value={online.batch} onChange={e => setO("batch", e.target.value)} style={inputStyle} />
                <span className="form-hint">comma-separated</span>
              </div>
              <div className="form-group">
                <label className="form-label">bond</label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    placeholder="2 Years / No Bond"
                    value={online.bond === BOND_NA ? "" : online.bond}
                    disabled={online.bond === BOND_NA}
                    onChange={e => setO("bond", e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 140, opacity: online.bond === BOND_NA ? 0.45 : 1 }}
                  />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}>
                    <input
                      type="checkbox"
                      checked={online.bond === BOND_NA}
                      onChange={e => setO("bond", e.target.checked ? BOND_NA : "")}
                      style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                    />
                    N/A
                  </label>
                </div>
              </div>
            </div>

            <div className="form-group" style={{ maxWidth: 280 }}>
              <label className="form-label">last date</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input
                  className="form-input"
                  type="date"
                  value={online.lastDate === LAST_DATE_NA ? "" : online.lastDate}
                  disabled={online.lastDate === LAST_DATE_NA}
                  onChange={e => setO("lastDate", e.target.value)}
                  style={{ ...inputStyle, colorScheme: "light", maxWidth: 180, opacity: online.lastDate === LAST_DATE_NA ? 0.45 : 1 }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}>
                  <input
                    type="checkbox"
                    checked={online.lastDate === LAST_DATE_NA}
                    onChange={e => setO("lastDate", e.target.checked ? LAST_DATE_NA : "")}
                    style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                  />
                  N/A
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="submit" className="btn btn-primary" disabled={loading || done}>
                {loading ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Adding…</> : done ? "Added ✓" : "Add Job"}
              </button>
              <a href="/" className="btn btn-secondary" style={{ textDecoration: "none" }}>Cancel</a>
            </div>
          </form>
        </div>
      )}

      {WALK_IN_ADD_JOB_ENABLED && jobType === "walkin" && (
        <div className="form-card" style={{ maxWidth: 620 }}>
          <button
            type="button"
            onClick={() => setJobType(null)}
            style={{
              background: "none", border: "none", padding: 0, marginBottom: 14,
              fontSize: 12, color: "var(--mute)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            ← change type
          </button>
          <form onSubmit={submitWalkin} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="form-group">
              <label className="form-label">role *</label>
              <input className="form-input" placeholder="Frontend Developer, SDE Intern…" value={walkin.role} onChange={e => setW("role", e.target.value)} style={inputStyle} required />
            </div>

            <EmploymentFields
              value={walkin.employmentType}
              months={walkin.internshipMonths}
              ppo={walkin.ppo}
              onChange={(f, v) => setW(f, v)}
            />

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">company *</label>
                <input className="form-input" placeholder="Infosys, Wipro…" value={walkin.company} onChange={e => setW("company", e.target.value)} style={inputStyle} required />
              </div>
              <div className="form-group">
                <label className="form-label">location *</label>
                <input className="form-input" placeholder="Noida Sector 62" value={walkin.location} onChange={e => setW("location", e.target.value)} style={inputStyle} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">location map link</label>
              <input className="form-input" type="url" placeholder="https://maps.google.com/…" value={walkin.mapLink} onChange={e => setW("mapLink", e.target.value)} style={inputStyle} />
            </div>

            <div className="form-group">
              <label className="form-label">nearest metro</label>
              <input className="form-input" placeholder="Sector 62 / Blue Line" value={walkin.nearestMetro} onChange={e => setW("nearestMetro", e.target.value)} style={inputStyle} />
            </div>

            <div className="form-group">
              <label className="form-label">apply link <span style={{ color: "var(--mute)", fontWeight: 500 }}>(optional)</span></label>
              <input className="form-input" type="url" placeholder="https://…" value={walkin.applyLink} onChange={e => setW("applyLink", e.target.value)} style={inputStyle} />
            </div>

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">applied through</label>
                <select className="form-select" value={walkin.appliedVia} onChange={e => setW("appliedVia", e.target.value)} style={inputStyle}>
                  {WALKIN_VIA.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  {walkin.employmentType === "internship" ? "stipend / ctc" : "ctc"}{" "}
                  <span style={{ color: "var(--mute)", fontWeight: 500 }}>(if available)</span>
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    placeholder={walkin.employmentType === "internship" ? "₹15–20k /month" : "6 LPA, ₹8–10 LPA"}
                    value={walkin.ctc === CTC_NA ? "" : walkin.ctc}
                    disabled={walkin.ctc === CTC_NA}
                    onChange={e => setW("ctc", e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 140, opacity: walkin.ctc === CTC_NA ? 0.45 : 1 }}
                  />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}>
                    <input
                      type="checkbox"
                      checked={walkin.ctc === CTC_NA}
                      onChange={e => setW("ctc", e.target.checked ? CTC_NA : "")}
                      style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                    />
                    N/A
                  </label>
                </div>
              </div>
            </div>

            <div className="two-col">
              <div className="form-group">
                <label className="form-label">eligible batch <span style={{ color: "var(--mute)", fontWeight: 500 }}>(optional)</span></label>
                <input className="form-input" placeholder="2025 or 2024,2025" value={walkin.batch} onChange={e => setW("batch", e.target.value)} style={inputStyle} />
              </div>
              <div className="form-group">
                <label className="form-label">bond <span style={{ color: "var(--mute)", fontWeight: 500 }}>(optional)</span></label>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    placeholder="2 Years / No Bond"
                    value={walkin.bond === BOND_NA ? "" : walkin.bond}
                    disabled={walkin.bond === BOND_NA}
                    onChange={e => setW("bond", e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 140, opacity: walkin.bond === BOND_NA ? 0.45 : 1 }}
                  />
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--body)", cursor: "pointer", fontFamily: "inherit" }}>
                    <input
                      type="checkbox"
                      checked={walkin.bond === BOND_NA}
                      onChange={e => setW("bond", e.target.checked ? BOND_NA : "")}
                      style={{ width: 14, height: 14, accentColor: "var(--ink)" }}
                    />
                    N/A
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="submit" className="btn btn-primary" disabled={loading || done}>
                {loading ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Saving…</> : done ? "Saved ✓" : "Save"}
              </button>
              <a href="/walk-in" className="btn btn-secondary" style={{ textDecoration: "none" }}>Cancel</a>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
