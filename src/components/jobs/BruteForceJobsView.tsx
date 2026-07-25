import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  addBruteForceJobToRoute,
  bruteForceRouteJobId,
  createBruteForceJob,
  createBruteForceJobs,
  recordBruteForceCallOutcome,
  rescheduleBruteForceInterview,
  setBruteForceDecision,
  subscribeToBruteForceJobs,
  subscribeToUserJobs,
  type BruteForceCallOutcome,
  type BruteForceDecision,
  type BruteForceJob,
  type BruteForceJobInput,
  type InterviewMode,
} from "../../lib/firestore";
import { safeExternalUrl } from "../../lib/security";
import { WALK_IN_ENABLED } from "../../lib/features";
import {
  deleteBruteForceJobWithAnswer,
  deleteBruteForceJobsWithAnswer,
  deletionProtectionError,
} from "../../lib/deletionProtection";
import { ToastProvider, showToast } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";
import DeletionChallengeModal from "../ui/DeletionChallengeModal";

type DisplayStatus = BruteForceCallOutcome | Exclude<BruteForceDecision, "pending">;

type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

const STATUS_STYLES: Record<DisplayStatus, StatusMeta> = {
  not_called: { label: "Not called", color: "#57534e", bg: "#f5f5f4", border: "#d6d3d1" },
  no_response: { label: "No response", color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe" },
  wrong_number: { label: "Wrong number", color: "#be123c", bg: "#fff1f2", border: "#fecdd3" },
  incoming_not_allowed: { label: "Incoming not allowed", color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  no_vacancies: { label: "No vacancies", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  success: { label: "Success — interview scheduled", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  selected: { label: "Selected", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  rejected: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
};

const OUTCOME_VALUES: BruteForceCallOutcome[] = [
  "not_called", "no_response", "wrong_number", "incoming_not_allowed", "no_vacancies", "success",
];
const OUTCOMES = OUTCOME_VALUES.map(value => ({ value, ...STATUS_STYLES[value] }));
const STATUS_LEGEND: DisplayStatus[] = [
  "not_called", "no_response", "wrong_number", "incoming_not_allowed", "no_vacancies", "success", "selected", "rejected",
];

const INITIAL_FORM = { company: "", phone: "", location: "", mapLink: "", role: "" };
const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
const MAX_IMPORT_ROWS = 100;

const IMPORT_ALIASES = {
  company: ["company", "companyName", "company_name", "company name"],
  phone: ["phone", "phoneNumber", "phone_number", "phone number"],
  location: ["location"],
  mapLink: ["mapLink", "map_link", "map link", "map"],
  role: ["role"],
} as const;

const IMPORT_KEYS: Set<string> = new Set(Object.values(IMPORT_ALIASES).flat());

function importString(
  row: Record<string, unknown>,
  aliases: readonly string[],
  label: string,
  rowNumber: number,
  optional = false
): string {
  const matchingKeys = aliases.filter(key => Object.prototype.hasOwnProperty.call(row, key));
  if (matchingKeys.length > 1) {
    throw new Error(`Row ${rowNumber}: ${label} ek se zyada keys mein diya gaya hai.`);
  }
  if (matchingKeys.length === 0) {
    if (optional) return "";
    throw new Error(`Row ${rowNumber}: ${label} missing hai.`);
  }

  const value = row[matchingKeys[0]];
  if (typeof value !== "string") {
    throw new Error(`Row ${rowNumber}: ${label} string hona chahiye.`);
  }
  const trimmed = value.trim();
  if (!optional && !trimmed) throw new Error(`Row ${rowNumber}: ${label} empty nahi ho sakta.`);
  return trimmed;
}

function parseImportRows(contents: string): BruteForceJobInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Invalid JSON file. File ka JSON syntax check karo.");
  }

  if (!Array.isArray(parsed)) throw new Error("JSON ka top level array [...] hona chahiye.");
  if (parsed.length === 0) throw new Error("JSON file mein kam se kam 1 job honi chahiye.");
  if (parsed.length > MAX_IMPORT_ROWS) throw new Error(`Ek file mein maximum ${MAX_IMPORT_ROWS} jobs import kar sakte ho.`);

  return parsed.map((value, index) => {
    const rowNumber = index + 1;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Row ${rowNumber}: har job ek JSON object honi chahiye.`);
    }
    const row = value as Record<string, unknown>;
    const unknownKey = Object.keys(row).find(key => !IMPORT_KEYS.has(key));
    if (unknownKey) throw new Error(`Row ${rowNumber}: unknown field “${unknownKey}”.`);

    const company = importString(row, IMPORT_ALIASES.company, "company", rowNumber);
    const role = importString(row, IMPORT_ALIASES.role, "role", rowNumber);
    const phone = importString(row, IMPORT_ALIASES.phone, "phone", rowNumber, true);
    const location = importString(row, IMPORT_ALIASES.location, "location", rowNumber);
    const rawMapLink = importString(row, IMPORT_ALIASES.mapLink, "map link", rowNumber);
    const mapLink = safeExternalUrl(rawMapLink);

    if (company.length > 200) throw new Error(`Row ${rowNumber}: company maximum 200 characters ho sakti hai.`);
    if (role.length > 200) throw new Error(`Row ${rowNumber}: role maximum 200 characters ho sakta hai.`);
    if (phone.length > 30) throw new Error(`Row ${rowNumber}: phone maximum 30 characters ho sakta hai.`);
    if (location.length > 300) throw new Error(`Row ${rowNumber}: location maximum 300 characters ho sakti hai.`);
    if (!mapLink) throw new Error(`Row ${rowNumber}: map link valid https:// URL hona chahiye.`);

    return { company, role, phone, location, mapLink };
  });
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: any): string {
  const millis = toMillis(value);
  if (!millis) return "—";
  return new Date(millis).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function localInputValue(value: any): string {
  const millis = toMillis(value);
  if (!millis) return "";
  const date = new Date(millis - new Date(millis).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function isSameDay(millis: number, ref: Date): boolean {
  if (!millis) return false;
  const d = new Date(millis);
  return d.getFullYear() === ref.getFullYear()
    && d.getMonth() === ref.getMonth()
    && d.getDate() === ref.getDate();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statusLabelFor(lead: BruteForceJob): { label: string; color: string; bg: string; border: string } {
  const key: DisplayStatus = lead.decision !== "pending"
    ? (lead.decision as Exclude<BruteForceDecision, "pending">)
    : lead.callOutcome;
  return STATUS_STYLES[key];
}

function buildTodayReportHtml(leads: BruteForceJob[], username: string): string {
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const rows = leads.map((lead, index) => {
    const s = statusLabelFor(lead);
    return `<tr>
      <td class="num">${index + 1}</td>
      <td><span class="company">${escapeHtml(lead.company || "—")}</span><span class="role">${escapeHtml(lead.role || "")}</span></td>
      <td>${escapeHtml(lead.location || "—")}</td>
      <td>${escapeHtml(lead.phone || "—")}</td>
      <td><span class="badge" style="color:${s.color};background:${s.bg};border-color:${s.border}">${escapeHtml(s.label)}</span></td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Brute Force Report · ${escapeHtml(dateLabel)}</title>
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
  .badge{display:inline-block;padding:3px 9px;border-radius:999px;border:1px solid;font-size:11px;font-weight:700;}
  .foot{padding:16px 24px;font-size:11px;color:#8a8585;text-align:center;border-top:1px solid #eee;}
  @media print{body{background:#fff;padding:0;}.wrap{border:none;box-shadow:none;}}
</style></head>
<body><div class="wrap">
  <div class="head">
    <img src="https://job-seen.vercel.app/logo/android-chrome-192x192.png" alt="JobSeen" onerror="this.style.display='none'" />
    <div><h1>Brute Force — Daily Call Report</h1><p>JobSeen by Arigato Labs</p></div>
  </div>
  <div class="meta">
    <span><b>Date:</b> ${escapeHtml(dateLabel)}</span>
    <span><b>Prepared by:</b> @${escapeHtml(username)}</span>
    <span><b>Total updated today:</b> ${leads.length}</span>
  </div>
  <table>
    <thead><tr><th>#</th><th>Company / Role</th><th>Location</th><th>Phone</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">Generated ${escapeHtml(new Date().toLocaleString("en-IN"))} · Tip: browser me Ctrl+P → “Save as PDF”</div>
</div></body></html>`;
}

interface LeadCardProps {
  lead: BruteForceJob;
  now: number;
  busy: boolean;
  scheduleId: string | null;
  scheduleMode: InterviewMode;
  scheduleAt: string;
  onRoute: boolean;
  onAddToRoute: (lead: BruteForceJob) => void;
  onScheduleMode: (mode: InterviewMode) => void;
  onScheduleAt: (value: string) => void;
  onOpenSchedule: (lead: BruteForceJob, action: "success" | "reschedule") => void;
  onCloseSchedule: () => void;
  onSaveSchedule: (lead: BruteForceJob) => void;
  onOutcome: (lead: BruteForceJob, outcome: BruteForceCallOutcome) => void;
  onDecision: (lead: BruteForceJob, decision: Exclude<BruteForceDecision, "pending">) => void;
  canDelete: boolean;
  selected: boolean;
  onToggleSelected: (leadId: string) => void;
  onDelete: (lead: BruteForceJob) => void;
}

function LeadCard(props: LeadCardProps) {
  const { lead, now, busy } = props;
  const isFinal = lead.decision !== "pending";
  const statusKey: DisplayStatus = isFinal ? lead.decision as Exclude<BruteForceDecision, "pending"> : lead.callOutcome;
  const status = STATUS_STYLES[statusKey];
  const safeMapLink = safeExternalUrl(lead.mapLink);
  const successAt = toMillis(lead.successAt);
  const interviewAt = toMillis(lead.interviewAt);
  const canReschedule = lead.callOutcome === "success" && !!successAt && now >= successAt + 24 * 60 * 60 * 1000;
  const canFinalize = lead.callOutcome === "success" && !!interviewAt && now >= interviewAt;
  const phoneHref = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <article style={{
      border: `${props.selected ? 2 : 1}px solid ${props.selected ? status.color : status.border}`,
      borderRadius: 10,
      padding: props.selected ? 17 : 18,
      background: status.bg,
      boxShadow: props.selected ? `0 0 0 3px ${status.border}` : "none",
      transition: "border-color 140ms ease, box-shadow 140ms ease",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 11, cursor: "pointer", flex: 1, minWidth: 180 }}>
          <input
            type="checkbox"
            checked={props.selected}
            disabled={busy || !props.canDelete}
            onChange={() => props.onToggleSelected(lead.id)}
            aria-label={`Select ${lead.company}`}
            style={{ width: 18, height: 18, margin: "2px 0 0", accentColor: status.color, flexShrink: 0, cursor: "pointer" }}
          />
          <span>
            <span style={{ display: "block", fontSize: 16, fontWeight: 750, color: "var(--ink)" }}>{lead.company}</span>
            <span style={{ display: "block", fontSize: 13, color: "var(--body)", marginTop: 3 }}>{lead.role}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--mute)", marginTop: 5 }}>{lead.location}</span>
          </span>
        </label>
        <span style={{ color: status.color, background: "var(--canvas)", border: `1px solid ${status.border}`, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
          {status.label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {phoneHref ? <a className="btn btn-secondary btn-sm" href={phoneHref}>Call {lead.phone}</a> : <span className="form-hint">Phone not available</span>}
        {safeMapLink && <a className="btn btn-secondary btn-sm" href={safeMapLink} target="_blank" rel="noopener noreferrer">Open map ↗</a>}
        {WALK_IN_ENABLED && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy || props.onRoute}
            onClick={() => props.onAddToRoute(lead)}
            style={props.onRoute ? { color: "#15803d", borderColor: "#bbf7d0", background: "#f0fdf4" } : undefined}
          >
            {props.onRoute ? "On Walk-in Route ✓" : "+ Add to Walk-in Route"}
          </button>
        )}
        {props.canDelete && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() => props.onDelete(lead)}
          >
            Delete
          </button>
        )}
      </div>

      {!isFinal && lead.callOutcome !== "success" && (
        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label" htmlFor={`outcome-${lead.id}`}>call outcome</label>
          <select
            id={`outcome-${lead.id}`}
            className="form-select"
            value={lead.callOutcome}
            disabled={busy}
            onChange={event => {
              const next = event.target.value as BruteForceCallOutcome;
              if (next === "success") props.onOpenSchedule(lead, "success");
              else props.onOutcome(lead, next);
            }}
          >
            {OUTCOMES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      )}

      {lead.callOutcome === "success" && (
        <div style={{ marginTop: 16, background: "var(--surface-soft)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
            Interview scheduled
          </div>
          <div style={{ fontSize: 13, color: "var(--ink)" }}>
            {lead.interviewMode === "online" ? "Online" : "Offline"} · {formatDateTime(lead.interviewAt)}
          </div>
          {lead.interviewRescheduledAt && (
            <div className="form-hint" style={{ marginTop: 4 }}>Date changed on {formatDateTime(lead.interviewRescheduledAt)}</div>
          )}

          {!isFinal && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!canReschedule || busy}
                title={canReschedule ? "Change interview date" : "Unlocks 24 hours after marking success"}
                onClick={() => props.onOpenSchedule(lead, "reschedule")}
              >
                {canReschedule ? "Interview date change" : "Date change (locked 24h)"}
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={!canFinalize || busy}
                title={canFinalize ? "Mark selected" : "Unlocks after interview time"}
                onClick={() => props.onDecision(lead, "selected")}
              >
                Selected
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={!canFinalize || busy}
                title={canFinalize ? "Mark rejected" : "Unlocks after interview time"}
                onClick={() => props.onDecision(lead, "rejected")}
              >
                Rejected
              </button>
            </div>
          )}
        </div>
      )}

      {props.scheduleId === lead.id && (
        <div style={{ marginTop: 14, border: "1.5px solid var(--hairline-strong)", borderRadius: 8, padding: 14 }}>
          <div className="two-col">
            <div className="form-group">
              <label className="form-label">interview mode</label>
              <select
                className="form-select"
                value={props.scheduleMode}
                onChange={event => props.onScheduleMode(event.target.value as InterviewMode)}
              >
                <option value="offline">Offline</option>
                <option value="online">Online</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">date & time</label>
              <input
                type="datetime-local"
                className="form-input"
                value={props.scheduleAt}
                onChange={event => props.onScheduleAt(event.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => props.onSaveSchedule(lead)}>
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={props.onCloseSchedule}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

type LeadSection = "active" | "selected" | "rejected";
type ImportStage = "reading" | "validating" | "uploading" | "complete" | "error";

type ImportProgress = {
  stage: ImportStage;
  title: string;
  message: string;
};

const IMPORT_PROGRESS_PERCENT: Record<ImportStage, number> = {
  reading: 20,
  validating: 50,
  uploading: 80,
  complete: 100,
  error: 100,
};

function waitForNextPaint(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

export default function BruteForceJobsView() {
  const auth = useStore($auth);
  const [leads, setLeads] = useState<BruteForceJob[]>([]);
  const [routeJobIds, setRouteJobIds] = useState<Set<string>>(() => new Set());
  const [existingJobIds, setExistingJobIds] = useState<Set<string>>(() => new Set());
  const [activeSection, setActiveSection] = useState<LeadSection>("active");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [pastedJson, setPastedJson] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BruteForceJob | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleAction, setScheduleAction] = useState<"success" | "reschedule">("success");
  const [scheduleMode, setScheduleMode] = useState<InterviewMode>("offline");
  const [scheduleAt, setScheduleAt] = useState("");

  useEffect(() => {
    if (!auth.user) return;
    const unsubscribeLeads = subscribeToBruteForceJobs(auth.user.uid, data => {
      setLeads(data);
      const existingIds = new Set(data.map(lead => lead.id));
      setSelectedLeadIds(current => new Set([...current].filter(id => existingIds.has(id))));
      setLoading(false);
    });
    const unsubscribeRouteJobs = WALK_IN_ENABLED
      ? subscribeToUserJobs(auth.user.uid, jobs => {
          setExistingJobIds(new Set(jobs.map(job => job.id)));
          setRouteJobIds(new Set(jobs.filter(job => job.onRoute === true).map(job => job.id)));
        })
      : () => {};
    return () => {
      unsubscribeLeads();
      unsubscribeRouteJobs();
    };
  }, [auth.user]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const active = useMemo(() => leads.filter(lead => lead.decision === "pending"), [leads]);
  const selected = useMemo(() => leads.filter(lead => lead.decision === "selected"), [leads]);
  const rejected = useMemo(() => leads.filter(lead => lead.decision === "rejected"), [leads]);
  const sections: { id: LeadSection; label: string; items: BruteForceJob[]; emptyTitle: string; emptyText: string }[] = [
    {
      id: "active",
      label: "Active leads",
      items: active,
      emptyTitle: "Koi active lead nahi hai",
      emptyText: "ChatGPT/Gemini se company list nikalo aur upar form se lead add karo.",
    },
    {
      id: "selected",
      label: "Selected",
      items: selected,
      emptyTitle: "Abhi tak koi selection nahi hui",
      emptyText: "Selected companies yahan dikhengi.",
    },
    {
      id: "rejected",
      label: "Rejected",
      items: rejected,
      emptyTitle: "Abhi tak koi rejection nahi hui",
      emptyText: "Rejected companies yahan dikhengi.",
    },
  ];
  const visibleSection = sections.find(section => section.id === activeSection) ?? sections[0];
  const visibleLeadIds = visibleSection.items.map(lead => lead.id);
  const allVisibleSelected = visibleLeadIds.length > 0 && visibleLeadIds.every(id => selectedLeadIds.has(id));

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds(current => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelectedLeadIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleLeadIds.forEach(id => next.delete(id));
      else visibleLeadIds.forEach(id => next.add(id));
      return next;
    });
  }

  async function downloadTodayReport() {
    if (reportBusy) return;
    const today = new Date();
    // Aaj koi bhi activity: status/decision update, success, reschedule, ya create.
    const todaysLeads = leads
      .filter(lead =>
        isSameDay(toMillis(lead.updatedAt), today)
        || isSameDay(toMillis(lead.successAt), today)
        || isSameDay(toMillis(lead.interviewRescheduledAt), today)
        || isSameDay(toMillis(lead.createdAt), today)
      )
      .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

    if (todaysLeads.length === 0) {
      showToast("Aaj kisi card ki koi activity nahi hui.", "info");
      return;
    }

    setReportBusy(true);
    try {
      // Chhota sa mast loading moment.
      await new Promise(resolve => window.setTimeout(resolve, 900));
      const html = buildTodayReportHtml(todaysLeads, auth.profile?.username ?? "user");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `BruteForce_Report_${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`${todaysLeads.length} cards ka aaj ka report download ho gaya.`, "success");
    } finally {
      setReportBusy(false);
    }
  }

  function openBulkDelete() {
    const ids = [...selectedLeadIds];
    if (ids.length === 0) {
      showToast("Pehle cards select karo.", "error");
      return;
    }
    setBulkDeleteError("");
    setBulkDeleteIds(ids);
  }

  async function confirmBulkDelete(answer: string) {
    if (!auth.user || !bulkDeleteIds?.length) return;
    setBulkDeleting(true);
    setBulkDeleteError("");
    try {
      const deletedCount = await deleteBruteForceJobsWithAnswer(auth.user.uid, bulkDeleteIds, answer);
      const deletedIds = new Set(bulkDeleteIds);
      setSelectedLeadIds(current => new Set([...current].filter(id => !deletedIds.has(id))));
      setBulkDeleteIds(null);
      showToast(`${deletedCount} Brute Force cards delete ho gaye.`, "info");
    } catch (error) {
      setBulkDeleteError(deletionProtectionError(error));
    } finally {
      setBulkDeleting(false);
    }
  }

  function setField(key: keyof typeof INITIAL_FORM, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.user || !auth.profile) { showToast("Not logged in.", "error"); return; }
    if (!form.company.trim() || !form.location.trim() || !form.role.trim()) {
      showToast("Company, location, and role are required.", "error");
      return;
    }
    if (!safeExternalUrl(form.mapLink)) {
      showToast("Map link must be a valid https:// URL.", "error");
      return;
    }
    setCreating(true);
    try {
      await createBruteForceJob(auth.user.uid, auth.profile.username, form);
      setForm(INITIAL_FORM);
      showToast("Lead added.", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to add lead.", "error");
    } finally {
      setCreating(false);
    }
  }

  function showImportError(message: string) {
    setImportProgress({ stage: "error", title: "Import failed", message });
    showToast(message, "error");
  }

  async function runJsonImport(
    readContents: () => Promise<string>,
    sourceLabel: string,
    clearPastedJsonOnSuccess = false
  ) {
    if (!auth.user || !auth.profile) {
      showImportError("Not logged in.");
      return;
    }

    setImporting(true);
    setImportProgress({
      stage: "reading",
      title: "Preparing JSON",
      message: `${sourceLabel} securely read ho raha hai…`,
    });

    try {
      const contents = await readContents();
      await waitForNextPaint();
      await new Promise(resolve => window.setTimeout(resolve, 280));

      if (!contents.trim()) throw new Error("JSON paste area empty hai.");
      if (new Blob([contents]).size > MAX_IMPORT_FILE_BYTES) {
        throw new Error("JSON content maximum 1 MB ho sakta hai.");
      }

      setImportProgress({
        stage: "validating",
        title: "Validating job details",
        message: "Company, role, phone, location aur HTTPS map links check ho rahe hain…",
      });
      await waitForNextPaint();
      await new Promise(resolve => window.setTimeout(resolve, 360));

      const rows = parseImportRows(contents);
      setImportProgress({
        stage: "uploading",
        title: "Creating job cards",
        message: `${rows.length} cards securely create ho rahe hain…`,
      });
      await waitForNextPaint();

      const importedCount = await createBruteForceJobs(auth.user.uid, auth.profile.username, rows);
      setActiveSection("active");
      if (clearPastedJsonOnSuccess) setPastedJson("");
      setImportProgress({
        stage: "complete",
        title: "Import complete",
        message: `${importedCount} job cards successfully create ho gaye.`,
      });
      showToast(`${importedCount} leads import ho gayi.`, "success");
    } catch (err: any) {
      showImportError(err.message ?? "JSON import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      showImportError("Sirf .json file upload karo.");
      input.value = "";
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      showImportError("JSON file maximum 1 MB ho sakti hai.");
      input.value = "";
      return;
    }

    await runJsonImport(() => file.text(), file.name);
    input.value = "";
  }

  async function handlePastedImport() {
    await runJsonImport(() => Promise.resolve(pastedJson), "Pasted JSON", true);
  }

  function openSchedule(lead: BruteForceJob, action: "success" | "reschedule") {
    setScheduleId(lead.id);
    setScheduleAction(action);
    setScheduleMode(lead.interviewMode ?? "offline");
    setScheduleAt(action === "reschedule" ? localInputValue(lead.interviewAt) : "");
  }

  function closeSchedule() {
    setScheduleId(null);
    setScheduleAt("");
  }

  async function handleOutcome(lead: BruteForceJob, outcome: BruteForceCallOutcome) {
    setBusyId(lead.id);
    try {
      await recordBruteForceCallOutcome(lead.id, outcome);
      showToast("Call outcome updated.", "success");
    } catch (err: any) {
      showToast(err.message ?? "Failed to update.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveSchedule(lead: BruteForceJob) {
    if (!scheduleAt) { showToast("Choose date and time.", "error"); return; }
    const interviewAt = new Date(scheduleAt);
    setBusyId(lead.id);
    try {
      if (scheduleAction === "success") {
        await recordBruteForceCallOutcome(lead.id, "success", { mode: scheduleMode, at: interviewAt });
        showToast("Interview scheduled.", "success");
      } else {
        await rescheduleBruteForceInterview(lead.id, interviewAt);
        showToast("Interview date updated.", "success");
      }
      closeSchedule();
    } catch (err: any) {
      showToast(err.message ?? "Failed to save.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecision(lead: BruteForceJob, decision: Exclude<BruteForceDecision, "pending">) {
    setBusyId(lead.id);
    try {
      await setBruteForceDecision(lead.id, decision);
      showToast(decision === "selected" ? "Marked as selected! 🎉" : "Marked as rejected.", decision === "selected" ? "success" : "info");
    } catch (err: any) {
      showToast(err.message ?? "Failed to update.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(answer: string) {
    const target = deleteTarget;
    if (!target || !auth.user) return;

    setDeleteError("");
    setBusyId(target.id);
    if (scheduleId === target.id) closeSchedule();
    try {
      await deleteBruteForceJobWithAnswer(auth.user.uid, target.id, answer);
      setDeleteTarget(null);
      showToast("Brute Force lead deleted.", "info");
    } catch (error) {
      setDeleteError(deletionProtectionError(error));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddToRoute(lead: BruteForceJob) {
    if (!auth.user || !auth.profile) {
      showToast("Not logged in.", "error");
      return;
    }

    setBusyId(lead.id);
    try {
      const routeJobId = bruteForceRouteJobId(auth.user.uid, lead.id);
      await addBruteForceJobToRoute(
        lead,
        auth.user.uid,
        auth.profile.username,
        existingJobIds.has(routeJobId)
      );
      showToast("Walk-in Route mein add ho gaya. Route status alag track hoga.", "success");
    } catch (err: any) {
      showToast(err.message ?? "Walk-in Route mein add nahi ho paya.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <><ToastProvider /><ShimmerSkeleton variant="jobs" count={3} /></>;

  return (
    <>
      <ToastProvider />
      {deleteTarget && auth.user && (
        <DeletionChallengeModal
          uid={auth.user.uid}
          title="Delete this Brute Force lead?"
          targetLabel={`“${deleteTarget.company}”`}
          busy={busyId === deleteTarget.id}
          error={deleteError}
          onCancel={() => { if (busyId !== deleteTarget.id) { setDeleteTarget(null); setDeleteError(""); } }}
          onConfirm={confirmDelete}
        />
      )}
      {bulkDeleteIds && auth.user && (
        <DeletionChallengeModal
          uid={auth.user.uid}
          title={`Delete ${bulkDeleteIds.length} selected cards?`}
          targetLabel={`${bulkDeleteIds.length} selected Brute Force cards`}
          busy={bulkDeleting}
          error={bulkDeleteError}
          onCancel={() => { if (!bulkDeleting) { setBulkDeleteIds(null); setBulkDeleteError(""); } }}
          onConfirm={confirmBulkDelete}
        />
      )}
      <style>{`
        @keyframes jsonLoaderSpin { to { transform: rotate(360deg); } }
        @keyframes jsonLoaderSpinReverse { to { transform: rotate(-360deg); } }
        @keyframes jsonLoaderPulse { 0%, 100% { transform: scale(0.72); opacity: 0.45; } 50% { transform: scale(1); opacity: 1; } }
        @keyframes jsonProgressFlow { to { background-position: 200% 0; } }
        @keyframes jsonModalIn { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .json-import-loader { position: relative; width: 52px; height: 52px; flex: 0 0 52px; display: grid; place-items: center; }
        .json-loader-orbit { position: absolute; border-radius: 50%; border: 2px solid transparent; }
        .json-loader-orbit-a { inset: 0; border-top-color: #7c3aed; border-right-color: #7c3aed; animation: jsonLoaderSpin 0.9s linear infinite; }
        .json-loader-orbit-b { inset: 7px; border-bottom-color: #0ea5e9; border-left-color: #0ea5e9; animation: jsonLoaderSpinReverse 0.72s linear infinite; }
        .json-loader-core { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 14px #22c55e; animation: jsonLoaderPulse 0.85s ease-in-out infinite; }
        .json-loader-percent { position: absolute; top: 57px; font-size: 9px; font-weight: 800; color: var(--mute); letter-spacing: 0.03em; }
        .json-progress-active { background: linear-gradient(90deg, #7c3aed, #0ea5e9, #22c55e, #7c3aed) !important; background-size: 200% 100% !important; animation: jsonProgressFlow 1.2s linear infinite; }
      `}</style>
      {reportBusy && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,0,0,0.4)", backdropFilter: "blur(3px)" }}>
          <div role="dialog" aria-modal="true" aria-live="polite" style={{ width: "min(360px, 100%)", border: "1px solid var(--hairline-strong)", borderRadius: 14, padding: 28, background: "var(--canvas)", boxShadow: "0 18px 60px rgba(15,0,0,0.24)", textAlign: "center", animation: "jsonModalIn 180ms ease-out" }}>
            <div className="json-import-loader" aria-hidden="true" style={{ margin: "0 auto 6px" }}>
              <span className="json-loader-orbit json-loader-orbit-a" />
              <span className="json-loader-orbit json-loader-orbit-b" />
              <span className="json-loader-core" />
            </div>
            <h2 style={{ margin: "14px 0 4px", fontSize: 16, color: "var(--ink)" }}>Building today's report</h2>
            <p style={{ margin: 0, fontSize: 12, color: "var(--mute)", lineHeight: 1.5 }}>Aaj ki activity collect ho rahi hai…</p>
          </div>
        </div>
      )}
      {importProgress && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(15, 0, 0, 0.38)",
            backdropFilter: "blur(3px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-live="polite"
            aria-labelledby="import-progress-title"
            style={{
              width: "min(430px, 100%)",
              border: "1px solid var(--hairline-strong)",
              borderRadius: 12,
              padding: 24,
              background: "var(--canvas)",
              boxShadow: "0 18px 60px rgba(15, 0, 0, 0.2)",
              animation: "jsonModalIn 180ms ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {importProgress.stage === "complete" ? (
                <span aria-hidden="true" style={{ color: "#15803d", fontSize: 30, width: 52, textAlign: "center" }}>✓</span>
              ) : importProgress.stage === "error" ? (
                <span aria-hidden="true" style={{ color: "#b91c1c", fontSize: 30, width: 52, textAlign: "center" }}>!</span>
              ) : (
                <div className="json-import-loader" aria-hidden="true">
                  <span className="json-loader-orbit json-loader-orbit-a" />
                  <span className="json-loader-orbit json-loader-orbit-b" />
                  <span className="json-loader-core" />
                  <span className="json-loader-percent">{IMPORT_PROGRESS_PERCENT[importProgress.stage]}%</span>
                </div>
              )}
              <div>
                <h2 id="import-progress-title" style={{ margin: 0, color: "var(--ink)", fontSize: 17 }}>
                  {importProgress.title}
                </h2>
                <p style={{ margin: "5px 0 0", color: "var(--mute)", fontSize: 12, lineHeight: 1.5 }}>
                  {importProgress.message}
                </p>
              </div>
            </div>

            <div style={{ height: 6, marginTop: 20, overflow: "hidden", borderRadius: 999, background: "var(--surface-soft)" }}>
              <div
                className={importing ? "json-progress-active" : undefined}
                style={{
                  width: `${IMPORT_PROGRESS_PERCENT[importProgress.stage]}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: importProgress.stage === "error" ? "#dc2626" : importProgress.stage === "complete" ? "#16a34a" : "var(--ink)",
                  transition: "width 180ms ease",
                }}
              />
            </div>

            {importing && (
              <p style={{ margin: "12px 0 0", color: "var(--mute)", fontSize: 11 }}>
                Please iss tab ko open rakho.
              </p>
            )}

            {!importing && (importProgress.stage === "complete" || importProgress.stage === "error") && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setImportProgress(null)}
                style={{ marginTop: 20 }}
              >
                {importProgress.stage === "complete" ? "View cards" : "Close"}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 className="page-title">Brute Force Jobs</h1>
            <p className="page-subtitle">
              AI se company list nikalo, phone number pe call milao, aur yahan track karo — no response, wrong number, incoming not allowed, no vacancies, ya interview mil gaya.
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={downloadTodayReport} disabled={reportBusy} style={{ whiteSpace: "nowrap" }}>
            {reportBusy ? "Preparing…" : "↓ Today's report"}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 26 }}>
        <div className="section-label" style={{ marginBottom: 12 }}>Status color guide</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUS_LEGEND.map(statusKey => {
            const item = STATUS_STYLES[statusKey];
            return (
              <span
                key={statusKey}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  color: item.color,
                  background: item.bg,
                  border: `1px solid ${item.border}`,
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, flexShrink: 0 }}
                />
                {item.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: 20, maxWidth: 620 }}>
        <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)" }}>Import jobs from JSON</div>
        <p className="form-hint" style={{ marginTop: 6 }}>
          Maximum 100 jobs aur 1 MB file. Har imported card “Not called” status se start hoga.
        </p>
        <pre style={{ margin: "12px 0", padding: 10, overflowX: "auto", borderRadius: 6, background: "var(--surface-soft)", color: "var(--body)", fontSize: 10, lineHeight: 1.5 }}>
          {`[{"company":"TCS","role":"Developer","phone":"+91 98765 43210","location":"Noida","mapLink":"https://maps.google.com/..."}]`}
        </pre>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label
            className="btn btn-secondary"
            style={{ opacity: importing ? 0.6 : 1, cursor: importing ? "wait" : "pointer" }}
          >
            {importing ? "Importing…" : "Upload JSON file"}
            <input
              type="file"
              accept=".json,application/json"
              disabled={importing}
              onChange={handleImport}
              style={{ display: "none" }}
            />
          </label>
          <span style={{ fontSize: 11, color: "var(--mute)" }}>or paste JSON below</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" }}>
          <span style={{ height: 1, background: "var(--hairline)", flex: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--mute)", letterSpacing: "0.08em" }}>PASTE JSON DIRECTLY</span>
          <span style={{ height: 1, background: "var(--hairline)", flex: 1 }} />
        </div>

        <textarea
          className="form-input"
          value={pastedJson}
          onChange={event => setPastedJson(event.target.value)}
          disabled={importing}
          rows={7}
          spellCheck={false}
          aria-label="Paste JSON jobs"
          placeholder={'[{\n  "company": "TCS",\n  "role": "Developer",\n  "phone": "+91 98765 43210",\n  "location": "Noida",\n  "mapLink": "https://maps.google.com/..."\n}]'}
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 150,
            fontFamily: '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace',
            fontSize: 12, lineHeight: 1.55, tabSize: 2, background: "var(--surface-soft)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ fontSize: 10, color: "var(--mute)" }}>
            {pastedJson.length.toLocaleString("en-IN")} characters · maximum 100 cards
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {pastedJson && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={importing} onClick={() => setPastedJson("")}>
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing || !pastedJson.trim()}
              onClick={handlePastedImport}
            >
              {importing ? "Creating cards…" : "Create cards from pasted JSON"}
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleCreate} className="form-card" style={{ marginBottom: 32, maxWidth: 620 }}>
        <div className="two-col">
          <div className="form-group">
            <label className="form-label">company *</label>
            <input className="form-input" value={form.company} onChange={e => setField("company", e.target.value)} placeholder="Infosys, TCS…" required />
          </div>
          <div className="form-group">
            <label className="form-label">role *</label>
            <input className="form-input" value={form.role} onChange={e => setField("role", e.target.value)} placeholder="Frontend Developer…" required />
          </div>
        </div>
        <div className="two-col" style={{ marginTop: 14 }}>
          <div className="form-group">
            <label className="form-label">phone <span style={{ color: "var(--mute)", fontWeight: 500 }}>(optional)</span></label>
            <input className="form-input" value={form.phone} onChange={e => setField("phone", e.target.value)} placeholder="+91 98765 43210" />
          </div>
          <div className="form-group">
            <label className="form-label">location *</label>
            <input className="form-input" value={form.location} onChange={e => setField("location", e.target.value)} placeholder="Sector 62, Noida" required />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 14 }}>
          <label className="form-label">map link *</label>
          <input className="form-input" type="url" value={form.mapLink} onChange={e => setField("mapLink", e.target.value)} placeholder="https://maps.google.com/…" required />
          <span className="form-hint">https:// link chahiye — Google Maps ya koi bhi map service.</span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={creating} style={{ marginTop: 16 }}>
          {creating ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Adding…</> : "+ Add Lead"}
        </button>
      </form>

      <div
        role="tablist"
        aria-label="Brute force job sections"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          borderBottom: "1px solid var(--hairline-strong)",
          marginBottom: 20,
        }}
      >
        {sections.map((section, index) => {
          const isCurrent = section.id === activeSection;
          return (
            <button
              key={section.id}
              id={`lead-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-controls={`lead-panel-${section.id}`}
              onClick={() => {
                setActiveSection(section.id);
                closeSchedule();
              }}
              style={{
                minWidth: 0,
                padding: "13px 6px",
                border: 0,
                borderRight: index < sections.length - 1 ? "1px solid var(--hairline-strong)" : "none",
                borderBottom: isCurrent ? "3px solid var(--ink)" : "3px solid transparent",
                marginBottom: -1,
                background: isCurrent ? "var(--surface-soft)" : "transparent",
                color: isCurrent ? "var(--ink)" : "var(--mute)",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: isCurrent ? 750 : 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {section.label} ({section.items.length})
            </button>
          );
        })}
      </div>

      <section
        id={`lead-panel-${activeSection}`}
        role="tabpanel"
        aria-labelledby={`lead-tab-${activeSection}`}
      >
        {visibleSection.items.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            flexWrap: "wrap", padding: "10px 12px", marginBottom: 14,
            border: "1px solid var(--hairline)", borderRadius: 8,
            background: selectedLeadIds.size > 0 ? "#fff7ed" : "var(--surface-soft)",
          }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleVisibleSelection}
                style={{ width: 17, height: 17, accentColor: "var(--ink)", cursor: "pointer" }}
              />
              {allVisibleSelected ? "Unselect this tab" : `Select all in ${visibleSection.label}`}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedLeadIds.size > 0 ? "#9a3412" : "var(--mute)" }}>
                {selectedLeadIds.size} selected
              </span>
              {selectedLeadIds.size > 0 && (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" disabled={bulkDeleting} onClick={() => setSelectedLeadIds(new Set())}>
                    Clear
                  </button>
                  <button type="button" className="btn btn-danger btn-sm" disabled={bulkDeleting} onClick={openBulkDelete}>
                    Delete selected ({selectedLeadIds.size})
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {visibleSection.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{visibleSection.emptyTitle}</div>
            <p>{visibleSection.emptyText}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
            {visibleSection.items.map(lead => {
              const isActiveLead = activeSection === "active";
              return (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  now={now}
                  busy={busyId === lead.id}
                  scheduleId={isActiveLead ? scheduleId : null}
                  scheduleMode={isActiveLead ? scheduleMode : "offline"}
                  scheduleAt={isActiveLead ? scheduleAt : ""}
                  onRoute={auth.user ? routeJobIds.has(bruteForceRouteJobId(auth.user.uid, lead.id)) : false}
                  onAddToRoute={handleAddToRoute}
                  onScheduleMode={isActiveLead ? setScheduleMode : () => {}}
                  onScheduleAt={isActiveLead ? setScheduleAt : () => {}}
                  onOpenSchedule={isActiveLead ? openSchedule : () => {}}
                  onCloseSchedule={isActiveLead ? closeSchedule : () => {}}
                  onSaveSchedule={isActiveLead ? handleSaveSchedule : () => {}}
                  onOutcome={isActiveLead ? handleOutcome : () => {}}
                  onDecision={isActiveLead ? handleDecision : () => {}}
                  canDelete={auth.user?.uid === lead.ownerUID}
                  selected={selectedLeadIds.has(lead.id)}
                  onToggleSelected={toggleLeadSelection}
                  onDelete={leadToDelete => { setDeleteError(""); setDeleteTarget(leadToDelete); }}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
