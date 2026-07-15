import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth, setAuthState } from "../../stores/authStore";
import {
  getJobById,
  deleteJob,
  updateJobStatus,
  setUserDeletePin,
  verifyUserDeletePin,
  type JobCard as JobCardType,
  type JobStatus,
} from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";
import DeletePinModal from "../ui/DeletePinModal";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

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

function jobIdFromPath(): string {
  if (typeof window === "undefined") return "";
  const parts = window.location.pathname.split("/").filter(Boolean);
  // /jobs/<id>
  return parts[0] === "jobs" ? (parts[1] || "") : "";
}

function toDate(d: any): Date | null {
  if (!d) return null;
  if (d.toDate) return d.toDate();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLong(d: any): string {
  const date = toDate(d);
  if (!date) return "—";
  return date.toLocaleString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDay(d: any): string {
  const date = toDate(d);
  if (!date) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function employmentLabel(t?: string) {
  if (t === "full_time") return "Full-time job";
  if (t === "part_time") return "Part-time";
  if (t === "internship") return "Internship";
  return "—";
}

function ppoLabel(p?: string) {
  if (p === "yes") return "Yes — PPO de rahe";
  if (p === "no") return "No PPO";
  if (p === "maybe") return "Maybe / based on performance";
  return "—";
}

function buildShareText(job: JobCardType): string {
  const lines = [
    "JobSeen — Job Details",
    "=====================",
    "",
    `Company: ${job.company || "—"}`,
    `Role: ${job.role || "—"}`,
    `Type: ${employmentLabel(job.employmentType)}`,
    `Location: ${job.location || "—"}`,
    `CTC / Stipend: ${job.ctc || "—"}`,
    `Source: ${job.appliedVia === "Others" ? (job.appliedViaOther || "Others") : (job.appliedVia || "—")}`,
    `Apply link: ${job.applyLink || "—"}`,
    `Batch: ${Array.isArray(job.batch) && job.batch.length ? job.batch.join(", ") : "—"}`,
    `Bond: ${job.bond || "—"}`,
    `Last date: ${formatDay(job.lastDate)}`,
    `Status: ${STATUS_CONFIG[job.status ?? "pending"]?.label ?? job.status ?? "—"}`,
    `Added on: ${formatLong(job.createdAt)}`,
    `Applied on: ${job.appliedAt ? formatLong(job.appliedAt) : "Not applied yet"}`,
    `Added by: @${job.ownerUsername || "—"}`,
  ];
  if (job.employmentType === "internship") {
    lines.push(`Internship duration: ${job.internshipMonths ? `${job.internshipMonths} months` : "—"}`);
    lines.push(`PPO: ${ppoLabel(job.ppo)}`);
  }
  if (job.jobType === "walkin") {
    lines.push(`Nearest metro: ${job.nearestMetro || "—"}`);
    lines.push(`Map link: ${job.mapLink || "—"}`);
  }
  if (job.cancelReason) lines.push(`Cancel reason: ${job.cancelReason}`);
  if (job.copiedFromUsername) lines.push(`Copied from: @${job.copiedFromUsername}`);
  lines.push("", "— shared via JobSeen");
  return lines.join("\n");
}

function DetailRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  return (
    <div style={{
      border: "1.5px solid var(--hairline)",
      borderRadius: 8,
      padding: "14px 16px",
      background: "var(--canvas)",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "var(--mute)",
        letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 6,
      }}>
        {label}
      </div>
      {href && value && value !== "—" ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", wordBreak: "break-all" }}>
          {value}
        </a>
      ) : (
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", wordBreak: "break-word" }}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}

export default function JobDetailsView() {
  const auth = useStore($auth);
  const [job, setJob] = useState<JobCardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [jobId, setJobId] = useState(() => jobIdFromPath());

  useEffect(() => {
    const sync = () => setJobId(jobIdFromPath());
    document.addEventListener("astro:page-load", sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => {
      document.removeEventListener("astro:page-load", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const hasDeletePin = !!auth.profile?.deletePinHash;
  const isOwner = !!(auth.user && job && auth.user.uid === job.ownerUID);
  const status = (job?.status ?? "pending") as JobStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  useEffect(() => {
    if (!jobId || jobId === "_shell") {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const data = await getJobById(jobId);
        if (cancelled) return;
        if (!data) setNotFound(true);
        else setJob(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  async function setStatus(next: JobStatus) {
    if (!job || !isOwner) return;
    setUpdating(true);
    try {
      await updateJobStatus(job.id, next);
      setJob({ ...job, status: next });
      showToast(`Status: ${STATUS_CONFIG[next].label}`, "success");
    } catch {
      showToast("Failed to update status.", "error");
    } finally {
      setUpdating(false);
    }
  }

  function downloadDetails() {
    if (!job) return;
    const text = buildShareText(job);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (job.company || job.role || "job").replace(/[^\w\-]+/g, "_").slice(0, 40);
    a.href = url;
    a.download = `JobSeen_${safe}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Details downloaded — dost ko share kar sakte ho.", "success");
  }

  async function confirmDeleteWithPin(pin: string) {
    if (!job || !auth.user) return;
    if (!hasDeletePin) {
      const hash = await setUserDeletePin(auth.user.uid, pin);
      setAuthState({
        profile: auth.profile ? { ...auth.profile, deletePinHash: hash } : auth.profile,
      });
    } else {
      const ok = await verifyUserDeletePin(auth.user.uid, pin, auth.profile?.deletePinHash);
      if (!ok) throw new Error("Galat code. Dobara try karo.");
    }
    await deleteJob(job.id);
    showToast("Job removed.", "info");
    window.location.href = "/";
  }

  if (loading) return <><ToastProvider /><ShimmerSkeleton variant="jobs" count={2} /></>;

  if (notFound || !job) {
    return (
      <>
        <ToastProvider />
        <a href="/" style={{ fontSize: 13, color: "var(--mute)", textDecoration: "none" }}>← Inbox</a>
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-state-title">Job not found</div>
          <p>Ye listing delete ho chuki hai ya link galat hai.</p>
        </div>
      </>
    );
  }

  const source = job.appliedVia === "Others"
    ? (job.appliedViaOther || "Others")
    : (job.appliedVia || "—");

  return (
    <>
      <ToastProvider />
      {deleteOpen && (
        <DeletePinModal
          mode={hasDeletePin ? "verify" : "setup"}
          confirmLabel={hasDeletePin ? "Delete" : "Set & Delete"}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={confirmDeleteWithPin}
        />
      )}

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <a href="/" style={{ fontSize: 13, color: "var(--mute)", textDecoration: "none" }}>← Inbox</a>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              <span style={{
                fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", background: "var(--ink)",
                color: "var(--canvas)", padding: "4px 10px", borderRadius: 4,
              }}>
                {job.company || "Company"}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: cfg.color, background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                padding: "3px 10px", borderRadius: 999,
              }}>
                {cfg.label}
              </span>
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{job.role || "Job Role"}</h1>
            <p className="page-subtitle">
              Full details · {formatDay(job.createdAt)}
              {job.appliedAt ? ` · applied ${formatDay(job.appliedAt)}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={downloadDetails}>
              ↓ Download
            </button>
            {job.applyLink && (
              <a href={job.applyLink} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ textDecoration: "none" }}>
                Open Link ↗
              </a>
            )}
            {isOwner && (
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(true)} style={{ color: "#c0392b", borderColor: "#e0a8a8" }}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        maxWidth: 820,
        marginBottom: 20,
      }}>
        <DetailRow label="Role type" value={employmentLabel(job.employmentType)} />
        <DetailRow label="Location" value={job.location || "—"} />
        <DetailRow label="CTC / Stipend" value={job.ctc || "—"} />
        <DetailRow label="Source" value={source} />
        <DetailRow label="Eligible batch" value={Array.isArray(job.batch) && job.batch.length ? job.batch.join(", ") : "—"} />
        <DetailRow label="Bond" value={job.bond || "—"} />
        <DetailRow label="Last date" value={formatDay(job.lastDate)} />
        <DetailRow label="Added on" value={formatLong(job.createdAt)} />
        <DetailRow label="Applied on" value={job.appliedAt ? formatLong(job.appliedAt) : "Not applied yet"} />
        <DetailRow label="Added by" value={`@${job.ownerUsername}`} />
        {job.employmentType === "internship" && (
          <>
            <DetailRow label="Internship duration" value={job.internshipMonths ? `${job.internshipMonths} months` : "—"} />
            <DetailRow label="PPO" value={ppoLabel(job.ppo)} />
          </>
        )}
        {(job.jobType === "walkin" || job.mapLink || job.nearestMetro) && (
          <>
            <DetailRow label="Nearest metro" value={job.nearestMetro || "—"} />
            <DetailRow label="Map link" value={job.mapLink || "—"} href={job.mapLink || undefined} />
          </>
        )}
        {job.cancelReason && <DetailRow label="Cancel reason" value={job.cancelReason} />}
        {job.copiedFromUsername && <DetailRow label="Copied from" value={`@${job.copiedFromUsername}`} />}
        <DetailRow label="Apply link" value={job.applyLink || "—"} href={job.applyLink || undefined} />
      </div>

      {isOwner && status !== "rejected" && status !== "selected" && status !== "cancelled" && (
        <div className="form-card" style={{ maxWidth: 820, marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", letterSpacing: "0.05em", marginBottom: 12 }}>
            UPDATE STATUS
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {status === "pending" && (
              <button type="button" disabled={updating} onClick={() => setStatus("applied")}
                style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 4, cursor: "pointer", background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d", fontFamily: "inherit" }}>
                ✓ Applied
              </button>
            )}
            {(status === "applied" || status === "no_response" || status === "in_progress") && (
              <>
                <button type="button" disabled={updating} onClick={() => setStatus("in_progress")}
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 4, cursor: "pointer", background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309", fontFamily: "inherit" }}>
                  Pending ⏳
                </button>
                <button type="button" disabled={updating} onClick={() => setStatus("selected")}
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 4, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e", fontFamily: "inherit" }}>
                  Selected 🎉
                </button>
                <button type="button" disabled={updating} onClick={() => setStatus("rejected")}
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 4, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569", fontFamily: "inherit" }}>
                  Rejected
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
