import { useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import { IconStar } from "../Icons";
import { goldBtn, ghostBtn } from "../../styles/buttonStyles";
import { apiFetch } from "../../lib/api";
import Modal from "../Modal";
import { inputStyle } from "../../styles/formStyles";

export default function ReviewsSection({ sectionTitle }) {
  const { user, token } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newReview, setNewReview] = useState({ rating: 5, comment: "", serviceId: "" });
  const [services, setServices] = useState([]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchReviews = async () => {
    const data = await apiFetch("/loyalty/reviews/all");
    setReviews(Array.isArray(data) ? data : []);
  };

  const fetchServices = async () => {
    const data = await apiFetch("/services");
    const serviceList = Array.isArray(data) ? data : [];
    setServices(serviceList);
    if (serviceList.length > 0) {
      setNewReview((prev) => ({ ...prev, serviceId: prev.serviceId || serviceList[0]._id }));
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const [reviewData, serviceData] = await Promise.all([
          apiFetch("/loyalty/reviews/all"),
          apiFetch("/services")
        ]);

        if (!active) return;

        const serviceList = Array.isArray(serviceData) ? serviceData : [];
        setReviews(Array.isArray(reviewData) ? reviewData : []);
        setServices(serviceList);
        if (serviceList.length > 0) {
          setNewReview((prev) => ({ ...prev, serviceId: prev.serviceId || serviceList[0]._id }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!newReview.serviceId || newReview.comment.trim().length < 5) {
      setFormError("Selecciona un servicio y escribe un comentario valido.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/loyalty/reviews", {
        method: "POST",
        token,
        body: JSON.stringify({
          service: newReview.serviceId,
          rating: Number(newReview.rating),
          comment: newReview.comment.trim()
        })
      });

      setShowModal(false);
      setNewReview((prev) => ({ ...prev, comment: "", rating: 5 }));
      await fetchReviews();
      await fetchServices();
    } catch (err) {
      setFormError(err.message || "Error al enviar reseña");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="reviews" style={{ background: "rgba(212,175,55,0.02)", borderTop: "1px solid rgba(212,175,55,0.05)" }}>
      <div className="section">
        {sectionTitle("Opiniones de Clientes", "Lo que dicen quienes ya viven la experiencia premium")}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: "2rem", marginBottom: "4rem" }}>
          {loading ? (
            <p style={{ textAlign: "center", color: "#718096", gridColumn: "1 / -1" }}>Cargando opiniones...</p>
          ) : reviews.length > 0 ? reviews.map((review) => (
            <div key={review._id} className="glass-panel" style={{ padding: "2rem", borderRadius: "24px", position: "relative" }}>
              <div style={{ display: "flex", gap: "4px", color: "#D4AF37", marginBottom: "1rem" }}>
                {[...Array(review.rating)].map((_, i) => <IconStar key={i} />)}
              </div>
              <p style={{ color: "#e5e7eb", fontStyle: "italic", marginBottom: "1.5rem", lineHeight: 1.7 }}>"{review.comment}"</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "linear-gradient(135deg, #D4AF37, #F5D06B)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0a0d14", fontWeight: 900, fontSize: "0.8rem" }}>
                  {review.user?.name?.charAt(0) || "C"}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>{review.user?.name || "Cliente"}</p>
                  <p style={{ fontSize: "0.75rem", color: "#718096", margin: 0 }}>Cliente verificado</p>
                </div>
              </div>
            </div>
          )) : (
            <p style={{ textAlign: "center", color: "#718096", gridColumn: "1 / -1" }}>Aún no hay reseñas. Sé el primero en opinar.</p>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          {user ? (
            <button type="button" onClick={() => setShowModal(true)} style={{ ...goldBtn, padding: "14px 32px" }}>
              Dejar mi Opinion Premium
            </button>
          ) : (
            <p style={{ color: "#718096", fontSize: "0.9rem" }}>
              Inicia sesión para compartir tu experiencia y ganar puntos de fidelidad.
            </p>
          )}
        </div>

        <Modal open={showModal} onClose={() => setShowModal(false)} title="Califica nuestro servicio">
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {formError && (
              <p role="alert" style={{ color: "#f87171", fontSize: "0.85rem", margin: 0, textAlign: "center" }}>{formError}</p>
            )}
            <div>
              <label style={{ display: "block", color: "#718096", fontSize: "0.8rem", marginBottom: "8px" }}>Servicio Realizado</label>
              <select
                value={newReview.serviceId}
                onChange={(e) => setNewReview({ ...newReview, serviceId: e.target.value })}
                style={inputStyle}
                required
              >
                {services.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", color: "#718096", fontSize: "0.8rem", marginBottom: "8px" }}>Calificacion (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                value={newReview.rating}
                onChange={(e) => setNewReview({ ...newReview, rating: e.target.value })}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={{ display: "block", color: "#718096", fontSize: "0.8rem", marginBottom: "8px" }}>Tu Comentario</label>
              <textarea
                rows="4"
                value={newReview.comment}
                onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                placeholder="Cuéntanos qué te pareció el servicio..."
                style={{ ...inputStyle, resize: "none" }}
                required
              />
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "1rem" }}>
              <button type="button" onClick={() => setShowModal(false)} style={{ ...ghostBtn, flex: 1 }}>Cancelar</button>
              <button type="submit" disabled={submitting} style={{ ...goldBtn, flex: 2, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "Publicando..." : "Publicar Reseña"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </section>
  );
}
