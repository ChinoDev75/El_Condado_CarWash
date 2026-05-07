import { IconWA } from "../Icons";
import { goldBtn, waBtn } from "../../styles/buttonStyles";
import { WHATSAPP_URL } from "../../constants/whatsapp";

export default function Hero({ scrollTo }) {
  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        paddingTop: "64px",
      }}
    >
      {/* Background Elements */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          background: "radial-gradient(circle at 50% 0%, rgba(212,175,55,0.08), transparent 60%), radial-gradient(circle at 0% 100%, rgba(212,175,55,0.03), transparent 40%), radial-gradient(circle at 100% 100%, rgba(212,175,55,0.03), transparent 40%)",
        }}
      />
      
      {/* Animated geometric shapes */}
      <div
        className="float"
        style={{
          position: "absolute",
          top: "15%",
          left: "10%",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, rgba(212,175,55,0.03), transparent)",
          border: "1px solid rgba(212,175,55,0.05)",
          zIndex: 0,
          filter: "blur(30px)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          padding: "4rem 1.5rem",
          maxWidth: "1000px",
        }}
      >
        <p
          className="fade-up"
          style={{
            color: "#D4AF37",
            fontSize: "0.85rem",
            letterSpacing: "0.4em",
            textTransform: "uppercase",
            marginBottom: "2.5rem",
            fontWeight: 800,
            opacity: 0.9,
          }}
        >
          ✦ Premium Auto Detailing ✦
        </p>
        <h1
          className="fade-up"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(4rem, 12vw, 8.5rem)",
            fontWeight: 700,
            lineHeight: 0.9,
            marginBottom: "1.5rem",
            color: "#fff",
            letterSpacing: "-0.03em",
          }}
        >
          El Condado<br />
          <span className="gold-text" style={{ filter: "drop-shadow(0 0 30px rgba(212,175,55,0.2))" }}>CarWash</span>
        </h1>
        <p
          className="fade-up"
          style={{
            color: "#a0aec0",
            fontSize: "clamp(1.1rem, 2vw, 1.35rem)",
            maxWidth: "600px",
            margin: "0 auto 3.5rem",
            lineHeight: 1.8,
            fontWeight: 400,
          }}
        >
          Transformamos el cuidado automotriz en el Condado con atención al detalle y productos de calidad para que tu carro luzca limpio e impecable.
        </p>

        <div
          className="fade-up"
          style={{
            display: "flex",
            gap: "20px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => scrollTo("servicios")}
            style={{ 
              ...goldBtn, 
              padding: "18px 46px", 
              fontSize: "1.05rem",
            }}
          >
            Explorar Servicios
          </button>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            style={{ 
              ...waBtn, 
              padding: "18px 40px", 
              fontSize: "1.05rem", 
              textDecoration: "none",
            }}
          >
            <IconWA /> Consultar Ahora
          </a>
        </div>

        <div 
          className="fade-up"
          style={{ 
            display: "flex", 
            gap: "4rem", 
            justifyContent: "center", 
            marginTop: "6rem", 
            flexWrap: "wrap",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            paddingTop: "3.5rem"
          }}
        >
          {[
            ["01", "Calidad Premium", "Estándares de exhibición"],
            ["02", "Cuidado Experto", "Atención al detalle"],
            ["03", "Exclusividad", "Servicio personalizado"],
          ].map(([num, label, sub]) => (
            <div key={label} style={{ textAlign: "left" }}>
              <div style={{ color: "#D4AF37", fontSize: "0.85rem", fontWeight: 900, marginBottom: "8px", opacity: 0.7, letterSpacing: "0.1em" }}>{num}</div>
              <div style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 700, marginBottom: "4px", fontFamily: "'Cormorant Garamond', serif" }}>{label}</div>
              <div style={{ color: "#718096", fontSize: "0.85rem" }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
