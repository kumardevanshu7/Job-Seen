import { useState, useEffect } from "react";
import { signInWithGoogle } from "../../lib/auth";

const JOBSEEN_ASCII = `      ___ _____ _____ _____ _____ _____ _____ 
     | . |     | __  |   __|  ___|  ___|   | |
     | | |  |  | __ -|__   |  ___|  ___| | | |
     |___|_____|_____|_____|_____|_____|_|___|`;

export default function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      await signInWithGoogle();
      window.location.href = "/";
    } catch (e: any) {
      setError(e.message ?? "Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--canvas)",
      color: "var(--ink)",
      fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Top hairline nav */}
      <div style={{
        height: 56,
        borderBottom: "1px solid var(--hairline)",
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        justifyContent: "space-between",
        background: "var(--canvas)",
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}>
          JOBSEEN
        </span>
        <span style={{ fontSize: 13, color: "var(--mute)" }}>
          job listing tracker [v1.0.0]
        </span>
      </div>

      {/* Hero Section - TUI Style */}
      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 24px",
        textAlign: "center",
        background: "var(--ink)",
        color: "var(--canvas)",
        borderBottom: "1px solid var(--hairline)",
      }}>
        
        <div style={{
          display: "inline-block",
          padding: "6px 16px",
          border: "1px solid rgba(255,255,255,0.2)",
          fontSize: 12,
          color: "#e2dede",
          marginBottom: 32,
          animation: mounted ? "fade-in-up 0.6s ease-out" : "none",
        }}>
          $ ./jobseen --track --collaborate
        </div>

        <pre style={{
          margin: "0 0 48px 0",
          fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
          fontSize: "clamp(9px, 1.4vw, 15px)",
          lineHeight: 1.15,
          fontWeight: 700,
          color: "var(--canvas)",
          textAlign: "center",
          whiteSpace: "pre",
          overflowX: "auto",
          maxWidth: "100%",
          animation: mounted ? "fade-in-up 0.8s ease-out 0.1s forwards" : "none",
          opacity: 0
        }}>
          {JOBSEEN_ASCII}
        </pre>

        {/* Login Box */}
        <div style={{
          background: "var(--canvas)",
          color: "var(--ink)",
          border: "1px solid var(--hairline)",
          padding: "32px",
          width: "100%",
          maxWidth: 400,
          animation: mounted ? "fade-in-up 0.8s ease-out 0.3s forwards" : "none",
          opacity: 0,
        }}>
          <h2 style={{ margin: "0 0 8px 0", fontSize: 16, fontWeight: 700 }}>[auth] sign in</h2>
          <p style={{ margin: "0 0 24px 0", fontSize: 13, color: "var(--mute)" }}>
            Securely access your job application pipeline.
          </p>
          
          {error && <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 16, background: "#fff5f5", padding: "8px 12px", border: "1px solid #f5c6c6" }}>{error}</div>}
          
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--ink)",
              color: "var(--canvas)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              transition: "transform 0.1s",
              opacity: loading ? 0.8 : 1
            }}
            onMouseDown={(e) => {
              if(!loading) e.currentTarget.style.transform = "scale(0.98)";
            }}
            onMouseUp={(e) => {
              if(!loading) e.currentTarget.style.transform = "scale(1)";
            }}
            onMouseLeave={(e) => {
              if(!loading) e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {loading ? (
              <span className="spinner"></span>
            ) : (
              <span>[+] continue with google</span>
            )}
          </button>
        </div>
      </main>

      {/* Features Grid - TUI Style */}
      <section style={{
        padding: "80px 40px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 32,
        maxWidth: 1200,
        margin: "0 auto",
        width: "100%",
        animation: mounted ? "fade-in-up 0.8s ease-out 0.5s forwards" : "none",
        opacity: 0,
        background: "var(--canvas)",
      }}>
        {[
          { title: "[1] Kanban & Grid Views", desc: "Visualize your pipeline perfectly. From applied to hired, see exactly where you stand." },
          { title: "[2] Real-time Chat", desc: "Discuss roles, share links, and collaborate with your peers instantly in the app." },
          { title: "[3] Smart Reminders", desc: "Never miss a follow-up. Keep track of aging applications and respond on time." }
        ].map((feature, i) => (
          <div key={i} style={{
            border: "1px dashed var(--mute)",
            padding: 32,
            background: "var(--surface-soft)",
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{feature.title}</h3>
            <p style={{ fontSize: 13, color: "var(--mute)", lineHeight: 1.6 }}>{feature.desc}</p>
          </div>
        ))}
      </section>
      
      {/* Footer */}
      <footer style={{
        padding: "24px",
        textAlign: "center",
        borderTop: "1px solid var(--hairline)",
        fontSize: 12,
        color: "var(--mute)",
      }}>
        [EOF] © {new Date().getFullYear()} JobSeen
      </footer>
    </div>
  );
}
