import type { JobCard, JobStatus, BruteForceJob, BruteForceCallOutcome, BruteForceDecision } from "./firestore";

const BRUTE_STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_called:            { label: "Not called",            color: "#4b5563", bg: "#f3f4f6", border: "#d1d5db" },
  no_response:           { label: "Ringing but no response", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  wrong_number:          { label: "Wrong number",          color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  incoming_not_allowed:  { label: "Incoming not allowed",  color: "#9f1239", bg: "#fff1f2", border: "#fda4af" },
  no_vacancies:          { label: "Call picked but no vacancies there", color: "#7c2d12", bg: "linear-gradient(90deg,#dcfce7,#fee2e2)", border: "#fbcfe8" },
  resume_sent:           { label: "Resume sent (hold)",    color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
  success:               { label: "Interview scheduled",   color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  selected:              { label: "Selected",              color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  rejected:              { label: "Rejected",              color: "#7f1d1d", bg: "#fef2f2", border: "#fca5a5" },
};

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

/** Jobs whose status was changed today. */
export function jobsWithTodayActivity(jobs: JobCard[], today = new Date()): JobCard[] {
  return jobs
    .filter(job => (job.jobType ?? "online") !== "walkin")
    .filter(job => isSameDay(millisOf(job.statusUpdatedAt), today))
    .sort((a, b) => millisOf(b.statusUpdatedAt) - millisOf(a.statusUpdatedAt));
}

/** Brute Force leads whose status changed today (not freshly created, not-yet-called). */
export function bruteLeadsWithTodayActivity(leads: BruteForceJob[], today = new Date()): BruteForceJob[] {
  return leads
    .filter(lead =>
      isSameDay(millisOf(lead.updatedAt), today)
      && (lead.callOutcome !== "not_called" || lead.decision !== "pending")
    )
    .sort((a, b) => millisOf(b.updatedAt) - millisOf(a.updatedAt));
}

function bruteStatusKey(lead: BruteForceJob): string {
  return (lead.decision as BruteForceDecision) !== "pending"
    ? (lead.decision as string)
    : (lead.callOutcome as BruteForceCallOutcome as string);
}

function bruteStatusMeta(lead: BruteForceJob) {
  return BRUTE_STATUS_META[bruteStatusKey(lead)] ?? BRUTE_STATUS_META.not_called;
}

// Category ranking for the report — best on top, rejected always last.
const BRUTE_RANK: Record<string, number> = {
  selected: 0,
  resume_sent: 1,
  success: 2,
  no_vacancies: 3,
  incoming_not_allowed: 4,
  wrong_number: 5,
  no_response: 6,
  not_called: 7,
  rejected: 8,
};

export function buildDailyJobReportHtml(
  jobs: JobCard[],
  username: string,
  today = new Date(),
  bruteLeads: BruteForceJob[] = []
): string {
  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const total = jobs.length + bruteLeads.length;
  const rows = jobs.map((job, index) => {
    const meta = STATUS_META[(job.status ?? "pending") as JobStatus] ?? STATUS_META.pending;
    return `<tr>
      <td class="num" data-label="#">${index + 1}</td>
      <td data-label="Company"><span class="company">${esc(job.company || "—")}</span><span class="role">${esc(job.role || "")}</span></td>
      <td data-label="Location">${esc(job.location || "—")}</td>
      <td data-label="Activity"><span class="act">Status changed</span></td>
      <td data-label="Status"><span class="badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.border}">${esc(meta.label)}</span></td>
    </tr>`;
  }).join("");

  const rankedLeads = [...bruteLeads].sort((a, b) => {
    const ra = BRUTE_RANK[bruteStatusKey(a)] ?? 99;
    const rb = BRUTE_RANK[bruteStatusKey(b)] ?? 99;
    if (ra !== rb) return ra - rb;
    return millisOf(b.updatedAt) - millisOf(a.updatedAt);
  });
  const bruteRows = rankedLeads.map((lead, index) => {
    const meta = bruteStatusMeta(lead);
    const phoneCell = lead.phone
      ? `<span class="act">${esc(lead.phone)}</span> <button type="button" class="copyb" data-phone="${esc(lead.phone)}">Copy</button>`
      : `<span class="act">—</span>`;
    return `<tr>
      <td class="num" data-label="#">${index + 1}</td>
      <td data-label="Company"><span class="company">${esc(lead.company || "—")}</span><span class="role">${esc(lead.role || "")}</span></td>
      <td data-label="Location">${esc(lead.location || "—")}</td>
      <td data-label="Phone">${phoneCell}</td>
      <td data-label="Status"><span class="badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.border}">${esc(meta.label)}</span></td>
    </tr>`;
  }).join("");

  const jobsSection = jobs.length
    ? `<div class="sec">Applied / Inbox jobs (${jobs.length})</div>
       <table><thead><tr><th>#</th><th>Company / Role</th><th>Location</th><th>Activity</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  const bruteSection = bruteLeads.length
    ? `<div class="sec">Brute Force calls (${bruteLeads.length})</div>
       <table><thead><tr><th>#</th><th>Company / Role</th><th>Location</th><th>Phone</th><th>Status</th></tr></thead><tbody>${bruteRows}</tbody></table>`
    : "";

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
  .sec{padding:16px 24px 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#7c3aed;}
  .company{display:block;font-weight:700;font-size:13px;}
  .role{display:block;color:#6e6e73;font-size:11px;margin-top:2px;}
  .act{font-size:11px;color:#6e6e73;}
  .badge{display:inline-block;padding:3px 9px;border-radius:999px;border:1px solid;font-size:11px;font-weight:700;}
  .copyb{font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;padding:2px 8px;margin-left:6px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;}
  .copyb:hover{background:#eef2f7;}
  .copyb.done{background:#dcfce7;border-color:#86efac;color:#15803d;}
  .foot{padding:16px 24px;font-size:11px;color:#8a8585;text-align:center;border-top:1px solid #eee;}
  @media print{body{background:#fff;padding:0;}.wrap{border:none;box-shadow:none;}}
  .wrap,td,th,.company,.role,.act{overflow-wrap:anywhere;word-break:break-word;}
  @media (max-width:600px){
    body{padding:12px 8px;}
    .wrap{border-radius:12px;max-width:100%;}
    .head{padding:16px 14px;gap:10px;}
    .head img{width:32px;height:32px;}
    .head h1{font-size:14px;}
    .head p{font-size:11px;}
    .meta{padding:14px 14px;gap:6px 0;flex-direction:column;font-size:12px;}
    .sec{padding:16px 14px 4px;}
    table,thead,tbody,tr,td{display:block;width:100%;}
    thead{position:absolute;left:-9999px;top:-9999px;}
    tr{border:1px solid #efe9e9;border-radius:10px;margin:0 14px 12px;padding:10px 0;background:#fff;}
    td{border:none;padding:6px 14px;text-align:left;}
    td::before{content:attr(data-label);display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#a29c9c;margin-bottom:3px;}
    td.num{display:none;}
    tr{position:relative;}
    tr td:first-child+td{padding-top:12px;}
    .company{font-size:14px;}
    .role{margin-top:2px;}
    .badge{white-space:normal;}
    .foot{padding:14px 16px;}
  }
</style></head>
<body><div class="wrap">
  <div class="head">
    <img src="https://job-seen.vercel.app/logo/android-chrome-192x192.png" alt="JobSeen" onerror="this.style.display='none'" />
    <div><h1>Jobs — Daily Activity Report</h1><p>JobSeen by Arigato Labs</p></div>
  </div>
  <div class="meta">
    <span><b>Date:</b> ${esc(dateLabel)}</span>
    <span><b>Prepared by:</b> @${esc(username)}</span>
    <span><b>Today's activity:</b> ${total}</span>
  </div>
  ${jobsSection}
  ${bruteSection}
  <div class="foot">Generated ${esc(new Date().toLocaleString("en-IN"))} · Tip: browser me Ctrl+P → “Save as PDF”</div>
</div>
<script>
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.copyb');
    if (!b) return;
    var phone = b.getAttribute('data-phone') || '';
    var mark = function () { var t = b.textContent; b.textContent = 'Copied'; b.classList.add('done'); setTimeout(function () { b.textContent = t; b.classList.remove('done'); }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(phone).then(mark).catch(function () { window.prompt('Copy number:', phone); });
    } else {
      window.prompt('Copy number:', phone);
    }
  });
</script>
</body></html>`;
}
