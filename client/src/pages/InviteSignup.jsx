import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import InputField from "../components/InputField";
import { IconCar } from "../components/Icons";
import { useAuth } from "../context/useAuth";
import { apiFetch } from "../lib/api";
import { getPasswordIssues, getPasswordStrength } from "../lib/securityValidation";
import { goldBtn, ghostBtn } from "../styles/buttonStyles";

export default function InviteSignup() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { completeInvite } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    email: "",
    password: "",
    confirm: ""
  });

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      try {
        const data = await apiFetch(`/clients/invitations/${encodeURIComponent(token)}`);
        if (!active) return;
        setInvite(data);
        setForm((prev) => ({
          ...prev,
          name: data.name || "",
          address: data.address || ""
        }));
      } catch (err) {
        if (active) setError(err.message || "No se pudo abrir la invitacion.");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [token]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const email = form.email.trim();
    const passwordIssues = getPasswordIssues(form.password, { name: form.name, email });

    if (!form.name.trim() || !form.address.trim() || !email) {
      setError("Completa nombre, direccion y correo.");
      return;
    }

    if (passwordIssues.length > 0) {
      setError(`Contrasena insegura: ${passwordIssues[0]}`);
      return;
    }

    if (form.password !== form.confirm) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setSubmitting(true);
    const result = await completeInvite(token, {
      name: form.name.trim(),
      address: form.address.trim(),
      email,
      password: form.password
    });

    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.message || "No se pudo crear tu cuenta.");
    }
    setSubmitting(false);
  };

  const passwordIssues = getPasswordIssues(form.password, { name: form.name, email: form.email });
  const passwordStrengthPercent = Math.round((getPasswordStrength(form.password, { name: form.name, email: form.email }) / 9) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#030508", color: "#e5e7eb", display: "grid", placeItems: "center", padding: "2rem" }}>
      <div className="glass-panel" style={{ width: "min(560px, 100%)", borderRadius: "28px", border: "1px solid rgba(212,175,55,0.24)", padding: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "1.5rem" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "14px", display: "grid", placeItems: "center", color: "#D4AF37", background: "rgba(212,175,55,0.1)" }}>
            <IconCar />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontFamily: "'Cormorant Garamond', serif", fontSize: "2rem" }}>Crear cuenta</h1>
            <p style={{ margin: "4px 0 0", color: "#718096", fontSize: "0.9rem" }}>El Condado CarWash</p>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#a0aec0", margin: 0 }}>Cargando invitacion...</p>
        ) : error && !invite ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <p role="alert" style={{ color: "#f87171", margin: 0 }}>{error}</p>
            <button type="button" onClick={() => navigate("/")} style={ghostBtn}>Volver</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
            {error && <p role="alert" style={{ color: "#f87171", margin: 0, fontSize: "0.85rem" }}>{error}</p>}
            <div style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.16)", borderRadius: "16px", padding: "1rem" }}>
              <p style={{ margin: 0, color: "#D4AF37", fontWeight: 900 }}>{invite?.name}</p>
              <p style={{ margin: "4px 0 0", color: "#a0aec0", fontSize: "0.86rem" }}>WhatsApp: {invite?.phone}</p>
            </div>
            <InputField label="Nombre completo" name="name" value={form.name} onChange={handleChange} required autoComplete="name" />
            <InputField label="Direccion" name="address" value={form.address} onChange={handleChange} required autoComplete="street-address" maxLength={220} />
            <InputField label="Correo electronico" name="email" type="email" value={form.email} onChange={handleChange} required autoComplete="email" />
            <InputField label="Contrasena" name="password" type="password" value={form.password} onChange={handleChange} required minLength={10} maxLength={128} autoComplete="new-password" />
            <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${passwordStrengthPercent}%`, height: "100%", background: passwordIssues.length === 0 ? "#25D366" : "#D4AF37" }} />
            </div>
            <p style={{ margin: "-6px 0 0", color: passwordIssues.length === 0 ? "#25D366" : "#a0aec0", fontSize: "0.74rem" }}>
              {passwordIssues.length === 0 ? "Contrasena segura." : `Falta: ${passwordIssues.slice(0, 3).join(", ")}`}
            </p>
            <InputField label="Confirmar contrasena" name="confirm" type="password" value={form.confirm} onChange={handleChange} required minLength={10} maxLength={128} autoComplete="new-password" />
            <button type="submit" disabled={submitting} style={{ ...goldBtn, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Creando..." : "Crear mi cuenta"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
