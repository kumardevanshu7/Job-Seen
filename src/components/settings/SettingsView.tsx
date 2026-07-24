import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth, setAuthState } from "../../stores/authStore";
import { upsertUserProfile, getUserProfile, signOut } from "../../lib/auth";
import {
  changeDeletionProtection,
  configureDeletionProtection,
  deletionProtectionError,
  getDeletionQuestion,
  type DeletionQuestion,
} from "../../lib/deletionProtection";
import { ToastProvider, showToast } from "../ui/Toast";

export default function SettingsView() {
  const auth = useStore($auth);
  const [displayName, setDisplayName] = useState(auth.profile?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [protection, setProtection] = useState<DeletionQuestion | null>(null);
  const [protectionLoading, setProtectionLoading] = useState(true);
  const [savingProtection, setSavingProtection] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [nextQuestion, setNextQuestion] = useState("");
  const [nextAnswer, setNextAnswer] = useState("");

  useEffect(() => {
    if (!auth.user) return;
    let active = true;
    setProtectionLoading(true);
    getDeletionQuestion(auth.user.uid)
      .then(value => {
        if (!active) return;
        setProtection(value);
        if (value) setNextQuestion(value.question);
      })
      .catch(() => { if (active) showToast("Deletion protection load nahi ho payi.", "error"); })
      .finally(() => { if (active) setProtectionLoading(false); });
    return () => { active = false; };
  }, [auth.user]);

  async function setupProtection(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.user) return;
    setSavingProtection(true);
    try {
      await configureDeletionProtection(auth.user.uid, question, answer);
      const configured = await getDeletionQuestion(auth.user.uid);
      setProtection(configured);
      setNextQuestion(configured?.question ?? "");
      setQuestion("");
      setAnswer("");
      showToast("Deletion protection set ho gayi.", "success");
    } catch (error) {
      showToast(deletionProtectionError(error), "error");
    } finally {
      setSavingProtection(false);
    }
  }

  async function changeProtection(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.user) return;
    setSavingProtection(true);
    try {
      await changeDeletionProtection(auth.user.uid, currentAnswer, nextQuestion, nextAnswer);
      const updated = await getDeletionQuestion(auth.user.uid);
      setProtection(updated);
      setCurrentAnswer("");
      setNextAnswer("");
      showToast("Deletion question aur answer update ho gaye.", "success");
    } catch (error) {
      showToast(deletionProtectionError(error), "error");
    } finally {
      setSavingProtection(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.user || !auth.profile) return;
    if (!displayName.trim()) { showToast("Display name cannot be empty.", "error"); return; }
    setSaving(true);
    try {
      await upsertUserProfile(auth.user.uid, {
        displayName: displayName.trim(),
        username: auth.profile.username,
        email: auth.user.email!,
        photoURL: auth.user.photoURL ?? undefined,
      });
      const updated = await getUserProfile(auth.user.uid);
      setAuthState({ profile: { uid: auth.user.uid, ...updated } as any });
      showToast("Profile updated.", "success");
    } catch {
      showToast("Failed to update.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <>
      <ToastProvider />

      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your account and preferences.</p>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Profile</div>

        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 0", borderBottom: "1px solid var(--hairline)", marginBottom: 20,
        }}>
          {auth.user?.photoURL && (
            <img
              src={auth.user.photoURL}
              alt="avatar"
              className="user-avatar"
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as any).style.display = 'flex'; }}
              style={{ width: 36, height: 36, objectFit: "cover" }}
            />
          )}
          <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 14, display: auth.user?.photoURL ? 'none' : 'flex' }}>
            {(auth.profile?.displayName ?? "?").slice(0,2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
              {auth.profile?.displayName}
            </div>
            <div style={{ fontSize: 12, color: "var(--mute)" }}>
              @{auth.profile?.username} · {auth.user?.email}
            </div>
          </div>
        </div>

        <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="form-group">
            <label className="form-label">display name</label>
            <input
              className="form-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              style={{ fontFamily: "inherit" }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">username (cannot be changed)</label>
            <input
              className="form-input"
              value={auth.profile?.username ?? ""}
              readOnly
              style={{
                fontFamily: "inherit",
                color: "var(--ash)",
                cursor: "not-allowed",
                background: "var(--surface-soft)",
              }}
            />
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <><div className="spinner spinner-dark" style={{ width: 11, height: 11 }} /> Saving…</>
                : "Save changes"
              }
            </button>
          </div>
        </form>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Copy Permissions</div>
        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
          <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginBottom: 12 }}>
            Control which connections can duplicate your job listings.
          </p>
          <a href="/settings/permissions" className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
            Manage permissions →
          </a>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Deletion Protection</div>
        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
          <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginBottom: 14 }}>
            Koi bhi standard ya Brute Force job delete karne se pehle yeh question poocha jayega. Yeh login password nahi hai; destructive deletion ke liye extra safeguard hai.
          </p>

          {protectionLoading ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--mute)", fontSize: 13 }}>
              <div className="spinner" style={{ width: 12, height: 12 }} /> Loading…
            </div>
          ) : !protection ? (
            <form onSubmit={setupProtection} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
              <div className="form-group">
                <label className="form-label">your deletion question</label>
                <input
                  className="form-input"
                  value={question}
                  maxLength={160}
                  onChange={event => setQuestion(event.target.value)}
                  placeholder="e.g. What was the name of my first school?"
                />
              </div>
              <div className="form-group">
                <label className="form-label">answer</label>
                <input
                  className="form-input"
                  type="password"
                  autoComplete="new-password"
                  value={answer}
                  onChange={event => setAnswer(event.target.value)}
                  placeholder="Your private answer"
                />
                <div className="form-hint">Answer case-insensitive hai; extra spaces normalize ho jayengi. Isse bhoolne par trusted admin recovery chahiye.</div>
              </div>
              <div>
                <button type="submit" className="btn btn-primary" disabled={savingProtection || !question.trim() || !answer.trim()}>
                  {savingProtection ? "Saving…" : "Set deletion protection"}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ maxWidth: 560 }}>
              <div style={{ padding: 12, border: "1px solid #bbf7d0", borderRadius: 8, background: "#f0fdf4", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.05em" }}>Protection active</div>
                <div style={{ marginTop: 5, fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{protection.question}</div>
              </div>
              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Change question or answer</summary>
                <form onSubmit={changeProtection} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
                  <div className="form-group">
                    <label className="form-label">current answer</label>
                    <input className="form-input" type="password" autoComplete="current-password" value={currentAnswer} onChange={event => setCurrentAnswer(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">new question</label>
                    <input className="form-input" value={nextQuestion} maxLength={160} onChange={event => setNextQuestion(event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">new answer</label>
                    <input className="form-input" type="password" autoComplete="new-password" value={nextAnswer} onChange={event => setNextAnswer(event.target.value)} />
                  </div>
                  <div>
                    <button type="submit" className="btn btn-primary" disabled={savingProtection || !currentAnswer.trim() || !nextQuestion.trim() || !nextAnswer.trim()}>
                      {savingProtection ? "Verifying…" : "Verify current answer & change"}
                    </button>
                  </div>
                </form>
              </details>
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Account</div>
        <div style={{ padding: "12px 0" }}>
          <button className="btn btn-danger" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    </>
  );
}
