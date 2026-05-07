import ServiceCard from "../ServiceCard";
import * as Icons from "../Icons";
import { useServices } from "../../hooks/useServices";

export default function Services({ sectionTitle, onAuthOpen }) {
  const { services, loading, error } = useServices("lavado");

  return (
    <section
      id="servicios"
      style={{
        background: "rgba(255,255,255,0.01)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="section">
        {sectionTitle("Nuestros Servicios", "Elige el lavado perfecto para tu vehículo")}
        
        {loading && <p style={{ textAlign: "center", color: "#a0aec0" }}>Cargando servicios...</p>}
        {error && <p style={{ textAlign: "center", color: "#f56565" }}>Error al cargar los servicios.</p>}
        
        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))",
              gap: "2rem",
            }}
          >
            {services.map((service) => {
              const IconComponent = Icons[service.iconName] || Icons.IconCar;
              return (
                <div key={service._id} className="card-hover">
                  <ServiceCard
                    icon={<IconComponent />}
                    title={service.title}
                    price={service.price}
                    tag={service.tag}
                    features={service.features}
                    waMsg={service.waMsg}
                    serviceId={service._id}
                    onAuthOpen={onAuthOpen}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
