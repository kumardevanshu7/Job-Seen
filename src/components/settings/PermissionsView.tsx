import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { getConnectedUIDs, getUsersByUIDs, getPermission, setPermission } from "../../lib/firestore";
import type { UserProfile } from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";
import ShimmerSkeleton from "../ui/ShimmerSkeleton";

export default function PermissionsView() {
  const auth = useStore($auth);
  const [connections, setConnections] = useState<UserProfile[]>([]);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      const uids = await getConnectedUIDs(auth.user!.uid);
      const profiles = await getUsersByUIDs(uids);
      setConnections(profiles);
      const p: Record<string, boolean> = {};
      for (const u of profiles) p[u.uid] = await getPermission(auth.user!.uid, u.uid);
      setPerms(p);
      setLoading(false);
    })();
  }, [auth.user]);

  async function toggle(uid: string, username: string) {
    if (!auth.user || toggling) return;
    setToggling(uid);
    const next = !(perms[uid] ?? false);
    try {
      await setPermission(auth.user.uid, uid, next);
      setPerms(p => ({ ...p, [uid]: next }));
      showToast(
        next ? `@${username} can now copy your jobs.` : `@${username} can no longer copy.`,
        next ? "success" : "info"
      );
    } catch {
      showToast("Failed to update.", "error");
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return <ShimmerSkeleton variant="list" count={4} />;
  }

  return (
    <>
      <ToastProvider />

      <div className="page-header">
        <h1 className="page-title">Permissions</h1>
        <p className="page-subtitle">
          Allow connections to copy your job listings. Ownership transfers on copy.
        </p>
      </div>

      {connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">No connections</div>
          <p style={{ marginBottom: 16 }}>Connect with users first to manage permissions.</p>
          <a href="/users" className="btn btn-primary" style={{ textDecoration: "none" }}>+ Find users</a>
        </div>
      ) : (
        <div>
          {connections.map(user => {
            const on = perms[user.uid] ?? false;
            return (
              <div key={user.uid} className="toggle-row">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                    {user.displayName.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div className="user-info-name">{user.displayName}</div>
                    <div className="user-info-handle">
                      @{user.username}
                      {" · "}
                      <span style={{ color: on ? "var(--success)" : "var(--ash)" }}>
                        {on ? "can copy" : "cannot copy"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  className={`pill-toggle ${on ? "on" : ""}`}
                  onClick={() => toggle(user.uid, user.username)}
                  disabled={toggling === user.uid}
                >
                  {toggling === user.uid ? "…" : on ? "On" : "Off"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
