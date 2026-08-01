import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { updateBruteForceJobWithAnswer, type BruteForceJob } from "../../lib/firestore";
import { safeExternalUrl } from "../../lib/security";
import { deletionProtectionError } from "../../lib/deletionProtection";
import { showToast } from "../ui/Toast";

interface Props {
  lead: BruteForceJob;
  onePasswordAnswer: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function BruteForceEditModal({ lead, onePasswordAnswer, onClose, onSaved }: Props) {
  const auth = useStore($auth);
  const [company, setCompany] = useState(lead.company || "");
  const [role, setRole] = useState(lead.role || "");
  const [phone, setPhone] = useState(lead.phone || "");
  const [location, setLocation] = useState(lead.location || "");
  const [mapLink, setMapLink] = useState(lead.mapLink || "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!company.trim() || !role.trim() || !location.trim()) {
      showToast("Company, role, aur location required hain.", "error");
      return;
    }
    if (!safeExternalUrl(mapLink)) {
      showToast("Map link valid https:// URL hona chahiye.", "error");
      return;
    }
    if (!auth.user) {
      showToast("Not logged in.", "error");
      return;
    }
    if (!onePasswordAnswer.trim()) {
      showToast("One Password answer missing hai.", "error");
      return;
    }

    setSaving(true);
    try {
      await updateBruteForceJobWithAnswer(auth.user.uid, lead.id, onePasswordAnswer, {
        company,
        role,
        phone,
        location,
        mapLink,
      });
      showToast("Lead updated.", "success");
      onSaved?.();
      onClose();
    } catch (error) {
      showToast(deletionProtectionError(error), "error");
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
        aria-labelledby="bf-edit-title"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 9101, width: "min(520px, calc(100vw - 28px))", maxHeight: "calc(100vh - 40px)",
          overflowY: "auto", padding: 24,
          background: "var(--canvas, #fdfcfc)", border: "1.5px solid var(--hairline, #e2dede)",
          borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit",
        }}
      >
        <h2 id="bf-edit-title" style={{ margin: "0 0 4px", fontSize: 17, color: "var(--ink)" }}>Edit Brute Force lead</h2>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--mute)" }}>{lead.company} — {lead.role}</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="two-col">
            <div className="form-group">
              <label className="form-label">company *</label>
              <input className="form-input" value={company} onChange={e => setCompany(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">role *</label>
              <input className="form-input" value={role} onChange={e => setRole(e.target.value)} required />
            </div>
          </div>
          <div className="two-col">
            <div className="form-group">
              <label className="form-label">phone</label>
              <input className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 …" />
            </div>
            <div className="form-group">
              <label className="form-label">location *</label>
              <input className="form-input" value={location} onChange={e => setLocation(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">map link *</label>
            <input className="form-input" type="url" value={mapLink} onChange={e => setMapLink(e.target.value)} required />
          </div>
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
