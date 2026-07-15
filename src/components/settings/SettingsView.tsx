import { useState } from "react";
import { useStore } from "@nanostores/react";
import { $auth, setAuthState } from "../../stores/authStore";
import { upsertUserProfile, getUserProfile, signOut } from "../../lib/auth";
import { setUserDeletePin, verifyUserDeletePin } from "../../lib/firestore";
import { ToastProvider, showToast } from "../ui/Toast";
import DeletePinModal from "../ui/DeletePinModal";

export default function SettingsView() {
  const auth = useStore($auth);
  const [displayName, setDisplayName] = useState(auth.profile?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [pinModal, setPinModal] = useState<"setup" | "change" | null>(null);
  const [changeStep, setChangeStep] = useState<"verify" | "setup">("verify");

  const hasDeletePin = !!auth.profile?.deletePinHash;

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

      {pinModal === "setup" && (
        <DeletePinModal
          mode="setup"
          title="Set delete secret code"
          onCancel={() => setPinModal(null)}
          onConfirm={async (pin) => {
            if (!auth.user) return;
            const hash = await setUserDeletePin(auth.user.uid, pin);
            setAuthState({
              profile: auth.profile ? { ...auth.profile, deletePinHash: hash } : auth.profile,
            });
            showToast("Delete secret code set.", "success");
            setPinModal(null);
          }}
        />
      )}

      {pinModal === "change" && changeStep === "verify" && (
        <DeletePinModal
          mode="verify"
          title="Enter current secret code"
          confirmLabel="Continue"
          onCancel={() => { setPinModal(null); setChangeStep("verify"); }}
          onConfirm={async (pin) => {
            if (!auth.user) return;
            const ok = await verifyUserDeletePin(auth.user.uid, pin, auth.profile?.deletePinHash);
            if (!ok) throw new Error("Galat code. Dobara try karo.");
            setChangeStep("setup");
          }}
        />
      )}

      {pinModal === "change" && changeStep === "setup" && (
        <DeletePinModal
          mode="setup"
          title="Set new secret code"
          confirmLabel="Save new code"
          onCancel={() => { setPinModal(null); setChangeStep("verify"); }}
          onConfirm={async (pin) => {
            if (!auth.user) return;
            const hash = await setUserDeletePin(auth.user.uid, pin);
            setAuthState({
              profile: auth.profile ? { ...auth.profile, deletePinHash: hash } : auth.profile,
            });
            showToast("Secret code updated.", "success");
            setPinModal(null);
            setChangeStep("verify");
          }}
        />
      )}

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
        <div className="settings-section-title">Delete Secret Code</div>
        <div style={{ padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
          <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginBottom: 12 }}>
            Job delete karne pe 4-digit secret code maanga jayega.
            {hasDeletePin ? " Code already set hai." : " Abhi set nahi hai — pehli delete pe bhi set ho sakta hai."}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (hasDeletePin) {
                setChangeStep("verify");
                setPinModal("change");
              } else {
                setPinModal("setup");
              }
            }}
          >
            {hasDeletePin ? "Change secret code →" : "Set 4-digit code →"}
          </button>
        </div>
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
        <div className="settings-section-title">Account</div>
        <div style={{ padding: "12px 0" }}>
          <button className="btn btn-danger" onClick={handleSignOut}>Sign out</button>
        </div>
      </div>
    </>
  );
}
