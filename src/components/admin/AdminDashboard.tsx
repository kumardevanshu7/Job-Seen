export default function AdminDashboard() {
  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <h1 className="page-title">Admin Panel</h1>
          <span className="badge badge-dark">super admin</span>
        </div>
        <p className="page-subtitle">Platform-wide overview and management tools.</p>
      </div>

      {/* Stats */}
      <div className="stat-row" style={{ marginBottom: 40 }}>
        <div className="stat-cell">
          <div className="stat-value">—</div>
          <div className="stat-label">Total users</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value">—</div>
          <div className="stat-label">Total jobs</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value">—</div>
          <div className="stat-label">Connections</div>
        </div>
      </div>

      {/* Management */}
      <div className="settings-section-title">Management</div>

      <div>
        {[
          { icon: "⊕", label: "User management", desc: "Moderate and manage registered users.", future: true },
          { icon: "◎", label: "Analytics", desc: "Platform usage metrics and growth charts.", future: true },
          { icon: "◈", label: "Global settings", desc: "Platform-wide configuration flags.", future: true },
        ].map(item => (
          <div key={item.label} className="user-row" style={{ cursor: "default" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, color: "var(--mute)", width: 20, textAlign: "center" }}>{item.icon}</span>
              <div>
                <div className="user-info-name">{item.label}</div>
                <div className="user-info-handle">{item.desc}</div>
              </div>
            </div>
            {item.future && <span className="badge badge-muted">coming soon</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
