import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth, setAuthState } from "../../stores/authStore";
import { subscribeToUserJobs, deleteJob, updateJobStatus, setUserDeletePin, verifyUserDeletePin } from "../../lib/firestore";
import type { JobCard as JobCardType, JobStatus } from "../../lib/firestore";
import JobCard from "./JobCard";
import { ToastProvider, showToast } from "../ui/Toast";
import DeletePinModal from "../ui/DeletePinModal";
import JobDetailsModal from "./JobDetailsModal";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

export default function HomeView() {
  const auth = useStore($auth);
  const [jobs, setJobs] = useState<JobCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobCardType | null>(null);
  const [viewMode, setViewMode] = useState<string>("list");
  const [filterTab, setFilterTab] = useState<"all"|"mine"|"copied">("all");

  const hasDeletePin = !!auth.profile?.deletePinHash;

  useEffect(() => {
    const saved = localStorage.getItem("jobseen_view_mode");
    if (saved) setViewMode(saved);
  }, []);

  useEffect(() => {
    // Adjust container width based on view mode to utilize space better
    const mainInner = document.querySelector('.main-inner') as HTMLElement;
    if (mainInner) {
      if (viewMode === 'list') mainInner.style.maxWidth = '760px';
      else if (viewMode === 'board') mainInner.style.maxWidth = '100%';
      else if (viewMode === 'cols-2') mainInner.style.maxWidth = '900px';
      else mainInner.style.maxWidth = '1200px';
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
    return () => unsub();
  }, [auth.user]);

  function handleDelete(id: string) {
    setDeleteTarget(id);
  }

  async function confirmDeleteWithPin(pin: string) {
    if (!deleteTarget || !auth.user) return;
    if (!hasDeletePin) {
      const hash = await setUserDeletePin(auth.user.uid, pin);
      setAuthState({
        profile: auth.profile ? { ...auth.profile, deletePinHash: hash } : auth.profile,
      });
    } else {
      const ok = await verifyUserDeletePin(auth.user.uid, pin, auth.profile?.deletePinHash);
      if (!ok) throw new Error("Galat code. Dobara try karo.");
    }
    await deleteJob(deleteTarget);
    showToast("Job removed.", "info");
    setDeleteTarget(null);
  }

  // Group by date added (today, yesterday, earlier)
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  function groupLabel(job: JobCardType): string {
    if (!job.createdAt) return "Earlier";
    const d = job.createdAt.toDate ? job.createdAt.toDate() : new Date(job.createdAt);
    d.setHours(0,0,0,0);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === yesterday.getTime()) return "Yesterday";
    return "Earlier";
  }

  const filteredJobs = jobs.filter(j => {
    // Walk-ins live on /walk-in route planner, not inbox
    if ((j.jobType ?? "online") === "walkin") return false;
    if (filterTab === "mine") return !j.copiedFromUID;
    if (filterTab === "copied") return !!j.copiedFromUID;
    return true;
  });

  const grouped: Record<string, JobCardType[]> = {};
  filteredJobs.forEach(j => {
    const label = groupLabel(j);
    if (!grouped[label]) grouped[label] = [];
    grouped[label].push(j);
  });
  const groupOrder = ["Today", "Yesterday", "Earlier"].filter(g => grouped[g]?.length);

  return (
    <>
      <ToastProvider />

      {/* Delete with secret PIN */}
      {deleteTarget && (
        <DeletePinModal
          mode={hasDeletePin ? "verify" : "setup"}
          confirmLabel={hasDeletePin ? "Delete" : "Set & Delete"}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDeleteWithPin}
        />
      )}

      {/* Job Details Modal */}
      {selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}

      {/* Page header */}
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
            {/* View Toggles */}
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
            
            <a href="/add-job" className="btn btn-primary" style={{ textDecoration: "none" }}>
              + Add job
            </a>
          </div>
        </div>
      </div>

      {!loading && jobs.length > 0 && (
        <div style={{ display: "flex", gap: 24, marginBottom: 20, borderBottom: "1px solid var(--hairline)" }}>
          {(
            [
              { id: "all", label: "All Jobs" },
              { id: "mine", label: "Added by you" },
              { id: "copied", label: "Taken from others" }
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              style={{
                background: "none", border: "none",
                padding: "0 4px 12px",
                fontSize: 14, fontWeight: filterTab === tab.id ? 600 : 500,
                color: filterTab === tab.id ? "var(--ink)" : "var(--mute)",
                borderBottom: filterTab === tab.id ? "2px solid var(--ink)" : "2px solid transparent",
                cursor: "pointer", fontFamily: "inherit"
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <ShimmerSkeleton variant="jobs" count={4} />
      ) : filteredJobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No jobs found</div>
          <p style={{ marginBottom: 20 }}>{filterTab !== "all" ? "Try changing the filter to see jobs." : "Start tracking job listings — add your first one."}</p>
          <a href="/add-job" className="btn btn-primary" style={{ textDecoration: "none" }}>+ Add job</a>
        </div>
      ) : viewMode === "board" ? (
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>
          {(
            [
              { id: "pending", label: "Not Applied" },
              { id: "applied", label: "Applied ✓" },
              { id: "in_progress", label: "Pending ⏳" },
              { id: "no_response", label: "No Response" },
              { id: "rejected", label: "Rejected" },
              { id: "selected", label: "🎉 Selected!" },
            ] as const
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
                  boxShadow: "inset 0 2px 4px rgba(0,0,0,0.015)"
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
                      onClick={setSelectedJob}
                      draggable={true}
                      variant="kanban"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", job.id);
                        e.dataTransfer.effectAllowed = "move";
                        // Add a slight transparency to the dragged item
                        setTimeout(() => {
                           if (e.target instanceof HTMLElement) {
                             e.target.style.opacity = "0.5";
                           }
                        }, 0);
                      }}
                      onDragEnd={(e) => {
                         if (e.target instanceof HTMLElement) {
                           e.target.style.opacity = "1";
                         }
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
          {groupOrder.map(group => (
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
                {grouped[group].map((job, i) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={i}
                    isOwner={true}
                    showCopy={false}
                    onDelete={handleDelete}
                    onClick={setSelectedJob}
                  />
                ))}
              </div>
            </div>
          ))}

          <a href="/add-job" className="add-btn-row" style={{ textDecoration: "none", marginTop: 4 }}>
            <span className="add-btn-plus">+</span>
            <span>Add job listing</span>
          </a>
        </div>
      )}
    </>
  );
}
