import { useEffect } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
          zIndex: 9000,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9001,
          background: "var(--canvas, #fdfcfc)",
          border: "1.5px solid var(--hairline, #e2dede)",
          borderRadius: 10,
          padding: "28px 28px 24px",
          width: "min(420px, 90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          animation: "slideUp 0.18s ease",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: danger ? "#fee2e2" : "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 16,
        }}>
          {danger ? (
            // Trash / warning icon for danger
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          ) : (
            // Info / question icon for neutral
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        {/* Title */}
        <div style={{
          fontSize: 17, fontWeight: 700,
          color: "var(--ink, #201d1d)",
          marginBottom: 8,
        }}>
          {title}
        </div>

        {/* Message */}
        <div style={{
          fontSize: 14,
          color: "var(--mute, #686262)",
          lineHeight: 1.5,
          marginBottom: 24,
        }}>
          {message}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 20px",
              borderRadius: 6,
              border: "1.5px solid var(--hairline, #e2dede)",
              background: "transparent",
              color: "var(--body, #423e3e)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.1s",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "9px 20px",
              borderRadius: 6,
              border: "none",
              background: danger ? "#dc2626" : "var(--ink, #201d1d)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "opacity 0.1s",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, -46%) } to { opacity: 1; transform: translate(-50%, -50%) } }
      `}</style>
    </>
  );
}
