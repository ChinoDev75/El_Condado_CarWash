import { IconCar, IconWA } from "../Icons";
import { ghostBtn, goldBtn } from "../../styles/buttonStyles";
import { WHATSAPP_URL } from "../../constants/whatsapp";

export default function Footer({ onAuthOpen, onTermsOpen }) {
  return (
    <footer
      style={{
        background: "#030508",
        borderTop: "1px solid rgba(255, 255, 255, 0.05)",
        padding: "5rem 1.5rem 2rem",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
            gap: "3rem",
            marginBottom: "4rem",
          }}
        >
          <div style={{ maxWidth: "300px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "linear-gradient(135deg,#D4AF37,#F5D06B)",
                  borderRadius: "10px",
                  padding: "8px",
                  color: "#0a0d14",
                }}
              >
                <IconCar />
              </div>
              <span
                style={{
                  fontFamily: "'Cormorant Garamond',serif",
                  color: "#fff",
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  letterSpacing: "0.02em"
                }}
              >
                El Condado<br/>
                <span style={{ color: "#D4AF37", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.2em", display: "block", marginTop: "-4px" }}>CarWash</span>
              </span>
            </div>
            <p style={{ color: "#718096", fontSize: "0.95rem", lineHeight: 1.8 }}>
              Redefiniendo el cuidado automotriz en Guatemala con estándares de excelencia y precisión artesanal.
            </p>
          </div>

          <div>
            <h4
              style={{
                color: "#D4AF37",
                fontSize: "0.75rem",
                fontWeight: 800,
                marginBottom: "1.75rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Servicios
            </h4>
            {[
              "Lavado Exterior",
              "Lavado Completo",
              "Encerado Premium",
              "Lavado de Motor",
              "Detallado Completo",
            ].map((s) => (
              <p
                key={s}
                style={{
                  color: "#718096",
                  fontSize: "0.9rem",
                  marginBottom: "10px",
                  cursor: "pointer",
                  transition: "color 0.3s ease"
                }}
                onMouseEnter={(e) => e.target.style.color = "#D4AF37"}
                onMouseLeave={(e) => e.target.style.color = "#718096"}
              >
                {s}
              </p>
            ))}
          </div>

          <div>
            <h4
              style={{
                color: "#D4AF37",
                fontSize: "0.75rem",
                fontWeight: 800,
                marginBottom: "1.75rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Contacto
            </h4>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#25D366",
                textDecoration: "none",
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              <IconWA /> +502 3767-4506
            </a>
            <p style={{ color: "#718096", fontSize: "0.9rem", lineHeight: 1.6 }}>
              Lunes a Sábado
              <br />
              El Condado San Jacinto, Guatemala
            </p>
          </div>

          <div>
            <h4
              style={{
                color: "#D4AF37",
                fontSize: "0.75rem",
                fontWeight: 800,
                marginBottom: "1.75rem",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Mi Cuenta
            </h4>
            <button
              onClick={onAuthOpen}
              style={{ 
                ...ghostBtn, 
                width: "100%", 
                marginBottom: "12px", 
                fontSize: "0.85rem",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid rgba(212,175,55,0.2)"
              }}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={onAuthOpen}
              style={{ 
                ...goldBtn, 
                width: "100%", 
                fontSize: "0.85rem",
                padding: "12px",
                borderRadius: "12px",
                boxShadow: "0 4px 12px rgba(212,175,55,0.15)"
              }}
            >
              Registrarse
            </button>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            paddingTop: "2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1.5rem",
          }}
        >
          <p style={{ color: "#4a5568", fontSize: "0.85rem" }}>
            © 2026 El Condado CarWash · Todos los derechos reservados.
          </p>
          <button
            onClick={onTermsOpen}
            style={{
              background: "none",
              border: "none",
              color: "#718096",
              cursor: "pointer",
              fontSize: "0.85rem",
              textDecoration: "none",
              fontFamily: "inherit",
              transition: "color 0.3s ease"
            }}
            onMouseEnter={(e) => e.target.style.color = "#D4AF37"}
            onMouseLeave={(e) => e.target.style.color = "#718096"}
          >
            Términos y Condiciones
          </button>
        </div>
      </div>
    </footer>
  );
}
