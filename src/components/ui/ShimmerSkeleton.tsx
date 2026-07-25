interface Props {
  variant?: "jobs" | "route" | "list" | "auth";
  count?: number;
}

export default function ShimmerSkeleton({ variant = "jobs", count = 3 }: Props) {
  if (variant === "auth") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "100vh", gap: 16, padding: 24,
      }}>
        <img
          src="/logo/android-chrome-192x192.png"
          alt="JobSeen"
          width={56}
          height={56}
          style={{ objectFit: "contain", animation: "jobseenLogoPulse 1.3s ease-in-out infinite" }}
        />
        <div className="shimmer-bg shimmer-line" style={{ width: 160, height: 14 }} />
        <div className="shimmer-bg shimmer-line" style={{ width: 110, height: 10 }} />
        <style>{`@keyframes jobseenLogoPulse { 0%,100% { opacity: .55; transform: scale(.94); } 50% { opacity: 1; transform: scale(1); } }`}</style>
      </div>
    );
  }

  if (variant === "route") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
              <div className="shimmer-bg" style={{ width: 34, height: 28, borderRadius: 6 }} />
              <div className="shimmer-bg" style={{ width: 34, height: 28, borderRadius: 6 }} />
            </div>
            <div className="shimmer-card" style={{ flex: 1, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <div className="shimmer-bg" style={{ width: 24, height: 24, borderRadius: "50%" }} />
                  <div className="shimmer-bg shimmer-line" style={{ width: "42%", height: 14 }} />
                </div>
                <div className="shimmer-bg" style={{ width: 64, height: 20, borderRadius: 999 }} />
              </div>
              <div className="shimmer-bg shimmer-line" style={{ width: "55%", height: 12, marginTop: 4 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <div className="shimmer-bg shimmer-chip" style={{ width: 90 }} />
                <div className="shimmer-bg shimmer-chip" style={{ width: 70 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            display: "flex", gap: 12, alignItems: "center",
            padding: "12px 14px",
            border: "1.5px solid var(--hairline)",
            borderRadius: 8,
          }}>
            <div className="shimmer-bg" style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="shimmer-bg shimmer-line" style={{ width: "55%", height: 14, marginBottom: 8 }} />
              <div className="shimmer-bg shimmer-line" style={{ width: "35%", height: 10 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // jobs (default)
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="shimmer-bg" style={{ width: 72, height: 18, borderRadius: 3, marginBottom: 10 }} />
              <div className="shimmer-bg shimmer-line" style={{ width: "68%", height: 16, marginBottom: 6 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div className="shimmer-bg" style={{ width: 78, height: 22, borderRadius: 20 }} />
              <div className="shimmer-bg" style={{ width: 52, height: 18, borderRadius: 4 }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div className="shimmer-bg shimmer-chip" />
            <div className="shimmer-bg shimmer-chip" style={{ width: 88 }} />
            <div className="shimmer-bg shimmer-chip" style={{ width: 64 }} />
          </div>
          <div style={{
            borderTop: "1px solid var(--hairline)", paddingTop: 12,
            display: "flex", justifyContent: "space-between", gap: 10,
          }}>
            <div className="shimmer-bg shimmer-line" style={{ width: 100, height: 10 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <div className="shimmer-bg" style={{ width: 88, height: 28, borderRadius: 3 }} />
              <div className="shimmer-bg" style={{ width: 72, height: 28, borderRadius: 3 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
