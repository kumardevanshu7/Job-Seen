import React from "react";
import type { JobCard as JobCardType, JobStatus } from "../../lib/firestore";
import { updateJobStatus } from "../../lib/firestore";
import { showToast } from "../ui/Toast";

interface Props {
  job: JobCardType;
  onClose: () => void;
}

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

function formatDetailedDate(d: any): string {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobDetailsModal({ job, onClose }: Props) {
  const [updating, setUpdating] = React.useState(false);
  const statusConfig = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;

  async function handleStatusUpdate(newStatus: JobStatus) {
    setUpdating(true);
    try {
      await updateJobStatus(job.id, newStatus);
      showToast(`Status updated to ${STATUS_CONFIG[newStatus].label}`, "success");
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setUpdating(false);
    }
  }

  function handleModalClick(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 10000,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={handleModalClick}
        style={{
          background: "var(--canvas)",
          width: "100%",
          maxWidth: 600,
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.06em", background: "var(--ink)",
                color: "var(--canvas)", padding: "4px 10px", borderRadius: 4,
              }}>
                {job.company || "Company"}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: statusConfig.color, background: statusConfig.bg,
                border: `1px solid ${statusConfig.border}`,
                padding: "3px 8px", borderRadius: 12,
              }}>
                {statusConfig.label}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--ink)" }}>
              {job.role || "Job Role"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 4, color: "var(--mute)", display: "flex", alignItems: "center"
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 24, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Source</div>
              <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{job.platform || "Not specified"}</div>
            </div>
            
            {(job.ctc || job.salary) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Salary / CTC</div>
                <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{job.ctc || job.salary}</div>
              </div>
            )}

            {job.batch && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Batch</div>
                <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{job.batch}</div>
              </div>
            )}

            {job.bond && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Bond</div>
                <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{job.bond}</div>
              </div>
            )}
            
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Date Added</div>
              <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>{formatDetailedDate(job.createdAt)}</div>
            </div>
          </div>

          {job.note && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Notes</div>
              <div style={{ 
                fontSize: 14, color: "var(--ink)", lineHeight: 1.6, 
                background: "var(--surface-soft)", padding: 16, borderRadius: 8,
                whiteSpace: "pre-wrap"
              }}>
                {job.note}
              </div>
            </div>
          )}

          {job.link && (
            <div style={{ marginBottom: 24 }}>
              <a 
                href={job.link} 
                target="_blank" 
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: "var(--ink)", color: "var(--canvas)",
                  padding: "10px 20px", borderRadius: 6, textDecoration: "none",
                  fontWeight: 600, fontSize: 14
                }}
              >
                Open Job Link
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </a>
            </div>
          )}

          {/* Action Buttons inside modal */}
          <div style={{ borderTop: "1px solid var(--hairline)", paddingTop: 24, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Update Status</div>
            
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {job.status === "pending" && (
                <button
                  onClick={() => handleStatusUpdate("applied")}
                  disabled={updating}
                  style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }}
                >
                  ✓ Mark as Applied
                </button>
              )}
              {(job.status === "applied" || job.status === "no_response" || job.status === "in_progress") && (
                <>
                  <button onClick={() => handleStatusUpdate("in_progress")} disabled={updating} style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309" }}>
                    Pending ⏳
                  </button>
                  <button onClick={() => handleStatusUpdate("selected")} disabled={updating} style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#fef9c3", border: "1px solid #fcd34d", color: "#92400e" }}>
                    Selected 🎉
                  </button>
                  <button onClick={() => handleStatusUpdate("rejected")} disabled={updating} style={{ fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#475569" }}>
                    Rejected
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
