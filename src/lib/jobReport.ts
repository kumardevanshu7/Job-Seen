import type { JobCard, JobStatus } from "./firestore";

const STATUS_META: Record<JobStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:        { label: "Not Applied",   color: "#c0392b", bg: "#fff5f5", border: "#f5c6c6" },
  applied:        { label: "Applied",        color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  in_progress:    { label: "Pending",        color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  no_response:    { label: "No Response",    color: "#7c3aed", bg: "#faf5ff", border: "#d8b4fe" },
  rejected:       { label: "Rejected",       color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
  selected:       { label: "Selected",       color: "#92400e", bg: "#fef3c7", border: "#fcd34d" },
  interview_done: { label: "Interview done", color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  fraud:          { label: "Fraud",          color: "#9b1c1c", bg: "#fef2f2", border: "#fecaca" },
  cancelled:      { label: "Cancelled",      color: "#78716c", bg: "#fafaf9", border: "#d6d3d1" },
};

function millisOf(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isSameDay(millis: number, ref: Date): boolean {
  if (!millis) return false;
  const d = new Date(millis);
  return d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth()
    && d.getDate() === ref.getDate();
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Jobs with any activity today: created, applied, or status changed today. */
export function jobsWithTodayActivity(jobs: JobCard[], today = new Date()): JobCard[] {
  return jobs
    .filter(job => (job.jobType ?? "online") !== "walkin")
    .filter(job =>
      isSameDay(millisOf(job.statusUpdatedAt), today)
      || isSameDay(millisOf(job.appliedAt), today)
      || isSameDay(millisOf(job.createdAt), today)
    )
    .sort((a, b) => {
      const at = Math.max(millisOf(a.statusUpdatedAt), millisOf(a.appliedAt), millisOf(a.createdAt));
      const bt = Math.max(millisOf(b.statusUpdatedAt), millisOf(b.appliedAt), millisOf(b.createdAt));
      return bt - at;
    });
}

function activityLabel(job: JobCard, today: Date): string {
  if (isSameDay(millisOf(job.statusUpdatedAt), today)) return "Status changed";
  if (isSameDay(millisOf(job.appliedAt), today)) return "Applied";
  if (isSameDay(millisOf(job.createdAt), today)) return "Added";
  return "Updated";
}

export function buildDailyJobReportHtml(jobs: JobCard[], username: string, today = new Date()): string {
  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const rows = jobs.map((job, index) => {
    const meta = STATUS_META[(job.status ?? "pending") as JobStatus] ?? STATUS_META.pending;
    return `<tr>
      <td class="num">${index + 1}</td>
      <td><span class="company">${esc(job.company || "—")}</span><span class="role">${esc(job.role || "")}</span></td>
      <td>${esc(job.location || "—")}</td>
      <td><span class="act">${esc(activityLabel(job, today))}</span></td>
      <td><span class="badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.border}">${esc(meta.label)}</span></td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>JobSeen Daily Report · ${esc(dateLabel)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'JetBrains Mono','IBM Plex Mono',ui-monospace,Consolas,monospace;background:#f1eeee;color:#201d1d;padding:28px 16px;line-height:1.5;}
  .wrap{max-width:820px;margin:0 auto;background:#fdfcfc;border:1.5px solid #e2dede;border-radius:14px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.08);}
  .head{display:flex;align-items:center;gap:14px;padding:22px 24px;background:#201d1d;color:#fdfcfc;}
  .head img{width:42px;height:42px;object-fit:contain;}
  .head h1{font-size:18px;font-weight:800;letter-spacing:.02em;}
  .head p{font-size:12px;color:#c9c4d8;margin-top:2px;}
  .meta{display:flex;flex-wrap:wrap;gap:10px 24px;padding:16px 24px;border-bottom:1px solid #eee;font-size:12px;color:#6e6e73;}
  .meta b{color:#201d1d;}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:11px 14px;font-size:12px;border-bottom:1px solid #efe9e9;vertical-align:top;}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8a8585;background:#faf7f7;}
  td.num{color:#a8a2a2;width:34px;}
  .company{display:block;font-weight:700;font-size:13px;}
  .role{display:block;color:#6e6e73;font-size:11px;margin-top:2px;}
  .act{font-size:11px;color:#6e6e73;}
  .badge{display:inline-block;padding:3px 9px;border-radius:999px;border:1px solid;font-size:11px;font-weight:700;}
  .foot{padding:16px 24px;font-size:11px;color:#8a8585;text-align:center;border-top:1px solid #eee;}
  @media print{body{background:#fff;padding:0;}.wrap{border:none;box-shadow:none;}}
</style></head>
<body><div class="wrap">
  <div class="head">
    <img src="https://job-seen.vercel.app/logo/android-chrome-192x192.png" alt="JobSeen" onerror="this.style.display='none'" />
    <div><h1>Jobs — Daily Activity Report</h1><p>JobSeen by Arigato Labs</p></div>
  </div>
  <div class="meta">
    <span><b>Date:</b> ${esc(dateLabel)}</span>
    <span><b>Prepared by:</b> @${esc(username)}</span>
    <span><b>Today's activity:</b> ${jobs.length}</span>
  </div>
  <table>
    <thead><tr><th>#</th><th>Company / Role</th><th>Location</th><th>Activity</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">Generated ${esc(new Date().toLocaleString("en-IN"))} · Tip: browser me Ctrl+P → “Save as PDF”</div>
</div></body></html>`;
}
