import { useEffect, useState } from "react";

interface Props {
  title?: string;
  hint?: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function ReasonModal({
  title = "Why cancelled?",
  hint = "Short mein likh do — kyu cancel kiya.",
  confirmLabel = "Save",
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

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
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--mute)", marginBottom: 14, lineHeight: 1.45 }}>
          {hint}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value.slice(0, 120))}
          placeholder="e.g. location far / CTC low / already filled…"
          rows={3}
          style={{
            width: "100%", boxSizing: "border-box",
            fontFamily: "inherit", fontSize: 13,
            padding: "10px 12px", borderRadius: 6,
            border: "1.5px solid var(--hairline)",
            background: "var(--surface-soft, #f7f5f5)",
            color: "var(--ink)", resize: "vertical",
            marginBottom: 8,
          }}
        />
        <div style={{ fontSize: 11, color: "var(--mute)", marginBottom: 16, textAlign: "right" }}>
          {reason.length}/120
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
