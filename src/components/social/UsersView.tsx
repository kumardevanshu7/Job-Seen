import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import {
  getConnectedUIDs, getUsersByUIDs, searchUserByUsername,
  sendConnectionRequest, getRequestStatus,
} from "../../lib/firestore";
import type { UserProfile } from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";

export default function UsersView() {
  const auth = useStore($auth);
  const [connections, setConnections] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<UserProfile | null | "not-found">(null);
  const [searching, setSearching] = useState(false);
  const [reqStatus, setReqStatus] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.user) return;
    (async () => {
      const uids = await getConnectedUIDs(auth.user!.uid);
      setConnections(await getUsersByUIDs(uids));
    })();
  }, [auth.user]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    const found = await searchUserByUsername(query.trim());
    if (!found || found.uid === auth.user?.uid) {
      setResult("not-found");
    } else {
      setResult(found);
      const status = await getRequestStatus(auth.user!.uid, found.uid);
      setReqStatus(p => ({ ...p, [found.uid]: status }));
    }
    setSearching(false);
  }

  async function handleRequest(target: UserProfile) {
    if (!auth.user || !auth.profile) return;
    setSending(target.uid);
    try {
      await sendConnectionRequest(auth.user.uid, auth.profile.username, auth.profile.displayName, target.uid);
      setReqStatus(p => ({ ...p, [target.uid]: "pending" }));
      showToast(`Request sent to @${target.username}`, "success");
    } catch {
      showToast("Failed to send request.", "error");
    } finally {
      setSending(null);
    }
  }

  function initials(name: string) {
    return name.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();
  }

  function UserRow({ user }: { user: UserProfile }) {
    const status = reqStatus[user.uid] || "none";
    const isConn = connections.some(c => c.uid === user.uid);
    return (
      <div className="user-row">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user.photoURL && (
            <img 
              src={user.photoURL} 
              alt="avatar" 
              className="user-avatar" 
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as any).style.display = 'flex'; }}
              style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "50%" }} 
            />
          )}
          <div className="user-avatar" style={{ display: user.photoURL ? 'none' : 'flex' }}>{initials(user.displayName)}</div>
          <div>
            <div className="user-info-name">{user.displayName}</div>
            <div className="user-info-handle">@{user.username}</div>
          </div>
        </div>
        <div>
          {isConn || status === "accepted" ? (
            <span className="badge badge-success">Connected</span>
          ) : status === "pending" ? (
            <span className="badge badge-muted">Pending</span>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleRequest(user)}
              disabled={sending === user.uid}
            >
              {sending === user.uid
                ? <div className="spinner" style={{ width: 11, height: 11 }} />
                : "+ Connect"
              }
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <ToastProvider />

      <div className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Find people and manage your connections.</p>
      </div>

      {/* Search */}
      <div className="settings-section">
        <div className="settings-section-title">Find a user</div>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input
            id="user-search-input"
            className="form-input"
            placeholder="Search by username…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, fontFamily: "inherit" }}
          />
          <button type="submit" className="btn btn-primary" disabled={searching} style={{ flexShrink: 0 }}>
            {searching ? <div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> : "Search"}
          </button>
        </form>

        {result === "not-found" && (
          <p style={{ fontSize: 13, color: "var(--mute)" }}>No user found with that username.</p>
        )}
        {result && result !== "not-found" && <UserRow user={result} />}
      </div>

      {/* Connections */}
      <div>
        <div className="settings-section-title">
          Connected users
          {connections.length > 0 && (
            <span style={{ fontWeight: 400, color: "var(--mute)", marginLeft: 6 }}>{connections.length}</span>
          )}
        </div>

        {connections.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No connections yet</div>
            <p>Search for users above and send a connection request.</p>
          </div>
        ) : (
          <div>
            {connections.map(user => (
              <a key={user.uid} href={`/users/${user.username}`}
                style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                <div className="user-row">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="user-avatar">{user.displayName.slice(0,2).toUpperCase()}</div>
                    <div>
                      <div className="user-info-name">{user.displayName}</div>
                      <div className="user-info-handle">@{user.username}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--mute)" }}>View jobs →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
