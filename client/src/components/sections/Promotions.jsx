import { useState } from "react";
import * as Icons from "../Icons";
import { IconCheck, IconWA, IconCalendar } from "../Icons";
import ScheduleModal from "../modals/ScheduleModal";
import { waBtn, goldBtn } from "../../styles/buttonStyles";
import { whatsappMsg } from "../../constants/whatsapp";
import { useServices } from "../../hooks/useServices";

export default function Promotions({ sectionTitle, onAuthOpen }) {
  const { services, loading, error } = useServices("promo");

  return (
    <section id="promociones">
      <div className="section">
        {sectionTitle(
          "Promociones",
          "¿Tienes dos vehículos? ¡Hay una oferta para ti!"
        )}
        
        {loading && <p style={{ textAlign: "center", color: "#a0aec0" }}>Cargando promociones...</p>}
        {error && <p style={{ textAlign: "center", color: "#f56565" }}>Error al cargar las promociones.</p>}
        
        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))",
              gap: "2rem",
            }}
          >
            {services.map((promo) => (
              <PromoCard key={promo._id} {...promo} serviceId={promo._id} onAuthOpen={onAuthOpen} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PromoCard({ title, price, oldPrice, features, waMsg, iconName, serviceId, onAuthOpen }) {
  const [schedOpen, setSchedOpen] = useState(false);
  const IconComponent = Icons[iconName] || Icons.IconCar;

  return (
    <div className="card-hover">
      <ScheduleModal
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        serviceName={title}
        serviceId={serviceId}
        servicePrice={price}
        onAuthOpen={onAuthOpen}
      />
      <div
        className="glass-panel"
        style={{
          borderRadius: "24px",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          height: "100%",
          boxSizing: "border-box",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          border: "1px solid rgba(212,175,55,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              background: "rgba(212,175,55,0.1)",
              borderRadius: "16px",
              padding: "14px",
              color: "#D4AF37",
              border: "1px solid rgba(212,175,55,0.2)",
            }}
          >
            <IconComponent />
          </div>
          <div>
            <h3
              style={{
                color: "#fff",
                margin: 0,
                fontFamily: "'Cormorant Garamond',serif",
                fontSize: "1.1rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {title}
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
                marginTop: "4px",
              }}
            >
              <span style={{ 
                background: "linear-gradient(135deg,#D4AF37,#F5D06B)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontWeight: 900, 
                fontSize: "1.75rem",
                fontFamily: "'Cormorant Garamond',serif"
              }}>
                {price}
              </span>
              {oldPrice && (
                <span
                  style={{
                    color: "#718096",
                    fontSize: "0.9rem",
                    textDecoration: "line-through",
                    fontWeight: 500
                  }}
                >
                  {oldPrice}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {features && features.map((f, i) => (
              <li
                key={i}
                style={{ 
                  display: "flex", 
                  gap: "10px", 
                  color: "#a0aec0", 
                  fontSize: "0.875rem",
                  lineHeight: "1.4"
                }}
              >
                <span style={{ color: "#D4AF37", marginTop: "2px" }}>
                  <IconCheck />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="service-card-actions" style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "1rem" }}>
          <a
            href={whatsappMsg(waMsg)}
            target="_blank"
            rel="noreferrer"
            style={{ ...waBtn, flex: 1, textDecoration: "none", height: "46px" }}
          >
            <IconWA /> WhatsApp
          </a>
          <button onClick={() => setSchedOpen(true)} style={{ ...goldBtn, flex: 1, height: "46px" }}>
            <IconCalendar /> Agendar
          </button>
        </div>
      </div>
    </div>
  );
}
