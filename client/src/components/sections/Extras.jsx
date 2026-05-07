import ServiceCard from "../ServiceCard";
import * as Icons from "../Icons";
import { useServices } from "../../hooks/useServices";

export default function Extras({ sectionTitle, onAuthOpen }) {
  const { services, loading, error } = useServices("extra");

  return (
    <section id="plugins">
      <div className="section">
        {sectionTitle(
          "Servicios Extra",
          "Eleva el cuidado de tu vehículo con nuestros complementos premium"
        )}
        
        {loading && <p style={{ textAlign: "center", color: "#a0aec0" }}>Cargando extras...</p>}
        {error && <p style={{ textAlign: "center", color: "#f56565" }}>Error al cargar los extras.</p>}
        
        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))",
              gap: "2rem",
            }}
          >
            {services.map((service) => {
              const IconComponent = Icons[service.iconName] || Icons.IconSparkle;
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
