import { useState, useEffect } from "react";
import { signInWithGoogle } from "../../lib/auth";

const FEATURES = [
  { tag: "[1]", title: "Kanban & Grid Views", desc: "Applied se hired tak, pura pipeline ek nazar mein — board, columns ya list." },
  { tag: "[2]", title: "Real-time Chat", desc: "Roles discuss karo, links share karo, peers ke saath instantly collaborate." },
  { tag: "[3]", title: "Brute Force + Reminders", desc: "Company leads track karo, follow-up kabhi miss mat karo." },
];

export default function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
    <div className="landing-root">
      <style>{`
        .landing-root {
          min-height: 100vh; min-height: 100dvh;
          background: var(--canvas); color: var(--ink);
          font-family: 'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace;
          display: flex; flex-direction: column;
        }
        .landing-nav {
          height: 56px; border-bottom: 1px solid var(--hairline);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 clamp(16px, 5vw, 32px); background: var(--canvas);
          position: sticky; top: 0; z-index: 10;
        }
        .landing-brand { display: flex; align-items: center; gap: 10px; }
        .landing-brand img { width: 26px; height: 26px; border-radius: 7px; }
        .landing-brand span { font-size: 14px; font-weight: 800; letter-spacing: 0.1em; }
        .landing-nav-meta { font-size: 12px; color: var(--mute); }
        .landing-hero {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center;
          padding: clamp(48px, 9vw, 88px) clamp(18px, 5vw, 24px);
          background:
            radial-gradient(90% 120% at 50% -10%, rgba(124,99,246,0.28), transparent 60%),
            radial-gradient(70% 90% at 85% 15%, rgba(14,165,233,0.20), transparent 55%),
            var(--ink);
          color: var(--canvas); border-bottom: 1px solid var(--hairline);
        }
        .landing-pill {
          display: inline-block; padding: 6px 16px;
          border: 1px solid rgba(255,255,255,0.25); border-radius: 999px;
          font-size: clamp(10px, 3vw, 12px); color: #e6e2ff;
          margin-bottom: clamp(22px, 5vw, 34px); backdrop-filter: blur(4px);
        }
        .landing-logo-badge {
          width: clamp(72px, 20vw, 104px); height: clamp(72px, 20vw, 104px);
          border-radius: 24px; object-fit: contain; margin-bottom: 22px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.4);
          animation: landingFloat 3.4s ease-in-out infinite;
        }
        .landing-title {
          margin: 0 0 12px; font-weight: 800; letter-spacing: -0.02em;
          font-size: clamp(34px, 10vw, 68px); line-height: 1.02;
          background: linear-gradient(180deg, #ffffff, #c9c4ff);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .landing-sub {
          margin: 0 auto clamp(30px, 6vw, 42px); max-width: 520px;
          font-size: clamp(13px, 3.5vw, 15px); line-height: 1.6; color: #d8d4e8;
        }
        .landing-card {
          background: var(--canvas); color: var(--ink);
          border: 1px solid var(--hairline); border-radius: 16px;
          padding: clamp(22px, 6vw, 32px); width: 100%; max-width: 420px;
          box-shadow: 0 24px 70px rgba(0,0,0,0.28);
        }
        .landing-card h2 { margin: 0 0 8px; font-size: 16px; font-weight: 800; }
        .landing-card p { margin: 0 0 22px; font-size: 13px; color: var(--mute); }
        .landing-google {
          width: 100%; padding: 14px; border-radius: 10px; border: none;
          background: var(--ink); color: var(--canvas);
          font-family: inherit; font-size: 14px; font-weight: 800;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          cursor: pointer; transition: transform 0.1s, opacity 0.1s;
        }
        .landing-google:active { transform: scale(0.98); }
        .landing-google:disabled { opacity: 0.75; cursor: not-allowed; }
        .landing-features {
          padding: clamp(48px, 9vw, 80px) clamp(18px, 5vw, 40px);
          display: grid; gap: clamp(16px, 4vw, 28px);
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          max-width: 1120px; margin: 0 auto; width: 100%; background: var(--canvas);
        }
        .landing-feature {
          border: 1px solid var(--hairline); border-radius: 14px;
          padding: clamp(20px, 5vw, 30px); background: var(--surface-soft);
          transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
        }
        .landing-feature:hover { transform: translateY(-4px); border-color: #7c63f6; box-shadow: 0 14px 34px rgba(124,99,246,0.14); }
        .landing-feature .ft { font-size: 12px; font-weight: 800; color: #7c63f6; }
        .landing-feature h3 { font-size: 15px; font-weight: 800; margin: 8px 0 10px; }
        .landing-feature p { font-size: 13px; color: var(--mute); line-height: 1.6; margin: 0; }
        .landing-footer {
          padding: 22px; text-align: center; border-top: 1px solid var(--hairline);
          font-size: 12px; color: var(--mute);
        }
        .reveal { opacity: 0; }
        .reveal.on { animation: fade-in-up 0.7s ease-out forwards; }
        @keyframes landingFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @media (max-width: 520px) { .landing-nav-meta { display: none; } }
      `}</style>

      <header className="landing-nav">
        <span className="landing-brand">
          <img src="/logo/android-chrome-192x192.png" alt="JobSeen" />
          <span>JOBSEEN</span>
        </span>
        <span className="landing-nav-meta">job listing tracker [v1.0.0]</span>
      </header>

      <main className="landing-hero">
        <span className={`landing-pill reveal ${mounted ? "on" : ""}`}>$ ./jobseen --track --collaborate</span>
        <img
          className={`landing-logo-badge reveal ${mounted ? "on" : ""}`}
          src="/logo/android-chrome-512x512.png"
          alt="JobSeen logo"
        />
        <h1 className={`landing-title reveal ${mounted ? "on" : ""}`} style={{ animationDelay: "0.05s" }}>JobSeen</h1>
        <p className={`landing-sub reveal ${mounted ? "on" : ""}`} style={{ animationDelay: "0.1s" }}>
          Track, organize, aur share job listings — apni puri job hunt ek jagah, apne connections ke saath.
        </p>

        <div className={`landing-card reveal ${mounted ? "on" : ""}`} style={{ animationDelay: "0.2s" }}>
          <h2>[auth] sign in</h2>
          <p>Securely access your job application pipeline.</p>
          {error && (
            <div style={{ color: "#c0392b", fontSize: 12, marginBottom: 16, background: "#fff5f5", padding: "8px 12px", border: "1px solid #f5c6c6", borderRadius: 8 }}>
              {error}
            </div>
          )}
          <button className="landing-google" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? <span className="spinner" /> : <span>[+] continue with google</span>}
          </button>
        </div>
      </main>

      <section className="landing-features">
        {FEATURES.map((f, i) => (
          <div key={i} className={`landing-feature reveal ${mounted ? "on" : ""}`} style={{ animationDelay: `${0.35 + i * 0.1}s` }}>
            <span className="ft">{f.tag}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="landing-footer">[EOF] © {new Date().getFullYear()} JobSeen · Arigato Labs</footer>
    </div>
  );
}
