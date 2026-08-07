import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth } from "../../stores/authStore";
import { $notifications } from "../../stores/notificationStore";
import { $unreadChatCount } from "../../stores/chatStore";
import { signOut } from "../../lib/auth";
import { WALK_IN_ENABLED } from "../../lib/features";

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
  ...(WALK_IN_ENABLED ? [{ href: "/walk-in", label: "Walk-in Route", icon: "⌁" }] : []),
  { href: "/brute-force",          label: "Brute Force Jobs", icon: "☎" },
];

const secondaryNav = [
  { href: "/analytics",            label: "Analytics",     icon: "▤" },
  { href: "/users",                label: "Users",         icon: "⊕" },
  { href: "/chat",                 label: "Messages",      icon: "◫", hasChatCount: true },
  { href: "/notifications",        label: "Notifications", icon: "○", hasCount: true },
  { href: "/settings",             label: "Settings",      icon: "◎" },
  { href: "/settings/permissions", label: "Permissions",   icon: "⊘" },
  { href: "/explore",              label: "Explore Arigato Labs", icon: "image" },
];

const legalNav = [
  { href: "/about",       label: "About",               icon: "※" },
  { href: "/privacy",     label: "Privacy Policy",      icon: "☰" },
  { href: "/terms",       label: "Terms & Conditions",  icon: "¶" },
  { href: "/disclaimer",  label: "Disclaimer",          icon: "!" },
  { href: "/contact",     label: "Contact",             icon: "@" },
];

export default function Sidebar() {
  const auth = useStore($auth);
  const notifications = useStore($notifications);
  const unreadChat = useStore($unreadChatCount);
  const unread = notifications.filter(n => n.status === "unread").length;
  const [path, setPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : ""
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const admin = auth.isAdmin;

  // Lock body scroll when the mobile drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

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

        <div className="nav-divider" />
        <div className="sidebar-section">Arigato Labs</div>
        <div style={{ padding: "0 8px" }}>
          {legalNav.map(item => (
            <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
            className={`hamburger ${menuOpen ? "open" : ""}`}
          >
            <span /><span /><span />
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ink)" }}>
            JOBSEEN
          </span>
        </div>
        {auth.profile && (
          <span style={{ fontSize: 11, color: "var(--mute)" }}>@{auth.profile.username}</span>
        )}
      </header>

      {/* ── Mobile Slide-in Drawer ── */}
      <div
        className={`mobile-drawer-backdrop ${menuOpen ? "show" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden={!menuOpen}
      />
      <nav className={`mobile-drawer ${menuOpen ? "open" : ""}`} aria-label="Mobile navigation">
        <div className="mobile-drawer-user">
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>{auth.profile?.displayName ?? "…"}</div>
          {auth.profile && <div style={{ fontSize: 12, color: "var(--mute)" }}>@{auth.profile.username}</div>}
        </div>

        <div className="mobile-drawer-section">Menu</div>
        {primaryNav.map(item => (
          <DrawerLink key={item.href} {...item} />
        ))}

        <div className="mobile-drawer-section">Navigation</div>
        {secondaryNav.map(item => (
          <DrawerLink
            key={item.href}
            {...item}
            count={item.hasChatCount ? unreadChat : (item.hasCount ? unread : undefined)}
          />
        ))}

        <div className="mobile-drawer-section">Arigato Labs</div>
        {legalNav.map(item => (
          <DrawerLink key={item.href} {...item} />
        ))}

        {admin && (
          <>
            <div className="mobile-drawer-section">Admin</div>
            <DrawerLink href="/admin" label="Admin Panel" icon="◈" />
          </>
        )}

        <button className="mobile-drawer-signout" onClick={handleSignOut}>← Sign Out</button>
      </nav>

      <style>{`
        .hamburger {
          width: 34px; height: 34px; border: 1px solid var(--hairline); border-radius: 8px;
          background: var(--canvas); cursor: pointer; padding: 0;
          display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
        }
        .hamburger span {
          display: block; width: 16px; height: 2px; border-radius: 2px; background: var(--ink);
          transition: transform 0.25s ease, opacity 0.2s ease;
        }
        .hamburger.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
        .hamburger.open span:nth-child(2) { opacity: 0; }
        .hamburger.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
        .mobile-drawer-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
          opacity: 0; pointer-events: none; transition: opacity 0.25s ease; z-index: 900;
        }
        .mobile-drawer-backdrop.show { opacity: 1; pointer-events: auto; }
        .mobile-drawer {
          position: fixed; top: 0; left: 0; bottom: 0; width: min(80vw, 300px);
          background: var(--canvas); border-right: 1px solid var(--hairline);
          transform: translateX(-100%); transition: transform 0.28s cubic-bezier(0.4,0,0.2,1);
          z-index: 901; overflow-y: auto; padding: 16px 12px 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.18); display: none;
        }
        .mobile-drawer.open { transform: translateX(0); }
        .mobile-drawer-user { padding: 8px 12px 14px; border-bottom: 1px solid var(--hairline); margin-bottom: 8px; }
        .mobile-drawer-section {
          font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--mute); padding: 12px 12px 6px;
        }
        .mobile-drawer a {
          display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 8px;
          text-decoration: none; color: var(--body); font-size: 14px; font-weight: 600;
        }
        .mobile-drawer a.active { background: var(--surface-soft); color: var(--ink); }
        .mobile-drawer a .di { width: 18px; text-align: center; }
        .mobile-drawer a .dcount {
          margin-left: auto; background: var(--ink); color: var(--canvas);
          font-size: 10px; font-weight: 700; border-radius: 999px; padding: 1px 7px;
        }
        .mobile-drawer-signout {
          margin: 16px 12px 0; padding: 11px 12px; width: calc(100% - 24px);
          text-align: left; background: none; border: 1px solid var(--hairline); border-radius: 8px;
          color: var(--mute); font-size: 14px; font-weight: 600; cursor: pointer; fontFamily: inherit;
        }
        @media (max-width: 768px) { .mobile-drawer { display: block; } }
      `}</style>
    </>
  );

  function DrawerLink({ href, label, icon, count }: { href: string; label: string; icon: string; count?: number }) {
    const active = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
    return (
      <a
        href={href}
        className={active ? "active" : ""}
        onClick={() => { setPath(href); setMenuOpen(false); }}
      >
        {icon === "image" ? (
          <span className="di"><img src="/arigato-single-logo.png" alt="" style={{ width: 16, height: 16, objectFit: "contain" }} /></span>
        ) : (
          <span className="di">{icon}</span>
        )}
        <span>{label}</span>
        {count != null && count > 0 && <span className="dcount">{count}</span>}
      </a>
    );
  }
}
