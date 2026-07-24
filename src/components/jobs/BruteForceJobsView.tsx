import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  createBruteForceJob,
  createBruteForceJobs,
  recordBruteForceCallOutcome,
  rescheduleBruteForceInterview,
  setBruteForceDecision,
  subscribeToBruteForceJobs,
  type BruteForceCallOutcome,
  type BruteForceDecision,
  type BruteForceJob,
  type BruteForceJobInput,
  type InterviewMode,
} from "../../lib/firestore";
import { safeExternalUrl } from "../../lib/security";
import { ToastProvider, showToast } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

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
  no_vacancies: { label: "No vacancies", color: "#b45309", bg: "#fffbeb", border: "#fde68a" },
  success: { label: "Success — interview scheduled", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
  selected: { label: "Selected", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  rejected: { label: "Rejected", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
};

const OUTCOME_VALUES: BruteForceCallOutcome[] = [
  "not_called", "no_response", "wrong_number", "no_vacancies", "success",
];
const OUTCOMES = OUTCOME_VALUES.map(value => ({ value, ...STATUS_STYLES[value] }));
const STATUS_LEGEND: DisplayStatus[] = [
  "not_called", "no_response", "wrong_number", "no_vacancies", "success", "selected", "rejected",
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

interface LeadCardProps {
  lead: BruteForceJob;
  now: number;
  busy: boolean;
  scheduleId: string | null;
  scheduleMode: InterviewMode;
  scheduleAt: string;
  onScheduleMode: (mode: InterviewMode) => void;
  onScheduleAt: (value: string) => void;
  onOpenSchedule: (lead: BruteForceJob, action: "success" | "reschedule") => void;
  onCloseSchedule: () => void;
  onSaveSchedule: (lead: BruteForceJob) => void;
  onOutcome: (lead: BruteForceJob, outcome: BruteForceCallOutcome) => void;
  onDecision: (lead: BruteForceJob, decision: Exclude<BruteForceDecision, "pending">) => void;
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
    <article style={{ border: `1px solid ${status.border}`, borderRadius: 10, padding: 18, background: status.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 750, color: "var(--ink)" }}>{lead.company}</div>
          <div style={{ fontSize: 13, color: "var(--body)", marginTop: 3 }}>{lead.role}</div>
          <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 5 }}>{lead.location}</div>
        </div>
        <span style={{ color: status.color, background: "var(--canvas)", border: `1px solid ${status.border}`, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
          {status.label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {phoneHref ? <a className="btn btn-secondary btn-sm" href={phoneHref}>Call {lead.phone}</a> : <span className="form-hint">Phone not available</span>}
        {safeMapLink && <a className="btn btn-secondary btn-sm" href={safeMapLink} target="_blank" rel="noopener noreferrer">Open map ↗</a>}
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
  const [activeSection, setActiveSection] = useState<LeadSection>("active");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [scheduleAction, setScheduleAction] = useState<"success" | "reschedule">("success");
  const [scheduleMode, setScheduleMode] = useState<InterviewMode>("offline");
  const [scheduleAt, setScheduleAt] = useState("");

  useEffect(() => {
    if (!auth.user) return;
    const unsubscribe = subscribeToBruteForceJobs(auth.user.uid, data => {
      setLeads(data);
      setLoading(false);
    });
    return () => unsubscribe();
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

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!auth.user || !auth.profile) {
      showToast("Not logged in.", "error");
      input.value = "";
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      showToast("Sirf .json file upload karo.", "error");
      input.value = "";
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      showToast("JSON file maximum 1 MB ho sakti hai.", "error");
      input.value = "";
      return;
    }

    setImporting(true);
    try {
      const rows = parseImportRows(await file.text());
      const importedCount = await createBruteForceJobs(auth.user.uid, auth.profile.username, rows);
      setActiveSection("active");
      showToast(`${importedCount} leads import ho gayi.`, "success");
    } catch (err: any) {
      showToast(err.message ?? "JSON import failed.", "error");
    } finally {
      setImporting(false);
      input.value = "";
    }
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

  if (loading) return <><ToastProvider /><ShimmerSkeleton variant="jobs" count={3} /></>;

  return (
    <>
      <ToastProvider />
      <div className="page-header">
        <h1 className="page-title">Brute Force Jobs</h1>
        <p className="page-subtitle">
          AI se company list nikalo, phone number pe call milao, aur yahan track karo — no response, wrong number, no vacancies, ya interview mil gaya.
        </p>
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
                  color: item.color,
                  background: item.bg,
                  border: `1px solid ${item.border}`,
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
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
        <label
          className="btn btn-secondary"
          style={{ opacity: importing ? 0.6 : 1, cursor: importing ? "wait" : "pointer" }}
        >
          {importing ? "Importing…" : "Choose JSON file"}
          <input
            type="file"
            accept=".json,application/json"
            disabled={importing}
            onChange={handleImport}
            style={{ display: "none" }}
          />
        </label>
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
                  busy={isActiveLead && busyId === lead.id}
                  scheduleId={isActiveLead ? scheduleId : null}
                  scheduleMode={isActiveLead ? scheduleMode : "offline"}
                  scheduleAt={isActiveLead ? scheduleAt : ""}
                  onScheduleMode={isActiveLead ? setScheduleMode : () => {}}
                  onScheduleAt={isActiveLead ? setScheduleAt : () => {}}
                  onOpenSchedule={isActiveLead ? openSchedule : () => {}}
                  onCloseSchedule={isActiveLead ? closeSchedule : () => {}}
                  onSaveSchedule={isActiveLead ? handleSaveSchedule : () => {}}
                  onOutcome={isActiveLead ? handleOutcome : () => {}}
                  onDecision={isActiveLead ? handleDecision : () => {}}
                />
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
