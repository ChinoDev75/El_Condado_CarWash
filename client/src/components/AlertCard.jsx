import { useEffect } from "react";
import { createPortal } from "react-dom";
import { goldBtn, ghostBtn } from "../styles/buttonStyles";

const stylesByType = {
  success: {
    accent: "#25D366",
    background: "rgba(37, 211, 102, 0.12)",
    border: "rgba(37, 211, 102, 0.28)",
    title: "Listo"
  },
  error: {
    accent: "#f87171",
    background: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.28)",
    title: "Algo salio mal"
  },
  warning: {
    accent: "#D4AF37",
    background: "rgba(212, 175, 55, 0.12)",
    border: "rgba(212, 175, 55, 0.28)",
    title: "Confirmar accion"
  },
  info: {
    accent: "#93c5fd",
    background: "rgba(147, 197, 253, 0.12)",
    border: "rgba(147, 197, 253, 0.28)",
    title: "Aviso"
  }
};

export default function AlertCard({
  open,
  type = "info",
  title,
  message,
  confirmLabel = "Aceptar",
  cancelLabel,
  onConfirm,
  onCancel,
  onClose,
}) {
  const tone = stylesByType[type] || stylesByType.info;
  const isConfirm = Boolean(cancelLabel);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        (onCancel || onClose)?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, onClose, open]);

  if (!open) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
      return;
    }

    onClose?.();
  };

  return createPortal(
    <div className="alert-card-overlay" role="presentation">
      <div className="alert-card" role="alertdialog" aria-modal="true">
        <div
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "14px",
            background: tone.background,
            border: `1px solid ${tone.border}`,
            color: tone.accent,
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            fontSize: "1.2rem",
            flexShrink: 0
          }}
        >
          {type === "success" ? "✓" : type === "error" ? "!" : "?"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ color: "#fff", margin: "0 0 6px", fontSize: "1rem", fontWeight: 900 }}>
            {title || tone.title}
          </h3>
          {message && (
            <p style={{ color: "#a0aec0", margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
              {message}
            </p>
          )}
          <div className="alert-card-actions">
            {isConfirm && (
              <button type="button" onClick={onCancel || onClose} style={{ ...ghostBtn, padding: "9px 14px" }}>
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                ...(isConfirm && type === "warning"
                  ? { ...goldBtn, background: "#f87171", color: "#fff", boxShadow: "none" }
                  : goldBtn),
                padding: "9px 14px"
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
