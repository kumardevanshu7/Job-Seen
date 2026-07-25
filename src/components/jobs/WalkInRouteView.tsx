import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  subscribeToUserJobs,
  subscribeToBruteForceJobs,
  addBruteForceJobToRoute,
  bruteForceRouteJobId,
  updateJobStatus,
  updateJobRouteOrder,
  setJobOnRoute,
  type JobCard as JobCardType,
  type JobStatus,
  type BruteForceJob,
} from "../../lib/firestore";
import { showToast, ToastProvider } from "../ui/Toast";
import { deleteJobWithAnswer, deletionProtectionError } from "../../lib/deletionProtection";
import ReasonModal from "../ui/ReasonModal";
import DeletionChallengeModal from "../ui/DeletionChallengeModal";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";
import { safeExternalUrl } from "../../lib/security";

const WALKIN_STATUS: Record<
  "pending" | "interview_done" | "rejected" | "fraud" | "cancelled",
  { label: string; color: string; bg: string; border: string }
> = {
  pending:        { label: "To visit",       color: "#c0392b", bg: "#fff5f5", border: "#f5c6c6" },
  interview_done: { label: "Interview done", color: "#1a7a3c", bg: "#f0faf4", border: "#b7eb8f" },
  rejected:       { label: "Rejected",       color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
  fraud:          { label: "Fraud",          color: "#9b1c1c", bg: "#fef2f2", border: "#fecaca" },
  cancelled:      { label: "Cancelled",      color: "#78716c", bg: "#fafaf9", border: "#d6d3d1" },
};

const SWAP_MS = 340;

function walkinStatusOf(job: JobCardType): keyof typeof WALKIN_STATUS {
  const s = job.status;
  if (s === "interview_done" || s === "rejected" || s === "fraud" || s === "cancelled") return s;
  return "pending";
}

/** Currently part of today's routine */
function isActiveOnRoute(j: JobCardType) {
  if (j.onRoute === true) return true;
  if (j.onRoute === false) return false;
  // legacy walk-ins (no onRoute field) counted as active
  return (j.jobType ?? "online") === "walkin";
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function routeDateOf(j: JobCardType): string {
  return j.routeDate || todayKey();
}

function dateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const t = todayKey();
  if (key === t) return "Today";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function WalkInRouteView() {
  const auth = useStore($auth);
  const [allJobs, setAllJobs] = useState<JobCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bruteLeads, setBruteLeads] = useState<BruteForceJob[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => todayKey());

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flipRef = useRef<{
    a: string;
    b: string;
    firstA: DOMRect;
    firstB: DOMRect;
  } | null>(null);
  const skipSnapshot = useRef(false);

  const routeJobs = allJobs
    .filter(j => isActiveOnRoute(j) && routeDateOf(j) === selectedDate)
    .sort((a, b) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));

  const availableJobs = allJobs.filter(j => !isActiveOnRoute(j));

  // Dates that already have a route (for quick switching).
  const routeDates = Array.from(
    new Set(allJobs.filter(isActiveOnRoute).map(routeDateOf))
  ).sort();
  if (!routeDates.includes(selectedDate)) routeDates.push(selectedDate);
  routeDates.sort();

  useEffect(() => {
    if (!auth.user) return;
    const unsub = subscribeToUserJobs(auth.user.uid, (data) => {
      if (skipSnapshot.current) return;
      setAllJobs(data);
      setLoading(false);
    });
    const unsubBrute = subscribeToBruteForceJobs(auth.user.uid, setBruteLeads);
    return () => { unsub(); unsubBrute(); };
  }, [auth.user]);

  useLayoutEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;
    flipRef.current = null;

    const elA = itemRefs.current[flip.a];
    const elB = itemRefs.current[flip.b];
    if (!elA || !elB) {
      setAnimating(false);
      return;
    }

    const lastA = elA.getBoundingClientRect();
    const lastB = elB.getBoundingClientRect();
    const dyA = flip.firstA.top - lastA.top;
    const dyB = flip.firstB.top - lastB.top;

    const prep = (el: HTMLDivElement, dy: number) => {
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      el.style.zIndex = "2";
      el.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
    };
    prep(elA, dyA);
    prep(elB, dyB);
    void elA.offsetHeight;

    const play = (el: HTMLDivElement) => {
      el.style.transition = `transform ${SWAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow ${SWAP_MS}ms ease`;
      el.style.transform = "translateY(0)";
      el.style.boxShadow = "none";
    };
    play(elA);
    play(elB);

    const timer = window.setTimeout(() => {
      for (const el of [elA, elB]) {
        el.style.transition = "";
        el.style.transform = "";
        el.style.zIndex = "";
        el.style.boxShadow = "";
      }
      setAnimating(false);
      skipSnapshot.current = false;
    }, SWAP_MS + 40);

    return () => window.clearTimeout(timer);
  }, [routeJobs.map(j => j.id).join(",")]);

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= routeJobs.length || animating) return;

    const idA = routeJobs[index].id;
    const idB = routeJobs[next].id;
    const elA = itemRefs.current[idA];
    const elB = itemRefs.current[idB];

    if (elA && elB) {
      flipRef.current = {
        a: idA,
        b: idB,
        firstA: elA.getBoundingClientRect(),
        firstB: elB.getBoundingClientRect(),
      };
      setAnimating(true);
      skipSnapshot.current = true;
    }

    const reordered = [...routeJobs];
    const tmp = reordered[index];
    reordered[index] = reordered[next];
    reordered[next] = tmp;

    // optimistic local update
    const orderMap = new Map(reordered.map((j, i) => [j.id, i + 1]));
    setAllJobs(prev => prev.map(j =>
      orderMap.has(j.id) ? { ...j, routeOrder: orderMap.get(j.id)! } : j
    ));

    setSavingOrder(true);
    try {
      await updateJobRouteOrder(
        reordered.map((j, i) => ({ id: j.id, routeOrder: i + 1 }))
      );
    } catch {
      showToast("Couldn’t save order.", "error");
      skipSnapshot.current = false;
    } finally {
      setSavingOrder(false);
    }
  }

  async function addToRoute(jobId: string) {
    try {
      await setJobOnRoute(jobId, true, Date.now(), selectedDate);
      showToast(`Added to ${dateLabel(selectedDate)} route.`, "success");
    } catch {
      showToast("Couldn’t add to route.", "error");
    }
  }

  // Active Brute Force leads not yet on the route.
  const routeLeadIds = new Set(allJobs.map(j => j.id));
  const availableBruteLeads = bruteLeads.filter(lead => {
    if (lead.decision !== "pending") return false;
    const routeId = auth.user ? bruteForceRouteJobId(auth.user.uid, lead.id) : "";
    const job = allJobs.find(j => j.id === routeId);
    return !job || !isActiveOnRoute(job);
  });

  async function addBruteLeadToRoute(lead: BruteForceJob) {
    if (!auth.user || !auth.profile) { showToast("Not logged in.", "error"); return; }
    setAddingId(lead.id);
    try {
      const routeId = bruteForceRouteJobId(auth.user.uid, lead.id);
      await addBruteForceJobToRoute(lead, auth.user.uid, auth.profile.username, routeLeadIds.has(routeId), selectedDate);
      showToast(`Brute Force lead ${dateLabel(selectedDate)} route mein add ho gaya.`, "success");
    } catch (err: any) {
      showToast(err.message ?? "Couldn’t add lead to route.", "error");
    } finally {
      setAddingId(null);
    }
  }

  async function setStatus(jobId: string, status: JobStatus, cancelReason?: string) {
    setActiveId(null);
    try {
      await updateJobStatus(jobId, status, cancelReason ? { cancelReason } : undefined);
      showToast(`Marked: ${WALKIN_STATUS[status as keyof typeof WALKIN_STATUS]?.label ?? status}`, "success");
    } catch {
      showToast("Failed to update status.", "error");
    }
  }

  async function confirmDelete(answer: string) {
    if (!deleteTarget || !auth.user) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteJobWithAnswer(auth.user.uid, deleteTarget, answer);
      showToast("Job deleted.", "info");
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(deletionProtectionError(error));
    } finally {
      setDeleteBusy(false);
    }
  }

  const activeJob = routeJobs.find(j => j.id === activeId) ?? null;
  const doneCount = routeJobs.filter(j => walkinStatusOf(j) !== "pending").length;

  return (
    <>
      <ToastProvider />

      {cancelTarget && (
        <ReasonModal
          title="Why cancelled?"
          hint="Short mein likh do — kyu cancel kiya."
          confirmLabel="Mark Cancelled"
          onCancel={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            const id = cancelTarget;
            setCancelTarget(null);
            await setStatus(id, "cancelled", reason);
          }}
        />
      )}

      {deleteTarget && auth.user && (
        <DeletionChallengeModal
          uid={auth.user.uid}
          title="Delete this job?"
          targetLabel="This route job"
          busy={deleteBusy}
          error={deleteError}
          onCancel={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(""); } }}
          onConfirm={confirmDelete}
        />
      )}

      {/* Existing jobs picker — no create */}
      {pickerOpen && (
        <>
          <div
            onClick={() => setPickerOpen(false)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(2px)",
              zIndex: 9000,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 9001,
              width: "min(560px, calc(100vw - 28px))",
              maxHeight: "min(72vh, 640px)",
              background: "var(--canvas)",
              border: "1.5px solid var(--hairline)",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              display: "flex",
              flexDirection: "column",
              fontFamily: "inherit",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--hairline)" }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink)" }}>Add to {dateLabel(selectedDate)} route</div>
              <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 4 }}>
                Jobs aur active Brute Force leads — select karke route mein daalo.
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: "inherit" }}>
                Route date
                <input
                  type="date"
                  value={selectedDate}
                  min={todayKey()}
                  onChange={e => setSelectedDate(e.target.value || todayKey())}
                  className="form-input"
                  style={{ width: "auto", height: 34, fontSize: 12, fontFamily: "inherit", padding: "0 10px" }}
                />
              </label>
            </div>
            <div style={{ overflowY: "auto", padding: 12, flex: 1 }}>
              {allJobs.length === 0 && availableBruteLeads.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--mute)", padding: 12 }}>
                  Abhi koi job/lead nahi hai. Pehle Add Job ya Brute Force se banao.
                </div>
              ) : allJobs.length === 0 ? null : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allJobs
                    .slice()
                    .sort((a, b) => {
                      const aA = isActiveOnRoute(a) ? 0 : 1;
                      const bA = isActiveOnRoute(b) ? 0 : 1;
                      if (aA !== bA) return aA - bA;
                      return (a.company || "").localeCompare(b.company || "");
                    })
                    .map(job => {
                      const active = isActiveOnRoute(job);
                      const isOnline = (job.jobType ?? "online") === "online";
                      return (
                        <div
                          key={job.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "12px 12px",
                            border: "1.5px solid var(--hairline)",
                            borderRadius: 8,
                            background: active ? "#f0faf4" : "var(--canvas)",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>
                                {job.company || "Company"}
                              </span>
                              {active && (
                                <span style={{
                                  fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                                  color: "#1a7a3c", background: "#dcfce7",
                                  border: "1px solid #86efac",
                                  padding: "1px 7px", borderRadius: 999, textTransform: "uppercase",
                                }}>
                                  active
                                </span>
                              )}
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: "var(--mute)",
                                background: "var(--surface-soft, #f5f3f3)",
                                padding: "1px 6px", borderRadius: 4,
                              }}>
                                {isOnline ? "online" : "walk-in"}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>
                              {job.role}{job.location ? ` · ${job.location}` : ""}
                            </div>
                          </div>
                          {active ? (
                            <span style={{ fontSize: 11, color: "#1a7a3c", fontWeight: 700, whiteSpace: "nowrap" }}>
                              in routine
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => addToRoute(job.id)}
                              style={{ whiteSpace: "nowrap" }}
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {availableBruteLeads.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#0369a1", marginBottom: 8 }}>
                    Active Brute Force leads
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {availableBruteLeads.map(lead => (
                      <div
                        key={lead.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", border: "1.5px solid #bae6fd", borderRadius: 8, background: "#f0f9ff" }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{lead.company || "Company"}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", padding: "1px 6px", borderRadius: 4 }}>
                              brute force
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--mute)", marginTop: 2 }}>
                            {lead.role}{lead.location ? ` · ${lead.location}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={addingId === lead.id}
                          onClick={() => addBruteLeadToRoute(lead)}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {addingId === lead.id ? "Adding…" : "+ Add"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}

      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <a href="/" style={{ fontSize: 13, color: "var(--mute)", textDecoration: "none" }}>
            ← Inbox
          </a>
        </div>
        <h1 className="page-title">Walk-in Route</h1>
        <p className="page-subtitle">
          Sirf existing jobs — order ↑↓ se set karo, tap karke status mark karo.
          {routeJobs.length > 0 && (
            <span style={{ color: "var(--ink)", fontWeight: 600 }}> {doneCount}/{routeJobs.length} done</span>
          )}
          {savingOrder && <span style={{ color: "var(--mute)" }}> · saving…</span>}
        </p>
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setPickerOpen(true)}
        >
          + Add to route
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 12 }}>
        {routeDates.map(dk => {
          const count = allJobs.filter(j => isActiveOnRoute(j) && routeDateOf(j) === dk).length;
          const active = dk === selectedDate;
          return (
            <button
              key={dk}
              type="button"
              onClick={() => setSelectedDate(dk)}
              style={{
                flex: "0 0 auto", cursor: "pointer", fontFamily: "inherit",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                minWidth: 64, padding: "8px 12px", borderRadius: 10,
                border: `1.5px solid ${active ? "var(--ink)" : "var(--hairline)"}`,
                background: active ? "var(--ink)" : "var(--canvas)",
                color: active ? "var(--canvas)" : "var(--body)",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{dateLabel(dk)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8 }}>{count} stop{count === 1 ? "" : "s"}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <ShimmerSkeleton variant="route" count={3} />
      ) : routeJobs.length === 0 ? (
        <div className="form-card" style={{ maxWidth: 520, padding: "28px 24px" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No active stops</div>
          <div style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.5 }}>
            “+ Add to route” se existing jobs ki table kholo aur routine me daalo.
            {availableJobs.length === 0 && allJobs.length === 0 && (
              <> Pehle Add Job page se job banao.</>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
          {routeJobs.map((job, i) => {
            const st = walkinStatusOf(job);
            const cfg = WALKIN_STATUS[st];
            const isDone = st !== "pending";
            const isOnline = (job.jobType ?? "online") === "online";
            return (
              <div
                key={job.id}
                ref={el => { itemRefs.current[job.id] = el; }}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "stretch",
                  willChange: animating ? "transform" : undefined,
                  position: "relative",
                }}
              >
                <div style={{
                  display: "flex", flexDirection: "column", gap: 4,
                  justifyContent: "center", flexShrink: 0,
                }}>
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0 || animating}
                    onClick={() => move(i, -1)}
                    style={{
                      width: 34, height: 28, borderRadius: 6,
                      border: "1.5px solid var(--hairline)",
                      background: i === 0 || animating ? "var(--surface-card)" : "var(--canvas)",
                      color: i === 0 || animating ? "var(--mute)" : "var(--ink)",
                      cursor: i === 0 || animating ? "default" : "pointer",
                      fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === routeJobs.length - 1 || animating}
                    onClick={() => move(i, 1)}
                    style={{
                      width: 34, height: 28, borderRadius: 6,
                      border: "1.5px solid var(--hairline)",
                      background: i === routeJobs.length - 1 || animating ? "var(--surface-card)" : "var(--canvas)",
                      color: i === routeJobs.length - 1 || animating ? "var(--mute)" : "var(--ink)",
                      cursor: i === routeJobs.length - 1 || animating ? "default" : "pointer",
                      fontWeight: 700, fontSize: 12, fontFamily: "inherit",
                    }}
                  >
                    ↓
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveId(job.id)}
                  style={{
                    flex: 1, textAlign: "left", cursor: "pointer",
                    border: `1.5px solid ${isDone ? cfg.border : "var(--hairline)"}`,
                    background: isDone ? cfg.bg : "var(--canvas)",
                    borderRadius: 10, padding: "14px 16px",
                    fontFamily: "inherit",
                    opacity: st === "fraud" || st === "rejected" || st === "cancelled" ? 0.85 : 1,
                    boxShadow: activeId === job.id ? "0 0 0 2px var(--ink)" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: isDone ? cfg.color : "var(--ink)",
                        color: "#fff", fontSize: 11, fontWeight: 800,
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isDone ? "✓" : i + 1}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                        {job.company || "Company"}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
                        color: "#1a7a3c", background: "#dcfce7",
                        border: "1px solid #86efac",
                        padding: "1px 7px", borderRadius: 999, textTransform: "uppercase",
                      }}>
                        active
                      </span>
                      {isOnline && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: "#c2410c",
                          background: "#fff7ed", border: "1px solid #fdba74",
                          padding: "1px 6px", borderRadius: 4,
                        }}>
                          online
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                      color: cfg.color, background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                      padding: "2px 8px", borderRadius: 999,
                    }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--body)", marginBottom: 4 }}>
                    {job.role}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--mute)", display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                    {job.employmentType && (
                      <span>
                        {job.employmentType === "full_time" ? "full-time"
                          : job.employmentType === "part_time" ? "part-time"
                          : "internship"}
                      </span>
                    )}
                    {job.employmentType === "internship" && job.internshipMonths && (
                      <span>{job.internshipMonths} mo</span>
                    )}
                    {job.employmentType === "internship" && job.ppo && (
                      <span>PPO: {job.ppo}</span>
                    )}
                    {job.location && <span>📍 {job.location}</span>}
                    {job.nearestMetro && <span>🚇 {job.nearestMetro}</span>}
                    {job.appliedVia && <span>via {job.appliedVia}</span>}
                    {st === "cancelled" && job.cancelReason && <span>why: {job.cancelReason}</span>}
                  </div>
                  {(job.mapLink || job.applyLink) && (
                    <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {safeExternalUrl(job.mapLink) && (
                        <a
                          href={safeExternalUrl(job.mapLink)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}
                        >
                          Open map →
                        </a>
                      )}
                      {safeExternalUrl(job.applyLink) && (
                        <a
                          href={safeExternalUrl(job.applyLink)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 12, color: "var(--mute)", fontWeight: 600 }}
                        >
                          Apply link →
                        </a>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeJob && (
        <>
          <div
            onClick={() => setActiveId(null)}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(2px)",
              zIndex: 9000,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: "50%", bottom: 24, transform: "translateX(-50%)",
              zIndex: 9001,
              width: "min(420px, calc(100vw - 32px))",
              background: "var(--canvas)",
              border: "1.5px solid var(--hairline)",
              borderRadius: 12,
              padding: "20px 18px 16px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              {activeJob.company}
            </div>
            <div style={{ fontSize: 13, color: "var(--mute)", marginBottom: 16 }}>
              {activeJob.role} · mark this stop
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={`/job?id=${encodeURIComponent(activeJob.id)}`}
                className="btn btn-primary"
                style={{ justifyContent: "center", textDecoration: "none" }}
              >
                View full details →
              </a>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStatus(activeJob.id, "interview_done")}
                style={{ justifyContent: "center", background: "#f0faf4", color: "#1a7a3c", borderColor: "#b7eb8f" }}
              >
                Interview done
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStatus(activeJob.id, "rejected")}
                style={{ justifyContent: "center" }}
              >
                Rejected
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStatus(activeJob.id, "fraud")}
                style={{ justifyContent: "center", color: "#9b1c1c", borderColor: "#fecaca" }}
              >
                Fraud
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setActiveId(null);
                  setCancelTarget(activeJob.id);
                }}
                style={{ justifyContent: "center", color: "#78716c" }}
              >
                Cancelled
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  const job = activeJob;
                  setActiveId(null);
                  try {
                    await setJobOnRoute(job.id, false);
                    showToast("Removed from active route.", "info");
                  } catch {
                    showToast("Failed to remove from route.", "error");
                  }
                }}
                style={{ justifyContent: "center" }}
              >
                Remove from route
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setActiveId(null);
                  setDeleteError("");
                  setDeleteTarget(activeJob.id);
                }}
                style={{ justifyContent: "center", color: "#dc2626", borderColor: "#fecaca" }}
              >
                Delete job
              </button>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                style={{
                  marginTop: 4, background: "none", border: "none",
                  color: "var(--mute)", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
