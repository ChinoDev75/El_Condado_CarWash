import { useState } from "react";
import ScheduleModal from "./modals/ScheduleModal";
import { IconWA, IconCalendar, IconCheck } from "./Icons";
import { waBtn, goldBtn } from "../styles/buttonStyles";
import { whatsappMsg } from "../constants/whatsapp";

export default function ServiceCard({ icon, title, price, features, tag, waMsg, serviceId, onAuthOpen }) {
  const [schedOpen, setSchedOpen] = useState(false);
  return (
    <>
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
          position: "relative",
          overflow: "hidden",
          height: "100%",
          boxSizing: "border-box",
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        {tag && (
          <span
            style={{
              position: "absolute",
              top: "1.25rem",
              right: "1.25rem",
              background: "linear-gradient(135deg, #fceabb 0%, #fccd4d 50%, #f8b500 100%)",
              color: "#0a0d14",
              fontSize: "0.65rem",
              fontWeight: 900,
              borderRadius: "50px",
              padding: "4px 12px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              boxShadow: "0 4px 12px rgba(212,175,55,0.3)",
            }}
          >
            {tag}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "rgba(212,175,55,0.1)",
              border: "1px solid rgba(212,175,55,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#D4AF37",
              flexShrink: 0,
              boxShadow: "inset 0 0 15px rgba(212,175,55,0.1)",
            }}
          >
            {icon}
          </div>
          <div>
            <h3
              style={{
                color: "#fff",
                margin: 0,
                fontSize: "1.25rem",
                fontFamily: "'Cormorant Garamond',serif",
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                background: "linear-gradient(135deg,#D4AF37,#F5D06B)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: "4px 0 0",
                fontWeight: 900,
                fontSize: "1.75rem",
                fontFamily: "'Cormorant Garamond',serif",
              }}
            >
              {price}
            </p>
          </div>
        </div>
        
        <div style={{ flex: 1 }}>
          {features && features.length > 0 && (
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
              {features.map((f, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "flex-start",
                    color: "#a0aec0",
                    fontSize: "0.875rem",
                    lineHeight: "1.4",
                  }}
                >
                  <span
                    style={{ color: "#D4AF37", marginTop: "2px", flexShrink: 0 }}
                  >
                    <IconCheck />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="service-card-actions"
          style={{
            display: "flex",
            gap: "12px",
            marginTop: "1rem",
            flexWrap: "wrap",
          }}
        >
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
    </>
  );
}
