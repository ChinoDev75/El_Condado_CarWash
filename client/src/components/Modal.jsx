import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "./Icons";

export default function Modal({ open, onClose, title, children }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.75rem 2rem 1.25rem",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <h3
            id={titleId}
            style={{
              color: "#D4AF37",
              margin: 0,
              fontSize: "1.25rem",
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 700,
              letterSpacing: "0.02em"
            }}
          >
            {title}
          </h3>
          <button
            type="button"
            aria-label="Cerrar modal"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
              color: "#a0aec0",
              cursor: "pointer",
              padding: "8px",
              borderRadius: "12px",
              display: "flex",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
            onMouseLeave={(e) => e.currentTarget.style.color = "#a0aec0"}
          >
            <IconClose />
          </button>
        </div>
        <div className="modal-body" style={{ padding: "2rem" }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
