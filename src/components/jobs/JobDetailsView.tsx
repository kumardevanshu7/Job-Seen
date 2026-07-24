import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  getJobById,
  deleteJob,
  updateJobStatus,
  type JobCard as JobCardType,
  type JobStatus,
} from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";
import ConfirmModal from "../ui/ConfirmModal";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";
import { safeExternalUrl } from "../../lib/security";

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

function jobIdFromUrl(): string {
  if (typeof window === "undefined") return "";
  const fromQuery = new URLSearchParams(window.location.search).get("id");
  if (fromQuery) return fromQuery;
  // legacy /jobs/<id> paths
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "jobs" && parts[1] && parts[1] !== "_shell") return parts[1];
  return "";
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowHtml(label: string, value: string, href?: string) {
  const safeHref = safeExternalUrl(href);
  const body = safeHref
    ? `<a href="${esc(safeHref)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`
    : esc(value);
  return `
    <div class="row">
      <div class="label">${esc(label)}</div>
      <div class="value">${body}</div>
    </div>`;
}

function buildShareHtml(job: JobCardType): string {
  const source = job.appliedVia === "Others"
    ? (job.appliedViaOther || "Others")
    : (job.appliedVia || "—");
  const batch = Array.isArray(job.batch) && job.batch.length ? job.batch.join(", ") : "—";
  const company = job.company || "Company";
  const role = job.role || "Job Role";
  const title = `${company} — ${role}`;

  let extra = "";
  if (job.employmentType === "internship") {
    extra += rowHtml("Internship duration", job.internshipMonths ? `${job.internshipMonths} months` : "—");
    extra += rowHtml("PPO", ppoLabel(job.ppo));
  }
  if (job.jobType === "walkin" || job.nearestMetro || job.mapLink) {
    extra += rowHtml("Nearest metro", job.nearestMetro || "—");
    if (job.mapLink) extra += rowHtml("Map link", job.mapLink, job.mapLink);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · JobSeen</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, Consolas, monospace;
      background: #f1eeee;
      color: #423e3e;
      padding: 28px 16px;
      line-height: 1.45;
    }
    .wrap { max-width: 560px; margin: 0 auto; }
    .company-title {
      font-size: 32px; font-weight: 800; color: #201d1d;
      letter-spacing: -0.02em; line-height: 1.15;
      margin: 0 4px 14px;
    }
    .card {
      background: #fdfcfc;
      border: 1.5px solid #e2dede;
      border-radius: 12px;
      padding: 22px 20px 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    }
    .role {
      font-size: 15px; font-weight: 600; color: #6e6e73;
      margin-bottom: 18px; line-height: 1.35;
    }
    .grid { display: grid; gap: 10px; }
    .row {
      border: 1.5px solid #e8e4e4; border-radius: 8px;
      padding: 12px 14px; background: #fdfcfc;
    }
    .label {
      font-size: 10px; font-weight: 700; color: #8a8585;
      letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 5px;
    }
    .value { font-size: 13px; font-weight: 600; color: #201d1d; word-break: break-word; }
    a {
      color: #1d4ed8; font-weight: 700; text-decoration: underline;
      text-underline-offset: 2px;
    }
    a:hover { color: #c0392b; }
    .cta {
      display: inline-block; margin-top: 16px;
      background: #201d1d; color: #fdfcfc !important;
      text-decoration: none !important;
      font-size: 13px; font-weight: 700;
      padding: 11px 16px; border-radius: 6px;
    }
    .cta:hover { background: #302c2c; color: #fdfcfc !important; }
    .product-box {
      margin-top: 14px;
      border: 1.5px solid #e2dede;
      border-radius: 10px;
      background: #fdfcfc;
      padding: 14px 16px;
      text-align: center;
    }
    .product-box .tag {
      font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
      text-transform: uppercase; color: #8a8585; margin-bottom: 6px;
    }
    .product-box .name {
      font-size: 13px; font-weight: 700; color: #201d1d; margin-bottom: 8px;
    }
    .product-box .site {
      display: inline-block;
      font-size: 12px; font-weight: 700;
      color: #1d4ed8;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 8px 12px;
      text-decoration: none;
      word-break: break-all;
    }
    .product-box .site:hover { color: #c0392b; border-color: #f5c6c6; background: #fff5f5; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="company-title">${esc(company)}</div>
    <div class="card">
      <div class="role">${esc(role)}</div>
      <div class="grid">
        ${rowHtml("Role type", employmentLabel(job.employmentType))}
        ${rowHtml("Location", job.location || "—")}
        ${rowHtml("CTC / Stipend", job.ctc || "—")}
        ${rowHtml("Source", source)}
        ${rowHtml("Eligible batch", batch)}
        ${rowHtml("Bond", job.bond || "—")}
        ${rowHtml("Last date", formatDay(job.lastDate))}
        ${rowHtml("Shared by", `@${job.ownerUsername || "—"}`)}
        ${extra}
        ${job.applyLink ? rowHtml("Apply link", job.applyLink, job.applyLink) : rowHtml("Apply link", "—")}
      </div>
      ${safeExternalUrl(job.applyLink) ? `<a class="cta" href="${esc(safeExternalUrl(job.applyLink)!)}" target="_blank" rel="noopener noreferrer">Open Apply Link ↗</a>` : ""}
    </div>
    <div class="product-box">
      <div class="tag">Shareable job card</div>
      <div class="name">This product is <strong>JobSeen</strong> by <strong>Arigato Labs</strong></div>
      <a class="site" href="https://job-seen.vercel.app/" target="_blank" rel="noopener noreferrer">https://job-seen.vercel.app/</a>
    </div>
  </div>
</body>
</html>`;
}

function DetailRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const safeHref = safeExternalUrl(href);
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
      {safeHref && value && value !== "—" ? (
        <a href={safeHref} target="_blank" rel="noopener noreferrer"
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

  const [jobId, setJobId] = useState(() => jobIdFromUrl());

  useEffect(() => {
    const sync = () => setJobId(jobIdFromUrl());
    document.addEventListener("astro:page-load", sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => {
      document.removeEventListener("astro:page-load", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const isOwner = !!(auth.user && job && auth.user.uid === job.ownerUID);
  const status = (job?.status ?? "pending") as JobStatus;
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  useEffect(() => {
    if (!jobId || jobId === "_shell") {
      setNotFound(true);
      setLoading(false);
      setJob(null);
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
    const html = buildShareHtml(job);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (job.company || job.role || "job").replace(/[^\w\-]+/g, "_").slice(0, 40);
    a.href = url;
    a.download = `JobSeen_${safe}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("HTML card downloaded — dost ko bhejo, browser me open hoga.", "success");
  }

  async function confirmDelete() {
    if (!job || !auth.user) return;
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
        <ConfirmModal
          title="Delete this job?"
          message="This permanently removes the job. Firestore verifies that only the authenticated owner can delete it."
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteOpen(false)}
          onConfirm={confirmDelete}
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
            {safeExternalUrl(job.applyLink) && (
              <a href={safeExternalUrl(job.applyLink)!} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ textDecoration: "none" }}>
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
