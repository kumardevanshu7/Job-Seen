import { useEffect, useMemo, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { subscribeToUserJobs, subscribeToBruteForceJobs, updateJobStatus } from "../../lib/firestore";
import type { JobCard as JobCardType, JobStatus, BruteForceJob } from "../../lib/firestore";
import { deleteJobWithAnswer, deletionProtectionError } from "../../lib/deletionProtection";
import { jobsWithTodayActivity, bruteLeadsWithTodayActivity, buildDailyJobReportHtml } from "../../lib/jobReport";
import JobCard from "./JobCard";
import { ToastProvider, showToast } from "../ui/Toast";
import DeletionChallengeModal from "../ui/DeletionChallengeModal";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

function toDate(d: any): Date | null {
  if (!d) return null;
  if (d.toDate) return d.toDate();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function HomeView() {
  const auth = useStore($auth);
  const [jobs, setJobs] = useState<JobCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [bruteLeads, setBruteLeads] = useState<BruteForceJob[]>([]);
  const [viewMode, setViewMode] = useState<string>("list");
  const [filterTab, setFilterTab] = useState<"all" | "mine" | "copied">("all");
  const [dateBasis, setDateBasis] = useState<"added" | "applied">("added");
  const [dateFilter, setDateFilter] = useState<string>("all");

  useEffect(() => {
    const saved = localStorage.getItem("jobseen_view_mode");
    if (saved) setViewMode(saved);
  }, []);

  useEffect(() => {
    const mainInner = document.querySelector(".main-inner") as HTMLElement;
    if (mainInner) {
      if (viewMode === "list") mainInner.style.maxWidth = "760px";
      else if (viewMode === "board") mainInner.style.maxWidth = "100%";
      else if (viewMode === "cols-2") mainInner.style.maxWidth = "900px";
      else mainInner.style.maxWidth = "1200px";
    }
  }, [viewMode]);

  function handleViewModeChange(mode: string) {
    setViewMode(mode);
    localStorage.setItem("jobseen_view_mode", mode);
  }

  useEffect(() => {
    if (!auth.user) return;
    const unsub = subscribeToUserJobs(auth.user.uid, (data) => {
      setJobs(data);
      setLoading(false);
    });
    const unsubBrute = subscribeToBruteForceJobs(auth.user.uid, setBruteLeads);
    return () => { unsub(); unsubBrute(); };
  }, [auth.user]);

  function handleDelete(id: string) {
    setDeleteError("");
    setDeleteTarget(id);
  }

  async function downloadTodayReport() {
    if (reportBusy) return;
    const today = new Date();
    const todaysJobs = jobsWithTodayActivity(jobs, today);
    const todaysBrute = bruteLeadsWithTodayActivity(bruteLeads, today);
    if (todaysJobs.length === 0 && todaysBrute.length === 0) {
      showToast("Aaj kisi ka status change nahi hua.", "info");
      return;
    }
    setReportBusy(true);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 900));
      const html = buildDailyJobReportHtml(todaysJobs, auth.profile?.username ?? "user", today, todaysBrute);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = `JobSeen_Report_${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(`${todaysJobs.length + todaysBrute.length} items ka aaj ka report download ho gaya.`, "success");
    } finally {
      setReportBusy(false);
    }
  }

  function openJob(job: JobCardType) {
    window.location.href = `/job?id=${encodeURIComponent(job.id)}`;
  }

  async function confirmDelete(answer: string) {
    if (!deleteTarget || !auth.user) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteJobWithAnswer(auth.user.uid, deleteTarget, answer);
      showToast("Job removed.", "info");
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(deletionProtectionError(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  function jobDate(job: JobCardType): Date | null {
    if (dateBasis === "applied") return toDate(job.appliedAt);
    return toDate(job.createdAt);
  }

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach(j => {
      if ((j.jobType ?? "online") === "walkin") return;
      const d = dateBasis === "applied" ? toDate(j.appliedAt) : toDate(j.createdAt);
      if (d) set.add(dayKey(d));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [jobs, dateBasis]);

  const filteredJobs = useMemo(() => jobs.filter(j => {
    if ((j.jobType ?? "online") === "walkin") return false;
    if (filterTab === "mine") { if (j.copiedFromUID) return false; }
    if (filterTab === "copied") { if (!j.copiedFromUID) return false; }
    if (dateFilter !== "all") {
      const d = jobDate(j);
      if (!d) return false;
      if (dayKey(d) !== dateFilter) return false;
    }
    return true;
  }), [jobs, filterTab, dateFilter, dateBasis]);

  const { grouped, groupOrder } = useMemo(() => {
    const map: Record<string, JobCardType[]> = {};
    const keyRank = new Map<string, string>(); // label -> sortKey
    filteredJobs.forEach(j => {
      const d = jobDate(j);
      let label: string;
      let sortKey: string;
      if (!d) {
        label = dateBasis === "applied" ? "Not applied yet" : "Earlier";
        sortKey = dateBasis === "applied" ? "9999-99-99" : "0000-00-00";
      } else {
        const x = new Date(d); x.setHours(0, 0, 0, 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const dk = dayKey(x);
        if (dateFilter !== "all") label = formatDayLabel(dateFilter);
        else if (x.getTime() === today.getTime()) label = "Today";
        else if (x.getTime() === yesterday.getTime()) label = "Yesterday";
        else label = formatDayLabel(dk);
        sortKey = dk;
      }
      if (!map[label]) map[label] = [];
      map[label].push(j);
      keyRank.set(label, sortKey);
    });
    const order = Object.keys(map).sort((a, b) => {
      const rank = (label: string) => {
        if (label === "Today") return 0;
        if (label === "Yesterday") return 1;
        if (label === "Not applied yet") return 999;
        return 2;
      };
      const ra = rank(a); const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (keyRank.get(b) ?? "").localeCompare(keyRank.get(a) ?? "");
    });
    return { grouped: map, groupOrder: order };
  }, [filteredJobs, dateBasis, dateFilter]);

  const LIST_PAGE = 24;
  const [listLimit, setListLimit] = useState(LIST_PAGE);
  useEffect(() => {
    setListLimit(LIST_PAGE);
  }, [filterTab, dateFilter, dateBasis, viewMode]);

  const { limitedGrouped, limitedOrder, totalFiltered, shownCount } = useMemo(() => {
    let count = 0;
    const map: Record<string, JobCardType[]> = {};
    const order: string[] = [];
    for (const group of groupOrder) {
      const items: JobCardType[] = [];
      for (const job of grouped[group]) {
        if (count >= listLimit) break;
        items.push(job);
        count++;
      }
      if (items.length) {
        map[group] = items;
        order.push(group);
      }
      if (count >= listLimit) break;
    }
    return {
      limitedGrouped: map,
      limitedOrder: order,
      totalFiltered: filteredJobs.length,
      shownCount: count,
    };
  }, [grouped, groupOrder, listLimit, filteredJobs.length]);

  return (
    <>
      <ToastProvider />

      {deleteTarget && auth.user && (
        <DeletionChallengeModal
          uid={auth.user.uid}
          title="Delete this job?"
          targetLabel="This job"
          description="Delete se pehle Settings → One Password ka answer verify karo."
          confirmLabel="Verify & delete"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(""); } }}
          onConfirm={confirmDelete}
        />
      )}

      {reportBusy && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,0,0,0.4)", backdropFilter: "blur(3px)" }}>
          <div role="dialog" aria-modal="true" aria-live="polite" style={{ width: "min(360px, 100%)", border: "1px solid var(--hairline)", borderRadius: 14, padding: 28, background: "var(--canvas)", boxShadow: "0 18px 60px rgba(15,0,0,0.24)", textAlign: "center" }}>
            <div className="report-loader" aria-hidden="true">
              <span className="report-orbit report-orbit-a" />
              <span className="report-orbit report-orbit-b" />
              <span className="report-core" />
            </div>
            <h2 style={{ margin: "16px 0 4px", fontSize: 16, color: "var(--ink)" }}>Building today's report</h2>
            <p style={{ margin: 0, fontSize: 12, color: "var(--mute)", lineHeight: 1.5 }}>Aaj ki activity collect ho rahi hai…</p>
          </div>
          <style>{`
            @keyframes reportSpin { to { transform: rotate(360deg); } }
            @keyframes reportSpinRev { to { transform: rotate(-360deg); } }
            @keyframes reportPulse { 0%,100% { transform: scale(.7); opacity: .45; } 50% { transform: scale(1); opacity: 1; } }
            .report-loader { position: relative; width: 52px; height: 52px; margin: 0 auto; display: grid; place-items: center; }
            .report-orbit { position: absolute; border-radius: 50%; border: 2px solid transparent; }
            .report-orbit-a { inset: 0; border-top-color: #7c3aed; border-right-color: #7c3aed; animation: reportSpin .9s linear infinite; }
            .report-orbit-b { inset: 7px; border-bottom-color: #0ea5e9; border-left-color: #0ea5e9; animation: reportSpinRev .72s linear infinite; }
            .report-core { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 14px #22c55e; animation: reportPulse .85s ease-in-out infinite; }
          `}</style>
        </div>
      )}

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            Inbox
            {filteredJobs.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--mute)" }}>
                {filteredJobs.length}
              </span>
            )}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", background: "var(--surface-card)", padding: 4, borderRadius: 6, border: "1px solid var(--hairline)" }}>
              {(["list", "cols-2", "cols-3", "cols-4", "board"] as const).map(mode => (
                <button
                  key={mode}
                  className={`view-toggle-btn view-toggle-${mode}`}
                  onClick={() => handleViewModeChange(mode)}
                  style={{
                    background: viewMode === mode ? "var(--ink)" : "transparent",
                    color: viewMode === mode ? "var(--canvas)" : "var(--mute)",
                    border: "none", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                  title={`${mode === "list" ? "List" : mode === "board" ? "Kanban Board" : mode.split("-")[1] + " Columns"}`}
                >
                  {mode === "list" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  ) : mode === "cols-2" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"></rect><rect x="14" y="3" width="7" height="18" rx="1"></rect></svg>
                  ) : mode === "cols-3" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="4" height="18" rx="1"></rect><rect x="10" y="3" width="4" height="18" rx="1"></rect><rect x="17" y="3" width="4" height="18" rx="1"></rect></svg>
                  ) : mode === "board" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect></svg>
                  )}
                </button>
              ))}
            </div>

            <button type="button" className="btn btn-secondary" onClick={downloadTodayReport} disabled={reportBusy} style={{ whiteSpace: "nowrap" }}>
              {reportBusy ? "Preparing…" : "↓ Today's report"}
            </button>
            <a href="/add-job" className="btn btn-primary" style={{ textDecoration: "none" }}>
              + Add job
            </a>
          </div>
        </div>
      </div>

      {!loading && jobs.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 14, borderBottom: "1px solid var(--hairline)" }}>
            {(
              [
                { id: "all", label: "All Jobs" },
                { id: "mine", label: "Added by you" },
                { id: "copied", label: "Taken from others" },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13, fontWeight: filterTab === tab.id ? 700 : 500,
                  color: filterTab === tab.id ? "var(--ink)" : "var(--mute)",
                  padding: "8px 0",
                  borderBottom: filterTab === tab.id ? "2px solid var(--ink)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date-wise filter */}
          <div style={{
            display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
            marginBottom: 20,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--mute)", letterSpacing: "0.04em" }}>
              DATE
            </span>
            <select
              className="form-select"
              value={dateBasis}
              onChange={e => {
                setDateBasis(e.target.value as "added" | "applied");
                setDateFilter("all");
              }}
              style={{
                width: "auto", minWidth: 140, height: 34, fontSize: 12, fontFamily: "inherit",
                padding: "0 10px",
              }}
            >
              <option value="added">Added on</option>
              <option value="applied">Form filled / Applied on</option>
            </select>
            <select
              className="form-select"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              style={{
                width: "auto", minWidth: 160, height: 34, fontSize: 12, fontFamily: "inherit",
                padding: "0 10px",
              }}
            >
              <option value="all">All dates</option>
              {availableDates.map(d => (
                <option key={d} value={d}>{formatDayLabel(d)}</option>
              ))}
            </select>
            {dateFilter !== "all" && (
              <button
                type="button"
                onClick={() => setDateFilter("all")}
                style={{
                  background: "none", border: "1px solid var(--hairline)", borderRadius: 4,
                  padding: "6px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                  color: "var(--mute)",
                }}
              >
                Clear date
              </button>
            )}
          </div>
        </>
      )}

      {loading ? (
        <ShimmerSkeleton variant="jobs" count={4} />
      ) : filteredJobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No jobs found</div>
          <p style={{ marginBottom: 20 }}>
            {dateFilter !== "all"
              ? "Is date pe is filter ke saath koi listing nahi mili."
              : filterTab !== "all"
                ? "Try changing the filter to see jobs."
                : "Start tracking job listings — add your first one."}
          </p>
          <a href="/add-job" className="btn btn-primary" style={{ textDecoration: "none" }}>+ Add job</a>
        </div>
      ) : viewMode === "board" ? (
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>
          {(
            [
              { id: "pending", label: "Not Applied" },
              { id: "applied", label: "Applied" },
              { id: "in_progress", label: "Pending" },
              { id: "no_response", label: "No Response" },
              { id: "selected", label: "Selected" },
              { id: "rejected", label: "Rejected" },
            ] as { id: JobStatus; label: string }[]
          ).map(col => {
            const colJobs = filteredJobs.filter(j => (j.status || "pending") === col.id);
            return (
              <div
                key={col.id}
                style={{
                  flex: "0 0 320px",
                  display: "flex", flexDirection: "column", gap: 12,
                  background: "var(--surface)", padding: "16px 14px", borderRadius: 12,
                  border: "1px solid var(--hairline)", minHeight: "65vh",
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.015)",
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const jobId = e.dataTransfer.getData("text/plain");
                  if (jobId) {
                    const job = jobs.find(j => j.id === jobId);
                    if (job && job.status !== col.id) {
                      updateJobStatus(jobId, col.id).catch(console.error);
                    }
                  }
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", display: "flex", justifyContent: "space-between", paddingBottom: 6, borderBottom: "1px solid var(--hairline)", marginBottom: 4 }}>
                  {col.label} <span style={{ color: "var(--mute)", fontWeight: 600, background: "var(--surface-card)", padding: "0 6px", borderRadius: 12 }}>{colJobs.length}</span>
                </div>
                {colJobs.map((job, i) => (
                  <div key={job.id}>
                    <JobCard
                      job={job}
                      index={i}
                      isOwner={true}
                      showCopy={false}
                      onDelete={handleDelete}
                      onClick={openJob}
                      draggable={true}
                      variant="kanban"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", job.id);
                        e.dataTransfer.effectAllowed = "move";
                        setTimeout(() => {
                          if (e.target instanceof HTMLElement) e.target.style.opacity = "0.5";
                        }, 0);
                      }}
                      onDragEnd={(e) => {
                        if (e.target instanceof HTMLElement) e.target.style.opacity = "1";
                      }}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {limitedOrder.map(group => (
            <div key={group} style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--mute)",
                paddingBottom: 6,
                marginBottom: 0,
                letterSpacing: "0.02em",
              }}>
                {group}
              </div>
              <div className={`job-list ${viewMode !== "list" ? `job-list-grid ${viewMode}` : ""}`}>
                {limitedGrouped[group].map((job, i) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={i}
                    isOwner={true}
                    showCopy={false}
                    onDelete={handleDelete}
                    onClick={openJob}
                  />
                ))}
              </div>
            </div>
          ))}

          {shownCount < totalFiltered && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setListLimit(n => n + LIST_PAGE)}
              style={{ width: "100%", maxWidth: 420, marginBottom: 16 }}
            >
              Load more ({shownCount}/{totalFiltered})
            </button>
          )}

          <a href="/add-job" className="add-btn-row" style={{ textDecoration: "none", marginTop: 4 }}>
            <span className="add-btn-plus">+</span>
            <span>Add job listing</span>
          </a>
        </div>
      )}
    </>
  );
}
