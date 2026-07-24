import { useStore } from "@nanostores/react";
import { $notifications } from "../../stores/notificationStore";
import { $auth } from "../../stores/authStore";
import { respondToRequest } from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";
import { useState } from "react";

function timeAgo(ts: any): string {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

export default function NotificationsView() {
  const notifications = useStore($notifications);
  const auth = useStore($auth);
  const [responding, setResponding] = useState<string | null>(null);

  async function respond(notifId: string, requestId: string, action: "accepted" | "declined") {
    if (!auth.user) return;
    setResponding(notifId);
    try {
      await respondToRequest(requestId, notifId, action, auth.user.uid);
      showToast(action === "accepted" ? "Connection accepted." : "Request declined.", action === "accepted" ? "success" : "info");
    } catch {
      showToast("Something went wrong.", "error");
    } finally {
      setResponding(null);
    }
  }

  const unread = notifications.filter(n => n.status === "unread");
  const read = notifications.filter(n => n.status !== "unread");

  function NotifRow({ notif }: { notif: any }) {
    const pending = notif.status === "unread";
    return (
      <div className="notif-row">
        {pending && <div className="notif-dot" />}
        {!pending && <div style={{ width: 8, flexShrink: 0 }} />}

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 600 }}>{notif.senderDisplayName}</span>
            {" wants to connect with you"}
          </div>
          <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 2 }}>
            @{notif.senderUsername} · {timeAgo(notif.createdAt)}
          </div>
        </div>

        {pending ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              className="btn btn-success btn-sm"
              onClick={() => respond(notif.id, notif.requestId, "accepted")}
              disabled={responding === notif.id}
            >
              {responding === notif.id
                ? <div className="spinner" style={{ width: 11, height: 11 }} />
                : "Accept"
              }
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => respond(notif.id, notif.requestId, "declined")}
              disabled={responding === notif.id}
              style={{ color: "var(--mute)" }}
            >
              Decline
            </button>
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "var(--ash)", flexShrink: 0 }}>Done</span>
        )}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <>
        <ToastProvider />
        <div className="page-header">
          <h1 className="page-title">Notifications</h1>
        </div>
        <div className="empty-state">
          <div className="empty-state-title">All caught up</div>
          <p>No notifications yet.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <ToastProvider />
      <div className="page-header">
        <h1 className="page-title">
          Notifications
          {unread.length > 0 && (
            <span style={{ fontSize: 13, fontWeight: 400, color: "var(--mute)", marginLeft: 10 }}>
              {unread.length} new
            </span>
          )}
        </h1>
      </div>

      {unread.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="settings-section-title">New</div>
          {unread.map(n => <NotifRow key={n.id} notif={n} />)}
        </div>
      )}

      {read.length > 0 && (
        <div>
          <div className="settings-section-title">Earlier</div>
          {read.map(n => <NotifRow key={n.id} notif={n} />)}
        </div>
      )}
    </>
  );
}
