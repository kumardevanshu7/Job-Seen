import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { copyJob, getPermission, updateJobStatus } from "../../lib/firestore";
import type { JobCard as JobCardType, JobStatus } from "../../lib/firestore";
import { showToast } from "../ui/Toast";
import { serverTimestamp } from "firebase/firestore";

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
  pending:     { label: "Not Applied",       color: "#c0392b", bg: "#fff5f5", border: "#f5c6c6" },
  applied:     { label: "Applied ✓",         color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  in_progress: { label: "Pending ⏳",        color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  no_response: { label: "No Response Yet",   color: "#7c3aed", bg: "#faf5ff", border: "#d8b4fe" },
  rejected:    { label: "Rejected",          color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
  selected:    { label: "🎉 Selected!",      color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
};

const platformShort: Record<string, string> = {
  "Naukri.com":       "naukri",
  "LinkedIn":         "linkedin",
  "Company Website":  "website",
  "Referral":         "referral",
  "Others":           "other",
};

export default function JobCard({ job, showCopy = true, isOwner = false, onDelete, onClick, index = 0, draggable, onDragStart, onDragEnd, variant = "default" }: Props) {
  const auth = useStore($auth);
  const [copying, setCopying] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<JobStatus>(job.status ?? "pending");

  const status = localStatus;
  const cfg = STATUS_CONFIG[status];
  const daysApplied = daysSince(job.appliedAt);
  const showReminder = isOwner
    && status === "applied"
    && daysApplied >= 3
    && !job.reminderDismissedAt;

  const platform = job.appliedVia === "Others"
    ? (job.appliedViaOther || "other")
    : (platformShort[job.appliedVia] ?? job.appliedVia?.toLowerCase());

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

  async function setStatus(newStatus: JobStatus) {
    if (!isOwner) return;
    setUpdating(true);
    try {
      const extra: any = {};
      if (newStatus === "applied") extra.appliedAt = serverTimestamp();
      await updateJobStatus(job.id, newStatus, extra);
      setLocalStatus(newStatus);
      showToast(
        newStatus === "applied"   ? "Marked as Applied! ✓" :
        newStatus === "selected"  ? "Congratulations! 🎉" :
        newStatus === "rejected"  ? "Marked as Rejected." :
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
      // Also save dismissedAt so reminder resets for next check
      await updateJobStatus(job.id, "no_response", { reminderDismissedAt: serverTimestamp() });
    }
  }

  return (
    <div
      className="job-card"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onClick && onClick(job)}
      style={{
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        borderRadius: variant === "kanban" ? 8 : 10,
        padding: variant === "kanban" ? 14 : 20,
        display: "flex",
        flexDirection: "column",
        gap: variant === "kanban" ? 12 : 16,
        position: "relative",
        transition: "all 0.2s ease",
        cursor: draggable ? "grab" : (onClick ? "pointer" : "default"),
      }}
    >
      {/* ── Header Row ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.06em", background: "var(--ink, #201d1d)",
              color: "var(--canvas, #fdfcfc)", padding: "2px 7px", borderRadius: 3,
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
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink, #201d1d)", margin: 0, lineHeight: 1.3 }}>
            {job.role || "Job Role"}
          </h3>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {/* Status Badge */}
          {variant !== "kanban" && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px",
              borderRadius: 20, border: `1px solid ${cfg.border}`,
              color: cfg.color, background: "white", whiteSpace: "nowrap",
            }}>
              {cfg.label}
            </span>
          )}
          {/* CTC */}
          {job.ctc && (
            <span style={{
              background: "#f0faf4", border: "1px solid #b7eb8f",
              color: "#237804", fontSize: 11, fontWeight: 700,
              padding: "2px 8px", borderRadius: 4,
            }}>
              ₹ {job.ctc}
            </span>
          )}
        </div>
      </div>

      {/* ── Meta Chips ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span className="shrink-hide" style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 3 }}>
          source: {platform}
        </span>
        {job.location && (
          <span style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "3px 8px", borderRadius: 3 }}>
            ⌖ {job.location}
          </span>
        )}
        {job.batch?.length > 0 && (
          <span className="shrink-hide" style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "3px 8px", borderRadius: 3 }}>
            batch: {job.batch.join(", ")}
          </span>
        )}
        {job.bond && (
          <span className="shrink-hide" style={{ background: "#f5f3f3", border: "1px solid var(--hairline,#e2dede)", color: "var(--body,#423e3e)", fontSize: 11, padding: "3px 8px", borderRadius: 3 }}>
            bond: {job.bond}
          </span>
        )}
        {job.lastDate && (
          <span className={dateClass(job.lastDate)} style={{ border: "1px solid var(--hairline,#e2dede)", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 3 }}>
            ⏱ {formatDate(job.lastDate)}
          </span>
        )}
        {job.appliedAt && (
          <span style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 11, padding: "3px 8px", borderRadius: 3 }}>
            applied {daysApplied === 0 ? "today" : `${daysApplied}d ago`}
          </span>
        )}
      </div>

      {/* ── 3-Day Reminder Banner ── */}
      {showReminder && (
        <div style={{
          background: "#f5f3ff", border: "1.5px solid #c4b5fd",
          borderRadius: 6, padding: "12px 14px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6d28d9", marginBottom: 8 }}>
            ⏰ Applied {daysApplied} din pehle — Gmail / messages check karo, unka response aaya kya?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => dismissReminder("no_response")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 4, cursor: "pointer", background: "#ede9fe", border: "1px solid #c4b5fd", color: "#6d28d9", fontFamily: "inherit" }}
            >
              No, response nahi aaya yet
            </button>
            <button
              onClick={() => dismissReminder("selected")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 4, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e", fontFamily: "inherit" }}
            >
              🎉 Haan, selected ho gaya!
            </button>
            <button
              onClick={() => dismissReminder("rejected")}
              disabled={updating}
              style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 4, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontFamily: "inherit" }}
            >
              Rejected ho gaya
            </button>
          </div>
        </div>
      )}

      {/* ── Action Status Buttons (owner only) ── */}
      {isOwner && status !== "rejected" && status !== "selected" && variant !== "kanban" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {status === "pending" && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setStatus("applied"); }}
                disabled={updating}
                style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 4, cursor: "pointer", background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d", fontFamily: "inherit" }}
              >
                ✓<span className="shrink-hide"> Applied</span>
              </button>
              <button
                disabled
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 12, padding: "6px 14px", borderRadius: 4, background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#b91c1c", opacity: 0.6, fontFamily: "inherit" }}
              >
                ✗<span className="shrink-hide"> Not Applied</span>
              </button>
            </>
          )}
          {(status === "applied" || status === "no_response" || status === "in_progress") && (
            <div style={{ fontSize: 12, color: status === "no_response" ? "#7c3aed" : "var(--mute,#686262)" }}>
              <span className="shrink-hide">{status === "no_response" ? "Still waiting... →" : "Status update karo agar response aaye →"}</span>
              <button onClick={(e) => { e.stopPropagation(); setStatus("in_progress"); }} disabled={updating} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", fontFamily: "inherit" }}>
                <span className="shrink-hide">Pending </span>⏳
              </button>
              <button onClick={(e) => { e.stopPropagation(); setStatus("selected"); }} disabled={updating} style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e", fontFamily: "inherit" }}>
                <span className="shrink-hide">Selected </span>🎉
              </button>
              <button onClick={(e) => { e.stopPropagation(); setStatus("rejected"); }} disabled={updating} style={{ marginLeft: 6, fontSize: 12, padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontFamily: "inherit" }}>
                <span className="shrink-hide">Rejected </span>❌
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        borderTop: `1px solid ${cfg.border}`, paddingTop: 12,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div className="shrink-hide" style={{ fontSize: 11, color: "var(--mute,#686262)", display: "flex", alignItems: "center", gap: 4 }}>
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
        <div style={{ display: "flex", gap: 8 }}>
          <a href={job.applyLink} target="_blank" rel="noopener noreferrer"
            style={{ background: "var(--ink,#201d1d)", color: "var(--canvas,#fdfcfc)", padding: "6px 14px", borderRadius: 3, fontSize: 12, fontWeight: 700, textDecoration: "none" }}
            onClick={(e) => { e.stopPropagation(); if (isOwner && status === "pending") setStatus("applied"); }}
          >
            <span className="shrink-hide">Open Link </span>↗
          </a>
          {showCopy && !isOwner && (
            <button onClick={(e) => { e.stopPropagation(); handleCopy(); }} disabled={copying || hasCopied}
              style={{ background: hasCopied ? "#f0faf4" : "#fff", color: hasCopied ? "#1a7a3c" : "var(--ink,#201d1d)", border: hasCopied ? "1px solid #b7eb8f" : "1px solid var(--ink,#201d1d)", padding: "5px 12px", borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: (copying || hasCopied) ? "default" : "pointer" }}
            >
              {copying ? "..." : hasCopied ? <><span className="shrink-hide">Copied </span>✓</> : <>+<span className="shrink-hide"> Copy Job</span></>}
            </button>
          )}
          {isOwner && onDelete && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(job.id); }}
              style={{ background: "transparent", color: "#c0392b", border: "1px solid #e0a8a8", padding: "5px 10px", borderRadius: 3, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              ✕<span className="shrink-hide"> Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
