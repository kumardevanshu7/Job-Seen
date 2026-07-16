import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { searchUserByUsername, getJobsByUID, getConnectedUIDs } from "../../lib/firestore";
import type { JobCard as JobCardType, UserProfile } from "../../lib/firestore";
import JobCard from "../jobs/JobCard";
import { ToastProvider } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

interface Props { username: string; }

export default function UserJobsView({ username }: Props) {
  const auth = useStore($auth);
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<JobCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      try {
        const user = await searchUserByUsername(username);
        if (!user) { setNotFound(true); setLoading(false); return; }
        setTargetUser(user);

        // Use getConnectedUIDs — same function that powers the "Connected users" list
        const connectedUIDs = await getConnectedUIDs(auth.user!.uid);
        const isConnected = connectedUIDs.includes(user.uid);
        const isSelf = auth.user!.uid === user.uid;
        setConnected(isConnected);

        if (isConnected || isSelf) {
          const userJobs = await getJobsByUID(user.uid);
          setJobs(userJobs);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load. Check Firestore rules.");
      } finally {
        setLoading(false);
      }
    })();
  }, [auth.user, username]);

  return (
    <>
      <ToastProvider />
      <a href="/users" style={{ fontSize: 14, color: "var(--mute)", textDecoration: "none", display: "block", marginBottom: 24 }}>
        ← back to users
      </a>

      {loading ? (
        <ShimmerSkeleton variant="jobs" count={3} />
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-marker" style={{ color: "var(--danger)" }}>[-] error</div>
          <p style={{ color: "var(--mute)" }}>{error}</p>
        </div>
      ) : notFound ? (
        <div className="empty-state">
          <div className="empty-state-marker">[-] user not found</div>
          <p style={{ color: "var(--mute)" }}>no user with username @{username}</p>
        </div>
      ) : !connected && auth.user?.uid !== targetUser?.uid ? (
        <div className="empty-state">
          <div className="empty-state-marker">[-] not connected</div>
          <p style={{ color: "var(--mute)", marginBottom: 24 }}>
            connect with @{username} to view their job listings.
          </p>
          <a href="/users" className="btn btn-primary">[+] find & connect</a>
        </div>
      ) : (
        <>
          <div className="page-header">
            <h1 className="page-title">{targetUser?.displayName}</h1>
            <p className="page-subtitle">@{targetUser?.username}</p>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-marker">[-] no jobs yet</div>
              <p style={{ color: "var(--mute)" }}>{targetUser?.displayName} hasn't added any jobs.</p>
            </div>
          ) : (
            <div className="job-list">
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  showCopy={true}
                  isOwner={false}
                  onClick={(j) => { window.location.href = `/job?id=${encodeURIComponent(j.id)}`; }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
