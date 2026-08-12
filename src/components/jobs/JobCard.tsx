import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { copyJob, getPermission, updateJobStatus, setJobOnRoute } from "../../lib/firestore";
import type { JobCard as JobCardType, JobStatus } from "../../lib/firestore";
import { showToast } from "../ui/Toast";
import { serverTimestamp } from "firebase/firestore";
import ReasonModal from "../ui/ReasonModal";
import DeletionChallengeModal from "../ui/DeletionChallengeModal";
import JobEditModal from "./JobEditModal";
import { deletionProtectionError, verifyDeletionAnswer } from "../../lib/deletionProtection";
import { safeExternalUrl } from "../../lib/security";
import { WALK_IN_ENABLED } from "../../lib/features";

interface Props {
  job: JobCardType;
  showCopy?: boolean;
  isOwner?: boolean;
  onDelete?: (id: string) => void;
  onClick?: (job: JobCardType) => void;
  index?: number;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  variant?: "default" | "kanban";
}

function formatDate(d: any): string {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0)  return `closed ${Math.abs(days)}d ago`;
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function dateClass(d: any): string {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  const diff = Math.ceil((date.getTime() - Date.now()) / (1000*60*60*24));
  if (diff < 0) return "date-overdue";
  if (diff <= 3) return "date-soon";
  return "";
}

