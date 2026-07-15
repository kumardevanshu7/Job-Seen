import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { $notifications } from "../../stores/notificationStore";
import { $unreadChatCount } from "../../stores/chatStore";
import { signOut, isAdmin } from "../../lib/auth";

// Icon glyphs (monospace ASCII, not SVG)
const icons: Record<string, string> = {
  home:     "⌂",
  add:      "+",
  users:    "⊕",
  notif:    "○",
  settings: "◎",
  lock:     "⊘",
  admin:    "◈",
  search:   "⊛",
  out:      "←",
};

const primaryNav = [
  { href: "/",                     label: "Inbox",         icon: "⊙" },
  { href: "/add-job",              label: "Add Job",       icon: "+" },
  { href: "/walk-in",              label: "Walk-in Route", icon: "⌁" },
];

const secondaryNav = [
  { href: "/users",                label: "Users",         icon: "⊕" },
  { href: "/chat",                 label: "Messages",      icon: "◫", hasChatCount: true },
  { href: "/notifications",        label: "Notifications", icon: "○", hasCount: true },
  { href: "/settings",             label: "Settings",      icon: "◎" },
  { href: "/settings/permissions", label: "Permissions",   icon: "⊘" },
  { href: "/explore",              label: "Explore Arigato Labs", icon: "image" },
];

export default function Sidebar() {
  const auth = useStore($auth);
  const notifications = useStore($notifications);
  const unreadChat = useStore($unreadChatCount);
  const unread = notifications.filter(n => n.status === "unread").length;
  const [path, setPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : ""
  );
  const admin = auth.user ? isAdmin(auth.user.uid) : false;

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    document.addEventListener("astro:page-load", sync);
    document.addEventListener("astro:after-swap", sync);
    window.addEventListener("popstate", sync);
    sync();
    return () => {
      document.removeEventListener("astro:page-load", sync);
      document.removeEventListener("astro:after-swap", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  function NavItem({ href, label, icon, count }: { href: string; label: string; icon: string; count?: number }) {
    const active = path === href || (href.length > 1 && !href.includes("permissions") && path.startsWith(href) && href !== "/settings");
    const isPermissions = href === "/settings/permissions" && path === "/settings/permissions";
    const isActive = active || isPermissions;

    return (
      <a
        href={href}
        className={`nav-item ${isActive ? "active" : ""}`}
        onClick={() => setPath(href)}
      >
        {icon === "image" ? (
          <span className="nav-item-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/arigato-single-logo.png" alt="icon" style={{ width: 17, height: 17, objectFit: "contain" }} />
          </span>
        ) : (
          <span className="nav-item-icon">{icon}</span>
        )}
        <span>{label}</span>
        {count != null && count > 0 && (
          <span className="nav-item-count">{count}</span>
        )}
      </a>
    );
  }

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-user">
          <span className="sidebar-user-name">
            {auth.profile?.displayName ?? "…"}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 16, color: "var(--mute)", cursor: "pointer" }} title="Search">⊛</span>
          </span>
        </div>

        <div style={{ padding: "0 8px 8px" }}>
          <a href="/add-job" className="sidebar-action">
            <span className="sidebar-action-icon" style={{ fontSize: 18 }}>+</span>
            Add task
          </a>
        </div>

        <div style={{ padding: "0 8px" }}>
          {primaryNav.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </div>

        <div className="nav-divider" />

        <div className="sidebar-section">Navigation</div>
        <div style={{ padding: "0 8px" }}>
          {secondaryNav.map(item => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              count={item.hasChatCount ? unreadChat : (item.hasCount ? unread : undefined)}
            />
          ))}
        </div>

        {admin && (
          <>
            <div className="nav-divider" />
            <div className="sidebar-section">Admin</div>
            <div style={{ padding: "0 8px" }}>
              <NavItem href="/admin" label="Admin Panel" icon="◈" />
            </div>
          </>
        )}

        <div className="sidebar-footer">
          <div style={{ padding: "0 8px" }}>
            {auth.profile && (
              <div style={{ padding: "6px 16px", marginBottom: 2 }}>
                <div style={{ fontSize: 11, color: "var(--mute)" }}>
                  @{auth.profile.username}
                </div>
              </div>
            )}
            <button className="nav-item" onClick={handleSignOut} style={{ color: "var(--mute)" }}>
              <span className="nav-item-icon">←</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Header ── */}
      <header className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink)" }}>
            JOBSEEN
          </span>
          {auth.profile && (
            <span style={{ fontSize: 11, color: "var(--mute)" }}>
              @{auth.profile.username}
            </span>
          )}
        </div>
        <button
          onClick={handleSignOut}
          style={{
            fontSize: 11,
            color: "var(--ink)",
            background: "none",
            border: "1px solid var(--hairline)",
            padding: "5px 10px",
            borderRadius: 3,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← sign out
        </button>
      </header>

      {/* ── Mobile Fixed Bottom Navigation Bar ── */}
      <nav className="mobile-bottom-nav">
        <a href="/" className={`mobile-nav-item ${path === "/" ? "active" : ""}`} onClick={() => setPath("/")}>
          <span className="mobile-nav-item-icon">⊙</span>
          <span>Inbox</span>
        </a>
        <a href="/add-job" className={`mobile-nav-item ${path === "/add-job" ? "active" : ""}`} onClick={() => setPath("/add-job")}>
          <span className="mobile-nav-item-icon">+</span>
          <span>Add Job</span>
        </a>
        <a href="/walk-in" className={`mobile-nav-item ${path === "/walk-in" || path.startsWith("/walk-in/") ? "active" : ""}`} onClick={() => setPath("/walk-in")}>
          <span className="mobile-nav-item-icon">⌁</span>
          <span>Route</span>
        </a>
        <a href="/chat" className={`mobile-nav-item ${path === "/chat" ? "active" : ""}`} onClick={() => setPath("/chat")}>
          <span className="mobile-nav-item-icon">◫</span>
          <span>Messages</span>
          {unreadChat > 0 && <span className="mobile-nav-badge">{unreadChat}</span>}
        </a>
        <a href="/users" className={`mobile-nav-item ${path === "/users" ? "active" : ""}`} onClick={() => setPath("/users")}>
          <span className="mobile-nav-item-icon">⊕</span>
          <span>Users</span>
        </a>
        <a href="/notifications" className={`mobile-nav-item ${path === "/notifications" ? "active" : ""}`} onClick={() => setPath("/notifications")}>
          <span className="mobile-nav-item-icon">○</span>
          <span>Notifs</span>
          {unread > 0 && <span className="mobile-nav-badge">{unread}</span>}
        </a>
        <a href="/explore" className={`mobile-nav-item ${path === "/explore" ? "active" : ""}`} onClick={() => setPath("/explore")}>
          <span className="mobile-nav-item-icon" style={{ display: "inline-flex", alignItems: "center" }}>
            <img src="/arigato-single-logo.png" alt="Explore" style={{ width: 14, height: 14, objectFit: "contain" }} />
          </span>
          <span>Explore</span>
        </a>
        <a href="/settings" className={`mobile-nav-item ${path.startsWith("/settings") ? "active" : ""}`} onClick={() => setPath("/settings")}>
          <span className="mobile-nav-item-icon">◎</span>
          <span>Settings</span>
        </a>
      </nav>
    </>
  );
}
