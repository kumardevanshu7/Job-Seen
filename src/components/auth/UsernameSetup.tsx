import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth, setAuthState } from "../../stores/authStore";
import { isUsernameTaken, upsertUserProfile, getUserProfile } from "../../lib/auth";

export default function UsernameSetup() {
  const auth = useStore($auth);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(auth.user?.displayName ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      setError("username must be 3–20 chars: letters, numbers, underscores only.");
      return;
    }
    if (!displayName.trim()) {
      setError("display name is required.");
      return;
    }
    setLoading(true);
    try {
      const taken = await isUsernameTaken(trimmed);
      if (taken) { setError("that username is already taken."); setLoading(false); return; }
      await upsertUserProfile(auth.user!.uid, {
        displayName: displayName.trim(),
        username: trimmed,
        email: auth.user!.email!,
        photoURL: auth.user!.photoURL ?? undefined,
      });
      const profile = await getUserProfile(auth.user!.uid);
      setAuthState({ profile: profile as any });
      window.location.reload();
    } catch (e: any) {
      setError(e.message ?? "something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--canvas, #fdfcfc)",
      color: "var(--ink, #201d1d)",
      fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Top hairline nav */}
      <div style={{
        height: 56,
        borderBottom: "1px solid var(--hairline, #e2dede)",
        display: "flex",
        alignItems: "center",
        padding: "0 32px",
        justifyContent: "space-between",
        background: "var(--canvas, #fdfcfc)",
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em" }}>JOBSEEN</span>
        <span style={{ fontSize: 13, color: "var(--mute, #686262)" }}>[onboarding setup]</span>
      </div>

      <div style={{ maxWidth: 480, margin: "64px auto", padding: "0 24px", width: "100%" }}>
        {/* Terminal Boot Sequence Messages */}
        <div style={{
          background: "var(--ink, #201d1d)",
          color: "var(--canvas, #fdfcfc)",
          padding: "16px 20px",
          borderRadius: 4,
          fontSize: 12,
          lineHeight: 1.8,
          marginBottom: 32,
          border: "1px solid var(--ink, #201d1d)"
        }}>
          <div><span style={{ color: "#82e0aa" }}>[OK]</span> Google OAuth identity verified.</div>
          <div><span style={{ color: "#82e0aa" }}>[OK]</span> Job portal infrastructure is ready.</div>
          <div><span style={{ color: "#82e0aa" }}>[OK]</span> Connecting to collaborative developer network...</div>
          <div><span style={{ color: "#f7dc6f" }}>[!]</span> Initializing developer handle required.</div>
        </div>

        <div style={{ borderBottom: "1px solid var(--hairline, #e2dede)", paddingBottom: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, margin: 0, textTransform: "lowercase" }}>
            [init] set up your developer profile
          </h1>
        </div>

        <p style={{ fontSize: 13, color: "var(--body, #423e3e)", lineHeight: 1.6, marginBottom: 28 }}>
          Choose a unique handle for sharing listings and collaborating with connections. This handle is permanent.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--ink, #201d1d)" }}>
              display name
            </label>
            <input
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--hairline, #e2dede)",
                background: "#ffffff",
                color: "var(--ink, #201d1d)",
                fontFamily: "inherit",
                fontSize: 13,
                borderRadius: 3,
              }}
              placeholder="Devanshu Kumar"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--ink, #201d1d)" }}>
              username handle
            </label>
            <input
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--hairline, #e2dede)",
                background: "#ffffff",
                color: "var(--ink, #201d1d)",
                fontFamily: "inherit",
                fontSize: 13,
                borderRadius: 3,
              }}
              placeholder="devanshu31"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
            <span style={{ display: "block", marginTop: 6, fontSize: 11, color: "var(--ash, #8a8484)" }}>
              3–20 chars. lowercase letters, numbers, underscores.
            </span>
          </div>

          {error && (
            <div style={{
              background: "#fff0f0",
              border: "1px solid #e0b4b4",
              color: "#9f3a38",
              padding: "10px 14px",
              fontSize: 13,
              borderRadius: 4,
            }}>
              [-] {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: "var(--ink, #201d1d)",
              color: "var(--canvas, #fdfcfc)",
              border: "1px solid var(--ink, #201d1d)",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              borderRadius: 3,
              marginTop: 8
            }}
          >
            {loading ? "[*] saving profile..." : "[+] save handle & launch portal"}
          </button>
        </form>
      </div>
    </div>
  );
}

