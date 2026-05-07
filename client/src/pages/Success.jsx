import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconCheck, IconCar } from "../components/Icons";
import { goldBtn } from "../styles/buttonStyles";
import { useAuth } from "../context/useAuth";
import { apiFetch } from "../lib/api";

export default function Success() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const bookingId = searchParams.get("booking");
  const [status, setStatus] = useState(bookingId ? "verifying" : "received");
  const [message, setMessage] = useState("Estamos confirmando tu pago con la pasarela.");

  useEffect(() => {
    let active = true;

    const verify = async () => {
      if (!bookingId) {
        setMessage("Tu pago fue recibido. Revisa tu panel para confirmar el estado de la reserva.");
        return;
      }

      if (!token) {
        setStatus("needs-session");
        setMessage("Inicia sesión para verificar el estado exacto de tu reserva.");
        return;
      }

      try {
        const data = await apiFetch(`/payments/verify/${bookingId}`, { token });
        if (!active) return;

        if (data.status === "paid") {
          setStatus("paid");
          setMessage("Tu reserva quedo confirmada y lista en tu panel.");
        } else if (data.status === "paid_expired") {
          setStatus("paid-expired");
          setMessage(data.message || "El pago fue recibido, pero la reserva necesita reprogramarse.");
        } else {
          setStatus("pending");
          setMessage(data.message || "Tu reserva aparecera en tu panel cuando el pago quede confirmado.");
        }
      } catch (err) {
        if (!active) return;
        setStatus("pending");
        setMessage(err.message || "No se pudo verificar el pago automaticamente.");
      }
    };

    verify();
    return () => {
      active = false;
    };
  }, [bookingId, token]);

  const title = useMemo(() => {
    if (status === "paid") return "Pago Confirmado";
    if (status === "verifying") return "Verificando Pago";
    if (status === "needs-session") return "Sesión Requerida";
    if (status === "paid-expired") return "Pago Recibido";
    if (status === "pending") return "Pago En Proceso";
    return "Pago Recibido";
  }, [status]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030508",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem"
    }}>
      <div className="glass-panel" style={{
        maxWidth: "500px",
        width: "100%",
        padding: "4rem 2rem",
        borderRadius: "32px",
        textAlign: "center",
        border: "1px solid rgba(212,175,55,0.3)",
        boxShadow: "0 0 40px rgba(212,175,55,0.1)"
      }}>
        <div style={{
          width: "80px",
          height: "80px",
          background: status === "paid" ? "rgba(37, 211, 102, 0.1)" : "rgba(212,175,55,0.1)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: status === "paid" ? "#25D366" : "#D4AF37",
          margin: "0 auto 2rem",
          border: status === "paid" ? "1px solid rgba(37, 211, 102, 0.2)" : "1px solid rgba(212,175,55,0.2)"
        }}>
          <IconCheck />
        </div>

        <h1 style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "2.5rem",
          color: "#fff",
          marginBottom: "1rem",
          fontWeight: 700
        }}>
          {title}
        </h1>

        <p style={{ color: "#a0aec0", fontSize: "1.1rem", lineHeight: 1.6, marginBottom: "2.5rem" }}>
          {message}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            style={{ ...goldBtn, width: "100%" }}
          >
            Ir a Mis Reservas
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              background: "transparent",
              border: "none",
              color: "#718096",
              fontSize: "0.9rem",
              cursor: "pointer",
              textDecoration: "underline"
            }}
          >
            Volver al Inicio
          </button>
        </div>

        <div style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
          <div style={{ color: "#D4AF37", opacity: 0.6 }}><IconCar /></div>
          <span style={{ fontSize: "0.75rem", color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.1em" }}>El Condado CarWash Premium</span>
        </div>
      </div>
    </div>
  );
}
