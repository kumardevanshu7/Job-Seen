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

const RANK: Record<string, number> = {
  "Selected": 0, "Resume sent (hold)": 1, "Go to site — Send resume on email": 1.4, "Interview scheduled": 2,
  "Applied": 3, "Selected!": 3, "Call picked but no vacancies there": 4,
  "Incoming not allowed": 5, "Wrong number": 6, "Not Connected - Try Again": 6.5,
  "Call Busy - Try Again": 6.6, "Wait - Call me later": 6.7, "Ringing but no response": 7,
  "Pending": 8, "Not Applied": 9, "Not called": 10, "Rejected": 99,
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
  wrong_number:         { label: "Wrong number",         color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  incoming_not_allowed: { label: "Incoming not allowed", color: "#9f1239", bg: "#fff1f2", border: "#fda4af" },
  no_vacancies:         { label: "Call picked but no vacancies there", color: "#7c2d12", bg: "linear-gradient(90deg,#dcfce7,#fee2e2)", border: "#fbcfe8" },
  not_connected:        { label: "Not Connected - Try Again", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  call_busy:            { label: "Call Busy - Try Again", color: "#d97706", bg: "#fffbeb", border: "#fcd34d" },
  call_later:           { label: "Wait - Call me later",  color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
  switched_off:         { label: "Switched off",         color: "#475569", bg: "linear-gradient(90deg,#e5e7eb,#ffffff,#f3f4f6)", border: "#d1d5db" },
  site_resume_email:    { label: "Go to site — Send resume on email", color: "#0f766e", bg: "#f0fdfa", border: "#99f6e4" },
  resume_sent:          { label: "Resume sent (hold)",   color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
  success:              { label: "Interview scheduled",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  selected:             { label: "Selected",             color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  rejected:             { label: "Rejected",             color: "#7f1d1d", bg: "#fef2f2", border: "#fca5a5" },
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

  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  const statusChips = useMemo(() => {
    const map = new Map<string, { label: string; color: string; bg: string; border: string; count: number }>();
    grouped.forEach(g => g.items.forEach(row => {
      const existing = map.get(row.status);
      if (existing) existing.count += 1;
      else map.set(row.status, { label: row.status, color: row.color, bg: row.bg, border: row.border, count: 1 });
    }));
    return [...map.values()].sort((a, b) => (RANK[a.label] ?? 50) - (RANK[b.label] ?? 50));
  }, [grouped]);

  useEffect(() => {
    if (selectedStatus !== "all" && !statusChips.some(s => s.label === selectedStatus)) {
      setSelectedStatus("all");
    }
  }, [statusChips, selectedStatus]);

  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const visibleGroups = (selectedDay === "all" ? grouped : grouped.filter(g => g.key === selectedDay))
    .map(g => ({
      ...g,
      items: g.items
        .filter(r => selectedStatus === "all" || r.status === selectedStatus)
        .filter(r => !q || [r.company, r.role, r.status, r.kind].some(v => (v ?? "").toLowerCase().includes(q))),
    }))
    .filter(g => g.items.length > 0);

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
        <div style={{ position: "relative", marginBottom: 16 }}>
          <input
            type="search"
            className="form-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search company, role, ya status…"
            style={{ paddingLeft: 34, fontFamily: "inherit" }}
          />
          <span aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--mute)", fontSize: 14 }}>⚲</span>
        </div>

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

        <div className="date-slider" role="tablist" aria-label="Filter by status" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={`status-chip ${selectedStatus === "all" ? "active" : ""}`}
            aria-selected={selectedStatus === "all"}
            onClick={() => setSelectedStatus("all")}
          >
            All categories
          </button>
          {statusChips.map(chip => (
            <button
              key={chip.label}
              type="button"
              aria-selected={selectedStatus === chip.label}
              className={`status-chip ${selectedStatus === chip.label ? "active" : ""}`}
              onClick={() => setSelectedStatus(chip.label)}
              style={selectedStatus === chip.label ? { background: chip.color, borderColor: chip.color, color: "#fff" } : { borderColor: chip.border }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: selectedStatus === chip.label ? "#fff" : chip.color, flexShrink: 0 }} aria-hidden="true" />
              {chip.label}
              <span style={{ opacity: .75, fontWeight: 800 }}>{chip.count}</span>
            </button>
          ))}
        </div>

        {visibleGroups.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">Is filter mein kuch nahi</div>
            <p>Doosri date ya category select karo.</p>
          </div>
        ) : (
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
        )}
        </>
      )}

      <style>{`
        .status-chip {
          flex: 0 0 auto; scroll-snap-align: start; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px;
          padding: 8px 13px; border-radius: 999px;
          border: 1.5px solid var(--hairline); background: var(--canvas);
          font-family: inherit; font-size: 12px; font-weight: 700; color: var(--body);
          white-space: nowrap; transition: all 0.12s;
        }
        .status-chip:hover { border-color: var(--mute); }
        .status-chip.active { background: var(--ink); border-color: var(--ink); color: var(--canvas); }
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
          .analytics-row { grid-template-columns: 1fr; gap: 10px; padding: 14px; }
          .analytics-row span[data-label] { display: block; }
          .analytics-row span[data-label]::before {
            content: attr(data-label); display: block; font-size: 9px; font-weight: 800; text-transform: uppercase;
            letter-spacing: .05em; color: var(--mute); margin-bottom: 3px;
          }
          .an-time, .an-kind { font-size: 13px; color: var(--ink); }
          .an-company, .an-role { text-align: left; }
          .an-company { font-size: 14px; }
        }
      `}</style>
    </>
  );
}
