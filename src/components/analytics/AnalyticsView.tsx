import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  subscribeToUserJobs,
  subscribeToBruteForceJobs,
  type JobCard,
  type BruteForceJob,
} from "../../lib/firestore";
import { ToastProvider } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

type Row = {
  kind: "Job" | "Brute Force";
  company: string;
  role: string;
  status: string;
  color: string;
  bg: string;
  border: string;
  millis: number;
};

const JOB_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
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

const BRUTE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  no_response:          { label: "Ringing but no response", color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe" },
  wrong_number:         { label: "Wrong number",         color: "#db2777", bg: "#fdf2f8", border: "#fbcfe8" },
  incoming_not_allowed: { label: "Incoming not allowed", color: "#0d9488", bg: "#f0fdfa", border: "#99f6e4" },
  no_vacancies:         { label: "Call picked but no vacancies there", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  resume_sent:          { label: "Resume sent (hold)",   color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
  success:              { label: "Interview scheduled",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  selected:             { label: "Selected",             color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  rejected:             { label: "Rejected",             color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
};

function millisOf(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function dayKey(millis: number): string {
  const d = new Date(millis);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function timeLabel(millis: number): string {
  return new Date(millis).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function AnalyticsView() {
  const auth = useStore($auth);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [leads, setLeads] = useState<BruteForceJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.user) return;
    let a = false, b = false;
    const done = () => { if (a && b) setLoading(false); };
    const unsubJobs = subscribeToUserJobs(auth.user.uid, data => { setJobs(data); a = true; done(); });
    const unsubBrute = subscribeToBruteForceJobs(auth.user.uid, data => { setLeads(data); b = true; done(); });
    return () => { unsubJobs(); unsubBrute(); };
  }, [auth.user]);

  const grouped = useMemo(() => {
    const rows: Row[] = [];
    jobs.forEach(job => {
      if ((job.jobType ?? "online") === "walkin") return;
      const m = millisOf(job.statusUpdatedAt);
      if (!m) return;
      const meta = JOB_META[(job.status ?? "pending") as string] ?? JOB_META.pending;
      rows.push({ kind: "Job", company: job.company || "—", role: job.role || "", status: meta.label, color: meta.color, bg: meta.bg, border: meta.border, millis: m });
    });
    leads.forEach(lead => {
      if (lead.callOutcome === "not_called" && lead.decision === "pending") return;
      const m = millisOf(lead.updatedAt);
      if (!m) return;
      const key = lead.decision !== "pending" ? lead.decision : lead.callOutcome;
      const meta = BRUTE_META[key as string] ?? BRUTE_META.no_response;
      rows.push({ kind: "Brute Force", company: lead.company || "—", role: lead.role || "", status: meta.label, color: meta.color, bg: meta.bg, border: meta.border, millis: m });
    });

    const byDay = new Map<string, Row[]>();
    rows.forEach(row => {
      const key = dayKey(row.millis);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(row);
    });
    return [...byDay.entries()]
      .sort((x, y) => y[0].localeCompare(x[0]))
      .map(([key, items]) => ({ key, items: items.sort((p, q) => q.millis - p.millis) }));
  }, [jobs, leads]);

  const totalChanges = grouped.reduce((sum, g) => sum + g.items.length, 0);
  const [selectedDay, setSelectedDay] = useState<string>("all");

  useEffect(() => {
    if (selectedDay !== "all" && !grouped.some(g => g.key === selectedDay)) {
      setSelectedDay("all");
    }
  }, [grouped, selectedDay]);

  const visibleGroups = selectedDay === "all" ? grouped : grouped.filter(g => g.key === selectedDay);

  function chipLabel(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function chipWeekday(key: string): string {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short" });
  }

  if (loading) return <><ToastProvider /><ShimmerSkeleton variant="jobs" count={4} /></>;

  return (
    <>
      <ToastProvider />
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">
          Date-wise status change history — jobs aur Brute Force calls, dono. Total {totalChanges} updates.
        </p>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">Abhi koi activity nahi</div>
          <p>Jab aap kisi job ya Brute Force lead ka status change karoge, woh yahan date-wise dikhega.</p>
        </div>
      ) : (
        <>
        <div className="date-slider" role="tablist" aria-label="Filter by date">
          <button
            type="button"
            role="tab"
            aria-selected={selectedDay === "all"}
            className={`date-chip ${selectedDay === "all" ? "active" : ""}`}
            onClick={() => setSelectedDay("all")}
          >
            <span className="date-chip-top">All</span>
            <span className="date-chip-sub">{totalChanges}</span>
          </button>
          {grouped.map(group => (
            <button
              key={group.key}
              type="button"
              role="tab"
              aria-selected={selectedDay === group.key}
              className={`date-chip ${selectedDay === group.key ? "active" : ""}`}
              onClick={() => setSelectedDay(group.key)}
            >
              <span className="date-chip-week">{chipWeekday(group.key)}</span>
              <span className="date-chip-top">{chipLabel(group.key)}</span>
              <span className="date-chip-sub">{group.items.length}</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {visibleGroups.map(group => (
            <div key={group.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{dayLabel(group.key)}</span>
                <span style={{ fontSize: 11, color: "var(--mute)", background: "var(--surface-soft)", border: "1px solid var(--hairline)", borderRadius: 999, padding: "2px 8px" }}>
                  {group.items.length}
                </span>
              </div>

              <div className="analytics-table">
                <div className="analytics-row analytics-head">
                  <span>Time</span>
                  <span>Company / Role</span>
                  <span>Type</span>
                  <span>Status</span>
                </div>
                {group.items.map((row, i) => (
                  <div key={i} className="analytics-row">
                    <span data-label="Time" className="an-time">{timeLabel(row.millis)}</span>
                    <span data-label="Company">
                      <span className="an-company">{row.company}</span>
                      {row.role && <span className="an-role">{row.role}</span>}
                    </span>
                    <span data-label="Type" className="an-kind">{row.kind}</span>
                    <span data-label="Status">
                      <span className="an-badge" style={{ color: row.color, background: row.bg, borderColor: row.border }}>{row.status}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      <style>{`
        .date-slider {
          display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 12px;
          margin-bottom: 18px; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch;
        }
        .date-slider::-webkit-scrollbar { height: 6px; }
        .date-slider::-webkit-scrollbar-thumb { background: var(--hairline); border-radius: 999px; }
        .date-chip {
          flex: 0 0 auto; scroll-snap-align: start; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          min-width: 62px; padding: 8px 12px; border-radius: 10px;
          border: 1.5px solid var(--hairline); background: var(--canvas);
          font-family: inherit; color: var(--body); transition: all 0.12s;
        }
        .date-chip:hover { border-color: var(--mute); }
        .date-chip.active { background: var(--ink); border-color: var(--ink); color: var(--canvas); }
        .date-chip-week { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; opacity: .7; }
        .date-chip-top { font-size: 13px; font-weight: 800; white-space: nowrap; }
        .date-chip-sub { font-size: 10px; font-weight: 700; opacity: .8; }
        .analytics-table { border: 1px solid var(--hairline); border-radius: 10px; overflow: hidden; }
        .analytics-row {
          display: grid; grid-template-columns: 72px 1fr 96px 150px;
          gap: 12px; align-items: center; padding: 11px 14px;
          border-bottom: 1px solid var(--hairline); font-size: 13px;
        }
        .analytics-row:last-child { border-bottom: none; }
        .analytics-head { background: var(--surface-soft); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--mute); }
        .an-time { color: var(--mute); font-size: 12px; }
        .an-company { display: block; font-weight: 700; color: var(--ink); }
        .an-role { display: block; font-size: 11px; color: var(--mute); margin-top: 2px; }
        .an-kind { font-size: 11px; color: var(--body); }
        .an-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; border: 1px solid; font-size: 11px; font-weight: 700; }
        @media (max-width: 640px) {
          .analytics-head { display: none; }
          .analytics-row { grid-template-columns: 1fr; gap: 7px; padding: 12px 14px; }
          .analytics-row span[data-label] { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
          .analytics-row span[data-label]::before {
            content: attr(data-label); font-size: 10px; font-weight: 800; text-transform: uppercase;
            letter-spacing: .05em; color: var(--mute); flex: 0 0 auto;
          }
          .an-company, .an-role { text-align: right; }
        }
      `}</style>
    </>
  );
}
