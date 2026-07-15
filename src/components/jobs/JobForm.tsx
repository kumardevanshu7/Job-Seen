import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { createJob } from "../../lib/firestore";
import { showToast, ToastProvider } from "../ui/Toast";

const APPLIED_VIA_OPTIONS = [
  "Naukri.com", "LinkedIn", "Company Website", "Referral", "Others",
];

interface FormData {
  company: string; location: string; applyLink: string;
  appliedVia: string; appliedViaOther: string;
  ctc: string; role: string; lastDate: string; bond: string; batch: string;
}

const INIT: FormData = {
  company: "", location: "", applyLink: "",
  appliedVia: "LinkedIn", appliedViaOther: "",
  ctc: "", role: "", lastDate: "", bond: "", batch: "",
};

export default function JobForm() {
  const auth = useStore($auth);
  const [form, setForm] = useState<FormData>(INIT);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (f: keyof FormData, v: string) => setForm(p => ({ ...p, [f]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.applyLink.trim()) { showToast("Apply link is required.", "error"); return; }
    if (!form.role.trim()) { showToast("Role is required.", "error"); return; }
    if (!auth.user || !auth.profile) { showToast("Not logged in.", "error"); return; }
    setLoading(true);
    try {
      await createJob(auth.user.uid, auth.profile.username, {
        company: form.company.trim(),
        location: form.location.trim(),
        applyLink: form.applyLink.trim(),
        appliedVia: form.appliedVia,
        appliedViaOther: form.appliedVia === "Others" ? form.appliedViaOther.trim() : "",
        ctc: form.ctc.trim(),
        role: form.role.trim(),
        lastDate: form.lastDate ? new Date(form.lastDate) : null,
        bond: form.bond.trim(),
        batch: form.batch.split(",").map(b => b.trim()).filter(Boolean),
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

  const inputStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
  };

  return (
    <>
      <ToastProvider />

      {/* Page header */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <a href="/" style={{ fontSize: 13, color: "var(--mute)", textDecoration: "none" }}>
            ← Inbox
          </a>
        </div>
        <h1 className="page-title">Add Job Listing</h1>
        <p className="page-subtitle">Track a new job opportunity.</p>
      </div>

      <div className="form-card" style={{ maxWidth: 620 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Role */}
          <div className="form-group">
            <label className="form-label">role *</label>
            <input
              id="job-role"
              className="form-input"
              placeholder="Frontend Developer, SDE Intern…"
              value={form.role}
              onChange={e => set("role", e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          {/* Company + Location */}
          <div className="two-col">
            <div className="form-group">
              <label className="form-label">company</label>
              <input
                id="job-company"
                className="form-input"
                placeholder="Infosys, Wipro…"
                value={form.company}
                onChange={e => set("company", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div className="form-group">
              <label className="form-label">location</label>
              <input
                id="job-location"
                className="form-input"
                placeholder="Remote / Bangalore"
                value={form.location}
                onChange={e => set("location", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Apply link */}
          <div className="form-group">
            <label className="form-label">apply link *</label>
            <input
              id="job-apply-link"
              className="form-input"
              type="url"
              placeholder="https://…"
              value={form.applyLink}
              onChange={e => set("applyLink", e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div className="two-col">
            {/* Platform */}
            <div className="form-group">
              <label className="form-label">applied through</label>
              <select
                id="job-applied-via"
                className="form-select"
                value={form.appliedVia}
                onChange={e => set("appliedVia", e.target.value)}
                style={inputStyle}
              >
                {APPLIED_VIA_OPTIONS.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* CTC */}
            <div className="form-group">
              <label className="form-label">ctc</label>
              <input
                id="job-ctc"
                className="form-input"
                placeholder="6 LPA, ₹8–10 LPA"
                value={form.ctc}
                onChange={e => set("ctc", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {form.appliedVia === "Others" && (
            <div className="form-group">
              <label className="form-label">platform name</label>
              <input
                id="job-platform-other"
                className="form-input"
                placeholder="Internshala, Freshersworld…"
                value={form.appliedViaOther}
                onChange={e => set("appliedViaOther", e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          <div className="two-col">
            {/* Batch */}
            <div className="form-group">
              <label className="form-label">eligible batch</label>
              <input
                id="job-batch"
                className="form-input"
                placeholder="2025 or 2024,2025"
                value={form.batch}
                onChange={e => set("batch", e.target.value)}
                style={inputStyle}
              />
              <span className="form-hint">comma-separated</span>
            </div>

            {/* Bond */}
            <div className="form-group">
              <label className="form-label">bond</label>
              <input
                id="job-bond"
                className="form-input"
                placeholder="2 Years / No Bond"
                value={form.bond}
                onChange={e => set("bond", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Last date */}
          <div className="form-group" style={{ maxWidth: 220 }}>
            <label className="form-label">last date</label>
            <input
              id="job-last-date"
              className="form-input"
              type="date"
              value={form.lastDate}
              onChange={e => set("lastDate", e.target.value)}
              style={{ ...inputStyle, colorScheme: "light" }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              id="job-submit-btn"
              className="btn btn-primary"
              disabled={loading || done}
            >
              {loading
                ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Adding…</>
                : done ? "Added ✓" : "Add Job"
              }
            </button>
            <a href="/" className="btn btn-secondary" style={{ textDecoration: "none" }}>
              Cancel
            </a>
          </div>
        </form>
      </div>
    </>
  );
}
