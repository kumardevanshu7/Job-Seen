import { useEffect, useState } from "react";
import { getDeletionQuestion, type DeletionQuestion } from "../../lib/deletionProtection";

interface Props {
  uid: string;
  title?: string;
  targetLabel?: string;
  description?: string;
  confirmLabel?: string;
  confirmTone?: "danger" | "primary";
  busy?: boolean;
  error?: string;
  onConfirm: (answer: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function DeletionChallengeModal({
  uid,
  title = "One Password required",
  targetLabel = "This item",
  description,
  confirmLabel = "Verify & continue",
  confirmTone = "danger",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const [question, setQuestion] = useState<DeletionQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getDeletionQuestion(uid)
      .then(value => { if (active) setQuestion(value); })
      .catch(() => { if (active) setLoadError("One Password load nahi ho paya."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (question && answer.trim() && !busy) void onConfirm(answer);
  }

  const inlineError = error || loadError;

  return (
    <>
      <div
        onClick={() => { if (!busy) onCancel(); }}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)", zIndex: 9000 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deletion-challenge-title"
        style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          zIndex: 9001, width: "min(430px, calc(100vw - 28px))", padding: 24,
          background: "var(--canvas, #fdfcfc)", border: "1.5px solid var(--hairline, #e2dede)",
          borderRadius: 10, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "inherit",
        }}
      >
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: confirmTone === "danger" ? "#fee2e2" : "#eff6ff", color: confirmTone === "danger" ? "#dc2626" : "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, marginBottom: 14 }}>?</div>
        <h2 id="deletion-challenge-title" style={{ margin: "0 0 7px", fontSize: 17, color: "var(--ink)" }}>{title}</h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: 1.55, color: "var(--mute)" }}>
          {description || `${targetLabel} ke liye Settings → One Password ka answer enter karo.`}
        </p>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, color: "var(--mute)", fontSize: 13, padding: "10px 0 18px" }}>
            <div className="spinner" style={{ width: 14, height: 14 }} /> Loading One Password…
          </div>
        ) : !question ? (
          <div style={{ padding: 14, borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "#9a3412", lineHeight: 1.5 }}>One Password abhi setup nahi hai — Settings mein 1 question + 1 answer set karo.</div>
            <a href="/settings" style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700, color: "#9a3412" }}>Open Settings → One Password</a>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label className="form-label" htmlFor="deletion-answer">{question.question}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="deletion-answer"
                autoFocus
                className="form-input"
                type={showAnswer ? "text" : "password"}
                autoComplete="off"
                value={answer}
                disabled={busy}
                onChange={event => setAnswer(event.target.value)}
                placeholder="Your One Password answer"
                style={{ flex: 1, fontFamily: "inherit" }}
              />
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setShowAnswer(value => !value)}>
                {showAnswer ? "Hide" : "Show"}
              </button>
            </div>
            {inlineError && <div role="alert" style={{ color: "#b91c1c", fontSize: 12, lineHeight: 1.45, marginTop: 9 }}>{inlineError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
              <button type="submit" className={confirmTone === "danger" ? "btn btn-danger" : "btn btn-primary"} disabled={busy || !answer.trim()}>
                {busy ? <><div className="spinner" style={{ width: 11, height: 11 }} /> Verifying…</> : confirmLabel}
              </button>
            </div>
          </form>
        )}

        {!loading && !question && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        )}
        {!question && inlineError && <div role="alert" style={{ color: "#b91c1c", fontSize: 12, marginTop: 10 }}>{inlineError}</div>}
      </div>
    </>
  );
}
