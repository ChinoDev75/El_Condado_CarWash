import { useState } from "react";
import * as Icons from "../Icons";
import { IconCheck, IconWA, IconCalendar } from "../Icons";
import ScheduleModal from "../modals/ScheduleModal";
import CustomMembershipModal from "../modals/CustomMembershipModal";
import { waBtn, goldBtn } from "../../styles/buttonStyles";
import { whatsappMsg } from "../../constants/whatsapp";
import { useServices } from "../../hooks/useServices";

export default function Memberships({ sectionTitle, onAuthOpen }) {
  const { services, loading, error } = useServices("membresia");
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <section
      id="membresias"
      style={{
        background: "rgba(212,175,55,0.02)",
        borderTop: "1px solid rgba(212,175,55,0.08)",
        borderBottom: "1px solid rgba(212,175,55,0.08)",
      }}
    >
      <div className="section">
        {sectionTitle(
          "Membresías",
          "Mantén tu carro limpio sin preocuparte. Sin renovación automática."
        )}

        {loading && <p style={{ textAlign: "center", color: "#a0aec0" }}>Cargando membresías...</p>}
        {error && <p style={{ textAlign: "center", color: "#f56565" }}>Error al cargar membresías.</p>}

        <CustomMembershipModal open={customOpen} onClose={() => setCustomOpen(false)} onAuthOpen={onAuthOpen} />

        {!loading && !error && (
          <div
            className="service-card-actions"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))",
              gap: "2rem",
            }}
          >
            {services.map((membership) => (
              <MembershipCard key={membership._id} {...membership} serviceId={membership._id} onAuthOpen={onAuthOpen} />
            ))}
            <div className="card-hover">
              <div
                className="glass-panel"
                style={{
                  border: "1px solid rgba(37,211,102,0.2)",
                  borderRadius: "28px",
                  padding: "2rem",
                  minHeight: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  background: "linear-gradient(135deg, rgba(37,211,102,0.06), rgba(255,255,255,0.02))"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ color: "#25D366", background: "rgba(37,211,102,0.1)", borderRadius: "16px", padding: "12px" }}>
                    <IconCalendar />
                  </div>
                  <div>
                    <h3 style={{ color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: "1.35rem", margin: 0 }}>
                      Crear tu propia membresia
                    </h3>
                    <p style={{ color: "#25D366", fontWeight: 900, margin: "2px 0 0" }}>Plan a tu medida</p>
                  </div>
                </div>
                <p style={{ color: "#a0aec0", fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>
                  Elige cuantos lavados, si es individual, duo, trio o 4+ carros, agrega placas, agenda todas las fechas y paga el plan completo.
                </p>
                <div style={{ display: "grid", gap: "10px", marginBottom: "auto" }}>
                  {["Agenda completa desde el primer dia", "Placas separadas por cada carro", "Visible en tu panel y en el admin"].map((item) => (
                    <p key={item} style={{ color: "#a0aec0", fontSize: "0.88rem", display: "flex", gap: "10px", alignItems: "center", margin: 0 }}>
                      <span style={{ color: "#25D366" }}><IconCheck /></span>
                      {item}
                    </p>
                  ))}
                </div>
                <button type="button" onClick={() => setCustomOpen(true)} style={{ ...goldBtn, width: "100%", minHeight: "48px" }}>
                  <IconCalendar /> Crear membresia
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MembershipCard({
  title,
  price,
  period,
  iconName,
  tag,
  description,
  features,
  isTrimestral,
  serviceId,
  onAuthOpen
}) {
  const [schedOpen, setSchedOpen] = useState(false);
  const IconComponent = Icons[iconName] || Icons.IconCrown;
  const visibleFeatures = isTrimestral
    ? [...new Set(["9 visitas en 3 meses", ...(features?.length ? features : ["6 lavados completos", "3 lavados exteriores"])])]
    : features || [];

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
          border: isTrimestral
            ? "2px solid rgba(212,175,55,0.4)"
            : "1px solid rgba(255,255,255,0.08)",
          borderRadius: "28px",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxShadow: isTrimestral 
            ? "0 15px 40px rgba(212,175,55,0.15)" 
            : "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        {tag && (
          <div
            style={{
              position: "absolute",
              top: "1.25rem",
              right: "1.25rem",
              background: "linear-gradient(135deg,#D4AF37,#F5D06B)",
              color: "#0a0d14",
              fontSize: "0.65rem",
              fontWeight: 900,
              borderRadius: "50px",
              padding: "5px 14px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              zIndex: 10,
              boxShadow: "0 4px 12px rgba(212,175,55,0.3)",
            }}
          >
            {tag}
          </div>
        )}
        <div
          style={{
            background: isTrimestral
              ? "linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.02))"
              : "rgba(255,255,255,0.02)",
            padding: "2rem 2rem 1.5rem",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                background: "rgba(212,175,55,0.1)",
                borderRadius: "16px",
                padding: "12px",
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
                  fontFamily: "'Cormorant Garamond',serif",
                  fontSize: "1.35rem",
                  fontWeight: 700,
                  margin: 0,
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
                  fontWeight: 900,
                  fontSize: "1.85rem",
                  margin: "2px 0 0",
                  fontFamily: "'Cormorant Garamond',serif",
                }}
              >
                {price}{" "}
                <span
                  style={{ fontSize: "0.9rem", fontWeight: 500, color: "#718096", WebkitTextFillColor: "#718096" }}
                >
                  {period}
                </span>
              </p>
            </div>
          </div>
          <p style={{ color: "#a0aec0", fontSize: "0.875rem" }}>{description}</p>
        </div>
        
        <div style={{ padding: "1.75rem 2rem 2rem", flex: 1, display: "flex", flexDirection: "column" }}>
          <p
            style={{
              color: "#D4AF37",
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.15em",
              marginBottom: "1.25rem",
              textTransform: "uppercase",
            }}
          >
            {isTrimestral ? "Plan trimestral" : "Servicios Incluidos"}
          </p>

          <div style={{ flex: 1 }}>
            {isTrimestral ? (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginBottom: "1.5rem",
                }}
              >
                {[{ mes: "Plan completo", items: visibleFeatures }].map(({ mes, items }) => (
                  <div
                    key={mes}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: "16px",
                      padding: "1rem",
                    }}
                  >
                    <p
                      style={{
                        color: "#D4AF37",
                        fontSize: "0.65rem",
                        fontWeight: 900,
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      {mes}
                    </p>
                    {items.map((it, i) => (
                      <p key={i} style={{ color: "#a0aec0", fontSize: "0.82rem", margin: "4px 0", display: "flex", gap: "6px" }}>
                        <span style={{ color: "#D4AF37" }}>•</span> {it}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "1.5rem" }}>
                {features && features.map((f, i) => (
                  <p
                    key={i}
                    style={{ color: "#a0aec0", fontSize: "0.9rem", display: "flex", gap: "10px", alignItems: "flex-start" }}
                  >
                    <span style={{ color: "#D4AF37", marginTop: "2px" }}><IconCheck /></span>
                    {f}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "auto",
              flexWrap: "wrap",
            }}
          >
            <a
              href={whatsappMsg(`Hola! Quiero contratar la ${title} por ${price}`)}
              target="_blank"
              rel="noreferrer"
              style={{ ...waBtn, flex: 1, textDecoration: "none", height: "48px" }}
            >
              <IconWA /> WhatsApp
            </a>
            <button onClick={() => setSchedOpen(true)} style={{ ...goldBtn, flex: 1, height: "48px" }}>
              <IconCalendar /> Contratar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
