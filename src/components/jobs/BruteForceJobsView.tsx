import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  createBruteForceJob,
  recordBruteForceCallOutcome,
  rescheduleBruteForceInterview,
  setBruteForceDecision,
  subscribeToBruteForceJobs,
  type BruteForceCallOutcome,
  type BruteForceDecision,
  type BruteForceJob,
  type InterviewMode,
} from "../../lib/firestore";
import { safeExternalUrl } from "../../lib/security";
import { ToastProvider, showToast } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

const OUTCOMES: { value: BruteForceCallOutcome; label: string; color: string; bg: string }[] = [
  { value: "not_called", label: "Not called", color: "#686262", bg: "#f1eeee" },
  { value: "no_response", label: "No response", color: "#6d28d9", bg: "#f5f3ff" },
  { value: "wrong_number", label: "Wrong number", color: "#b91c1c", bg: "#fef2f2" },
  { value: "no_vacancies", label: "No vacancies", color: "#b45309", bg: "#fffbeb" },
  { value: "success", label: "Success — interview scheduled", color: "#15803d", bg: "#f0fdf4" },
];

const INITIAL_FORM = { company: "", phone: "", location: "", mapLink: "", role: "" };

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
  const outcome = OUTCOMES.find(item => item.value === lead.callOutcome) ?? OUTCOMES[0];
  const safeMapLink = safeExternalUrl(lead.mapLink);
  const successAt = toMillis(lead.successAt);
  const interviewAt = toMillis(lead.interviewAt);
  const canReschedule = lead.callOutcome === "success" && !!successAt && now >= successAt + 24 * 60 * 60 * 1000;
  const canFinalize = lead.callOutcome === "success" && !!interviewAt && now >= interviewAt;
  const isFinal = lead.decision !== "pending";
  const phoneHref = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <article style={{ border: "1px solid var(--hairline-strong)", borderRadius: 10, padding: 18, background: "var(--canvas)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 750, color: "var(--ink)" }}>{lead.company}</div>
          <div style={{ fontSize: 13, color: "var(--body)", marginTop: 3 }}>{lead.role}</div>
          <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 5 }}>{lead.location}</div>
        </div>
        <span style={{ color: outcome.color, background: outcome.bg, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
          {isFinal ? lead.decision.toUpperCase() : outcome.label}
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

export default function BruteForceJobsView() {
  const auth = useStore($auth);
  const [leads, setLeads] = useState<BruteForceJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
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

      <div className="section-label" style={{ marginBottom: 12 }}>Active leads ({active.length})</div>
      {active.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Koi active lead nahi hai</div>
          <p>ChatGPT/Gemini se company list nikalo aur upar form se lead add karo.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
          {active.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              now={now}
              busy={busyId === lead.id}
              scheduleId={scheduleId}
              scheduleMode={scheduleMode}
              scheduleAt={scheduleAt}
              onScheduleMode={setScheduleMode}
              onScheduleAt={setScheduleAt}
              onOpenSchedule={openSchedule}
              onCloseSchedule={closeSchedule}
              onSaveSchedule={handleSaveSchedule}
              onOutcome={handleOutcome}
              onDecision={handleDecision}
            />
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginBottom: 12 }}>Selected ({selected.length})</div>
      {selected.length === 0 ? (
        <p className="form-hint" style={{ marginBottom: 32 }}>Abhi tak koi selection nahi hui.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 40 }}>
          {selected.map(lead => (
            <LeadCard
              key={lead.id} lead={lead} now={now} busy={false}
              scheduleId={null} scheduleMode="offline" scheduleAt=""
              onScheduleMode={() => {}} onScheduleAt={() => {}}
              onOpenSchedule={() => {}} onCloseSchedule={() => {}}
              onSaveSchedule={() => {}} onOutcome={() => {}} onDecision={() => {}}
            />
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginBottom: 12 }}>Rejected ({rejected.length})</div>
      {rejected.length === 0 ? (
        <p className="form-hint">Abhi tak koi rejection nahi hui.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {rejected.map(lead => (
            <LeadCard
              key={lead.id} lead={lead} now={now} busy={false}
              scheduleId={null} scheduleMode="offline" scheduleAt=""
              onScheduleMode={() => {}} onScheduleAt={() => {}}
              onOpenSchedule={() => {}} onCloseSchedule={() => {}}
              onSaveSchedule={() => {}} onOutcome={() => {}} onDecision={() => {}}
            />
          ))}
        </div>
      )}
    </>
  );
}