function daysSince(d: any): number {
  if (!d) return 0;
  const date = d.toDate ? d.toDate() : new Date(d);
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUS_CONFIG: Record<JobStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:         { label: "Not Applied",       color: "#c0392b", bg: "#fff5f5", border: "#f5c6c6" },
  applied:         { label: "Applied ✓",         color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  in_progress:     { label: "Pending ⏳",        color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  no_response:     { label: "No Response Yet",   color: "#7c3aed", bg: "#faf5ff", border: "#d8b4fe" },
  rejected:        { label: "Rejected",          color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
  selected:        { label: "🎉 Selected!",      color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
  interview_done:  { label: "Interview done",    color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  fraud:           { label: "Fraud",             color: "#9b1c1c", bg: "#fef2f2", border: "#fecaca" },
  cancelled:       { label: "Cancelled",         color: "#78716c", bg: "#fafaf9", border: "#d6d3d1" },
};

const platformShort: Record<string, string> = {
  "Naukri.com":       "naukri",
  "LinkedIn":         "linkedin",
  "Company Website":  "website",
  "Referral":         "referral",
  "Others":           "other",
  "Instagram":        "instagram",
};

function employmentTypeLabel(job: JobCardType): string {
  if (job.employmentType === "full_time") return "full-time";
  if (job.employmentType === "part_time") return "part-time";
  if (job.employmentType === "internship") return "internship";
  if (job.employmentType === "custom") return (job.employmentCustom || "custom").toLowerCase();
  return "";
}

function isInstagramJob(job: JobCardType): boolean {
  return (job.appliedVia || "").toLowerCase() === "instagram";
}

const footerBtnBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 32,
  padding: "0 12px",
  borderRadius: 5,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
};

function isOnWalkInRoute(job: JobCardType): boolean {
  if (job.onRoute === true) return true;
  if (job.onRoute === false) return false;
  return (job.jobType ?? "online") === "walkin";
}

export default function JobCard({ job, showCopy = true, isOwner = false, onDelete, onClick, index = 0, draggable, onDragStart, onDragEnd, variant = "default" }: Props) {
  const auth = useStore($auth);
  const [copying, setCopying] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<JobStatus>(job.status ?? "pending");
  const [showCancelReason, setShowCancelReason] = useState(false);
  const [onRoute, setOnRoute] = useState(isOnWalkInRoute(job));
  const [editChallengeOpen, setEditChallengeOpen] = useState(false);
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [editAnswer, setEditAnswer] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [routeDateOpen, setRouteDateOpen] = useState(false);
  const [routeDatePick, setRouteDatePick] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [routeBusy, setRouteBusy] = useState(false);

  // keep local flags in sync with live firestore updates
  useEffect(() => {
    setLocalStatus(job.status ?? "pending");
    setOnRoute(isOnWalkInRoute(job));
  }, [job.status, job.onRoute, job.jobType]);

  const status = localStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const daysApplied = daysSince(job.appliedAt);
  const showReminder = isOwner
    && status === "applied"
    && daysApplied >= 3
    && !job.reminderDismissedAt;

  const platform = job.appliedVia === "Others"
    ? (job.appliedViaOther || "other")
    : (platformShort[job.appliedVia] ?? job.appliedVia?.toLowerCase());
  const instagram = isInstagramJob(job);
  const reelUrl = instagram ? safeExternalUrl(job.applyLink) : null;
  const siteUrl = safeExternalUrl(job.siteLink || "");
  const phoneHref = job.contactPhone ? `tel:${job.contactPhone.replace(/[^\d+]/g, "")}` : null;

  async function handleCopy() {
    if (!auth.user || !auth.profile) return;
    setCopying(true);
    try {
      const allowed = await getPermission(job.ownerUID, auth.user.uid);
      if (!allowed) { showToast("You don't have permission to copy this job.", "error"); return; }
      await copyJob(job, auth.user.uid, auth.profile.username);
      setHasCopied(true);
      showToast("Job copied to your account.", "success");
    } catch (e: any) {
      if (e?.message === "DUPLICATE") {
        setHasCopied(true);
        showToast("Ye job tumhare account mein pehle se hai!", "info");
      } else {
        showToast("Failed to copy job.", "error");
      }
    } finally {
      setCopying(false);
    }
  }

  async function setStatus(newStatus: JobStatus, extra?: { cancelReason?: string }) {
    if (!isOwner) return;
    setUpdating(true);
    try {
      const payload: any = { ...extra };
      if (newStatus === "applied") payload.appliedAt = serverTimestamp();
      await updateJobStatus(job.id, newStatus, payload);
      setLocalStatus(newStatus);
      showToast(
        newStatus === "applied"   ? "Marked as Applied! ✓" :
        newStatus === "selected"  ? "Congratulations! 🎉" :
        newStatus === "rejected"  ? "Marked as Rejected." :
        newStatus === "cancelled" ? "Marked as Cancelled." :
        newStatus === "no_response" ? "Noted. We'll remind you again later." :
        "Status updated.",
        newStatus === "selected" ? "success" : "info"
      );
    } catch {
      showToast("Failed to update status.", "error");
    } finally {
      setUpdating(false);
    }
  }

  async function dismissReminder(response: "no_response" | "selected" | "rejected") {
    await setStatus(response);
    if (response === "no_response") {
      await updateJobStatus(job.id, "no_response", { reminderDismissedAt: serverTimestamp() });
    }
  }

  async function toggleRoute(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isOwner) return;
    if (onRoute) {
      setRouteBusy(true);
      setOnRoute(false);
      try {
        await setJobOnRoute(job.id, false);
        showToast("Removed from Walk-in Route.", "info");
      } catch {
        setOnRoute(true);
        showToast("Couldn’t update route.", "error");
      } finally {
        setRouteBusy(false);
      }
      return;
    }
    const d = new Date();
    setRouteDatePick(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setRouteDateOpen(true);
  }

  async function confirmAddToRoute() {
    if (!routeDatePick) {
      showToast("Route date choose karo.", "error");
      return;
    }
    setRouteBusy(true);
    setOnRoute(true);
    try {
      await setJobOnRoute(job.id, true, Date.now(), routeDatePick);
      setRouteDateOpen(false);
      showToast(`Walk-in Route pe add ho gaya (${routeDatePick}).`, "info");
    } catch {
      setOnRoute(false);
      showToast("Couldn’t update route.", "error");
    } finally {
      setRouteBusy(false);
    }
  }

  function openEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (!isOwner || !auth.user) return;
    setEditError("");
    setEditChallengeOpen(true);
  }

  async function confirmEditUnlock(answer: string) {
    if (!auth.user) return;
    setEditBusy(true);
    setEditError("");
    try {
      // Early check — wrong answer fails here; save still writes a fresh same-batch proof.
      await verifyDeletionAnswer(auth.user.uid, answer, `edit_${job.id}`);
      setEditAnswer(answer);
      setEditChallengeOpen(false);
      setEditUnlocked(true);
    } catch (error) {
      setEditError(deletionProtectionError(error));
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
    {showCancelReason && (
      <ReasonModal
        title="Why cancelled?"
        hint="Short mein likh do — kyu cancel kiya."
        confirmLabel="Mark Cancelled"
        onCancel={() => setShowCancelReason(false)}
        onConfirm={async (reason) => {
          setShowCancelReason(false);
          await setStatus("cancelled", { cancelReason: reason });
        }}
      />
    )}
    {editChallengeOpen && auth.user && (
      <DeletionChallengeModal
        uid={auth.user.uid}
        title="Edit this job?"
        description="Job edit karne se pehle Settings → One Password ka answer verify karo."
        confirmLabel="Verify & edit"
        confirmTone="primary"
        busy={editBusy}
        error={editError}
        onCancel={() => { if (!editBusy) { setEditChallengeOpen(false); setEditError(""); } }}
        onConfirm={confirmEditUnlock}
      />
    )}
    {editUnlocked && (
      <JobEditModal
        job={job}
        onePasswordAnswer={editAnswer}
        onClose={() => { setEditUnlocked(false); setEditAnswer(""); }}
      />
    )}
    {routeDateOpen && (
      <>
        <div
          onClick={() => { if (!routeBusy) setRouteDateOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 9000 }}
        />
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            zIndex: 9001, width: "min(360px, calc(100vw - 28px))", padding: 22,
            background: "var(--canvas)", border: "1.5px solid var(--hairline)",
            borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit",
          }}
        >
          <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--ink)" }}>Add to Walk-in Route</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--mute)", lineHeight: 1.45 }}>
            Kis din ke route pe daalna hai? Default = Today.
          </p>
          <div className="form-group">
            <label className="form-label">route date</label>
            <input
              className="form-input"
              type="date"
              value={routeDatePick}
              onChange={e => setRouteDatePick(e.target.value)}
              style={{ colorScheme: "light", fontFamily: "inherit" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={routeBusy} onClick={() => setRouteDateOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={routeBusy || !routeDatePick} onClick={() => void confirmAddToRoute()}>
              {routeBusy ? "Adding…" : "Add to route"}
            </button>
          </div>
        </div>
      </>
    )}
    <div
      className="job-card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onClick && onClick(job)}
      style={{
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        borderRadius: variant === "kanban" ? 8 : 12,
        padding: variant === "kanban" ? 14 : "18px 18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: variant === "kanban" ? 12 : 14,
        position: "relative",
        transition: "all 0.2s ease",
        cursor: draggable ? "grab" : (onClick ? "pointer" : "default"),
        opacity: status === "cancelled" ? 0.88 : 1,
      }}
    >
      {/* ── Header Row ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.06em", background: "var(--ink, #201d1d)",
              color: "var(--canvas, #fdfcfc)", padding: "3px 8px", borderRadius: 4,
            }}>
              {job.company || "Company"}
            </span>
            {job.copiedFromUsername && (
              <span style={{
                color: "#94a3b8",
                fontFamily: "Consolas, Monaco, 'Courier New', monospace",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                letterSpacing: "0.02em"
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
                <span>from @{job.copiedFromUsername}</span>
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink, #201d1d)", margin: 0, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
            {job.role || "Job Role"}
          </h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {variant !== "kanban" && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "4px 10px",
              borderRadius: 20, border: `1px solid ${cfg.border}`,
              color: cfg.color, background: "white", whiteSpace: "nowrap",
            }}>
              {cfg.label}
            </span>
          )}
          {job.ctc && job.ctc !== "N/A" && (
            <span style={{
              background: "#f0faf4", border: "1px solid #b7eb8f",
              color: "#237804", fontSize: 11, fontWeight: 700,
              padding: "3px 9px", borderRadius: 4,
            }}>
              ₹ {job.ctc}
            </span>
          )}
          {job.ctc === "N/A" && (
            <span style={{
              background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)",
              color: "var(--mute,#686262)", fontSize: 11, fontWeight: 600,
              padding: "3px 9px", borderRadius: 4,
            }}>
              CTC N/A
            </span>
          )}
        </div>
      </div>

      {/* ── Meta Chips ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        <span
          className="shrink-hide"
          style={instagram
            ? {
                background: "linear-gradient(135deg,#fff1f2,#ffe4e6)",
                border: "1px solid #fecdd3",
                color: "#be123c",
                fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35,
              }
            : {
                background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)",
                color: "var(--body,#423e3e)", fontSize: 11, fontWeight: 600,
                padding: "4px 9px", borderRadius: 4, lineHeight: 1.35,
              }}
        >
          {instagram ? "Instagram" : `source: ${platform}`}
        </span>
        {job.entryMode === "quick" && !instagram && (
          <span style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            quick entry
          </span>
        )}
        {job.employmentType && (
          <span style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            {employmentTypeLabel(job)}
          </span>
        )}
        {job.employmentType === "internship" && job.internshipMonths && (
          <span style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#6d28d9", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            {/^\d+(\.\d+)?$/.test(job.internshipMonths.trim())
              ? `${job.internshipMonths} mo`
              : job.internshipMonths}
          </span>
        )}
        {job.employmentType === "internship" && job.ppo && (
          <span style={{
            background: job.ppo === "yes" ? "#f0faf4" : "#fafaf9",
            border: job.ppo === "yes" ? "1px solid #b7eb8f" : "1px solid #d6d3d1",
            color: job.ppo === "yes" ? "#1a7a3c" : "#78716c",
            fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35,
          }}>
            PPO: {job.ppo === "yes" ? "yes" : job.ppo === "no" ? "no" : job.ppo === "maybe" ? "maybe" : "not sure"}
          </span>
        )}
        {reelUrl && (
          <a href={reelUrl} target="_blank" rel="noopener noreferrer" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35, textDecoration: "none" }}>
            Reel ↗
          </a>
        )}
        {siteUrl && (
          <a href={siteUrl} target="_blank" rel="noopener noreferrer" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35, textDecoration: "none" }}>
            Site ↗
          </a>
        )}
        {phoneHref && (
          <a href={phoneHref} style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35, textDecoration: "none" }}>
            {job.contactPhone}
          </a>
        )}
        {job.notes && (
          <span style={{ background: "#fafaf9", border: "1px solid #e7e5e4", color: "#57534e", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.45, maxWidth: "100%" }}>
            {job.notes.length > 120 ? `${job.notes.slice(0, 120)}…` : job.notes}
          </span>
        )}
        {job.location && (
          <span style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            ⌖ {job.location}
          </span>
        )}
        {job.batch?.length > 0 && (
          <span className="shrink-hide" style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.45, maxWidth: "100%", flex: "1 1 100%" }}>
            batch: {job.batch.join(", ")}
          </span>
        )}
        {job.bond && (
          <span className="shrink-hide" style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            bond: {job.bond}
          </span>
        )}
        {job.lastDate && (
          <span className={dateClass(job.lastDate)} style={{ border: "1px solid var(--hairline,#e2dede)", fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            ⏱ {formatDate(job.lastDate)}
          </span>
        )}
        {job.appliedAt && (
          <span style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            applied {daysApplied === 0 ? "today" : `${daysApplied}d ago`}
          </span>
        )}
        {status === "cancelled" && (
          <span style={{ background: "#fafaf9", border: "1px solid #d6d3d1", color: "#78716c", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            why: {job.cancelReason || "—"}
          </span>
        )}
        {WALK_IN_ENABLED && onRoute && (
          <span style={{ background: "#fff7ed", border: "1px solid #fdba74", color: "#c2410c", fontSize: 11, padding: "4px 9px", borderRadius: 4, lineHeight: 1.35 }}>
            on route
          </span>
        )}
      </div>

      {/* ── 3-Day Reminder Banner ── */}
      {showReminder && (
        <div style={{
          background: "#f5f3ff", border: "1.5px solid #c4b5fd",
          borderRadius: 8, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9", marginBottom: 10, lineHeight: 1.4 }}>
            ⏰ Applied {daysApplied} din pehle — Gmail / messages check karo, unka response aaya kya?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => dismissReminder("no_response")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#ede9fe", border: "1px solid #c4b5fd", color: "#6d28d9", fontFamily: "inherit" }}
            >
              No, response nahi aaya yet
            </button>
            <button
              onClick={() => dismissReminder("selected")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e", fontFamily: "inherit" }}
            >
              🎉 Haan, selected ho gaya!
            </button>
            <button
              onClick={() => dismissReminder("rejected")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontFamily: "inherit" }}
            >
              Rejected ho gaya
            </button>
          </div>
        </div>
      )}

      {/* ── Action Status Buttons (owner only) ── */}
      {isOwner && status !== "rejected" && status !== "selected" && status !== "cancelled" && variant !== "kanban" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {status === "pending" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={(e) => { e.stopPropagation(); setStatus("applied"); }}
                disabled={updating}
                style={{ fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 5, cursor: "pointer", background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d", fontFamily: "inherit", lineHeight: 1.2 }}
              >
                ✓<span className="shrink-hide"> Applied</span>
              </button>
              <button
                disabled
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 12, padding: "7px 14px", borderRadius: 5, background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#b91c1c", opacity: 0.6, fontFamily: "inherit", lineHeight: 1.2 }}
              >
                ✗<span className="shrink-hide"> Not Applied</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowCancelReason(true); }}
                disabled={updating}
                style={{ fontSize: 12, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#fafaf9", border: "1px solid #d6d3d1", color: "#78716c", fontFamily: "inherit", lineHeight: 1.2 }}
              >
                Cancelled ⊘
              </button>
            </div>
          )}
          {(status === "applied" || status === "no_response" || status === "in_progress") && (
            <>
              <div style={{ fontSize: 12, color: status === "no_response" ? "#7c3aed" : "var(--mute,#686262)", lineHeight: 1.4 }}>
                <span className="shrink-hide">{status === "no_response" ? "Still waiting… update status →" : "Status update karo agar response aaye →"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={(e) => { e.stopPropagation(); setStatus("in_progress"); }} disabled={updating} style={{ fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", fontFamily: "inherit", lineHeight: 1.2 }}>
                  <span className="shrink-hide">Pending </span>⏳
                </button>
                <button onClick={(e) => { e.stopPropagation(); setStatus("selected"); }} disabled={updating} style={{ fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e", fontFamily: "inherit", lineHeight: 1.2 }}>
                  <span className="shrink-hide">Selected </span>🎉
                </button>
                <button onClick={(e) => { e.stopPropagation(); setStatus("rejected"); }} disabled={updating} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontFamily: "inherit", lineHeight: 1.2 }}>
                  <span className="shrink-hide">Rejected </span>❌
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowCancelReason(true); }} disabled={updating} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 5, cursor: "pointer", background: "#fafaf9", border: "1px solid #d6d3d1", color: "#78716c", fontFamily: "inherit", lineHeight: 1.2 }}>
                  <span className="shrink-hide">Cancelled </span>⊘
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${cfg.border}`,
        marginTop: 2,
        paddingTop: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div className="shrink-hide" style={{ fontSize: 11, color: "var(--mute,#686262)", display: "flex", alignItems: "center", gap: 4, lineHeight: 1.4 }}>
          {job.copiedFromUsername ? (
            <span style={{
              color: "#94a3b8",
              fontFamily: "Consolas, Monaco, 'Courier New', monospace",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>
              <span>from @{job.copiedFromUsername}</span>
            </span>
          ) : (
            `added by @${job.ownerUsername}`
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {WALK_IN_ENABLED && isOwner && (
            <button
              onClick={toggleRoute}
              disabled={routeBusy}
              style={{
                ...footerBtnBase,
                background: onRoute ? "#fff7ed" : "transparent",
                color: onRoute ? "#c2410c" : "var(--ink,#201d1d)",
                border: onRoute ? "1px solid #fdba74" : "1px solid var(--hairline,#e2dede)",
                opacity: routeBusy ? 0.65 : 1,
              }}
            >
              {onRoute ? "On Route ✓" : "+ Route"}
            </button>
          )}
          {safeExternalUrl(job.applyLink) && (
            <a href={safeExternalUrl(job.applyLink)!} target="_blank" rel="noopener noreferrer"
              style={{
                ...footerBtnBase,
                background: "var(--ink,#201d1d)",
                color: "var(--canvas,#fdfcfc)",
                border: "1px solid var(--ink,#201d1d)",
                textDecoration: "none",
                fontWeight: 700,
              }}
              onClick={(e) => { e.stopPropagation(); if (isOwner && status === "pending") setStatus("applied"); }}
            >
              <span className="shrink-hide">Open Link </span>↗
            </a>
          )}
          {!job.applyLink?.trim() && (
            <a
              href={`/job?id=${encodeURIComponent(job.id)}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                ...footerBtnBase,
                background: "transparent",
                color: "var(--ink,#201d1d)",
                border: "1px solid var(--hairline,#e2dede)",
                textDecoration: "none",
              }}
            >
              Details →
            </a>
          )}
          {showCopy && !isOwner && (
            <button onClick={(e) => { e.stopPropagation(); handleCopy(); }} disabled={copying || hasCopied}
              style={{
                ...footerBtnBase,
                background: hasCopied ? "#f0faf4" : "#fff",
                color: hasCopied ? "#1a7a3c" : "var(--ink,#201d1d)",
                border: hasCopied ? "1px solid #b7eb8f" : "1px solid var(--ink,#201d1d)",
                cursor: (copying || hasCopied) ? "default" : "pointer",
              }}
            >
              {copying ? "..." : hasCopied ? <><span className="shrink-hide">Copied </span>✓</> : <>+<span className="shrink-hide"> Copy Job</span></>}
            </button>
          )}
          {isOwner && (
            <button
              onClick={openEdit}
              style={{
                ...footerBtnBase,
                background: "transparent",
                color: "var(--ink,#201d1d)",
                border: "1px solid var(--hairline,#e2dede)",
              }}
            >
              Edit
            </button>
          )}
          {isOwner && onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
              style={{
                ...footerBtnBase,
                background: "transparent",
                color: "#c0392b",
                border: "1px solid #e0a8a8",
              }}
            >
              ✕<span className="shrink-hide"> Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
