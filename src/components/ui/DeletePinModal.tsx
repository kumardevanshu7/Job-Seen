import { useEffect, useState } from "react";

interface Props {
  mode: "setup" | "verify";
  title?: string;
  confirmLabel?: string;
  onConfirm: (pin: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function DeletePinModal({
  mode,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function onlyDigits(v: string) {
    return v.replace(/\D/g, "").slice(0, 4);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 4) {
      setError("4 digit code chahiye.");
      return;
    }
    if (mode === "setup") {
      if (confirmPin !== pin) {
        setError("Dono codes match nahi kar rahe.");
        return;
      }
    }
    setLoading(true);
    try {
      await onConfirm(pin);
    } catch (err: any) {
      setError(err?.message ?? "Failed.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          zIndex: 9000,
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9001,
          background: "var(--canvas, #fdfcfc)",
          border: "1.5px solid var(--hairline, #e2dede)",
          borderRadius: 10,
          padding: "24px 24px 20px",
          width: "min(400px, 90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          fontFamily: "inherit",
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "#fee2e2",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14, color: "#dc2626", fontWeight: 800, fontSize: 18,
        }}>
          #
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
          {title ?? (mode === "setup" ? "Set delete secret code" : "Enter secret code")}
        </div>
        <div style={{ fontSize: 13, color: "var(--mute)", marginBottom: 16, lineHeight: 1.45 }}>
          {mode === "setup"
            ? "Pehli baar 4-digit secret code set karo. Delete karne pe yeh maanga jayega."
            : "Delete confirm karne ke liye apna 4-digit secret code daalo."}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">
              {mode === "setup" ? "new 4-digit code" : "secret code"}
            </label>
            <input
              className="form-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={4}
              value={pin}
              onChange={e => setPin(onlyDigits(e.target.value))}
              placeholder="••••"
              style={{
                fontFamily: "inherit",
                letterSpacing: "0.35em",
                fontSize: 18,
                textAlign: "center",
              }}
            />
          </div>

          {mode === "setup" && (
            <div className="form-group">
              <label className="form-label">confirm code</label>
              <input
                className="form-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={confirmPin}
                onChange={e => setConfirmPin(onlyDigits(e.target.value))}
                placeholder="••••"
                style={{
                  fontFamily: "inherit",
                  letterSpacing: "0.35em",
                  fontSize: 18,
                  textAlign: "center",
                }}
              />
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 12, color: "#b91c1c", background: "#fef2f2",
              border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || pin.length !== 4 || (mode === "setup" && confirmPin.length !== 4)}
              style={{ background: "#dc2626" }}
            >
              {loading
                ? "…"
                : (confirmLabel ?? (mode === "setup" ? "Set & Continue" : "Confirm"))}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
