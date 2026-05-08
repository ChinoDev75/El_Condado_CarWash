import { useState } from "react";
import Modal from "../Modal";
import InputField from "../InputField";
import { IconEye, IconEyeOff } from "../Icons";
import { goldBtn } from "../../styles/buttonStyles";
import { useAuth } from "../../context/useAuth";
import { inputStyle } from "../../styles/formStyles";
import { getPasswordIssues, getPasswordStrength } from "../../lib/securityValidation";

export default function AuthModal({ open, onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    email: "",
    password: "",
    confirm: "",
  });

  function handleChange(e) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError("");
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const email = form.email.trim();
    const password = form.password;
    const passwordIssues = getPasswordIssues(password, { name: form.name, email });

    if (!email || !password) {
      setError("Completa tu correo y contraseña.");
      return;
    }

    if (mode === "register") {
      if (!form.name.trim()) {
        setError("Agrega tu nombre completo.");
        return;
      }
      if (!form.address.trim()) {
        setError("Agrega tu direccion.");
        return;
      }
      if (passwordIssues.length > 0) {
        setError(`Contraseña insegura: ${passwordIssues[0]}`);
        return;
      }
      if (password !== form.confirm) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }

    setLoading(true);

    const res = mode === "register"
      ? await register(form.name.trim(), email, password, form.phone.trim(), form.address.trim())
      : await login(email, password);

    if (res.success) {
      onClose();
    } else {
      setError(res.message);
    }

    setLoading(false);
  };

  const passwordIssues = mode === "register"
    ? getPasswordIssues(form.password, { name: form.name, email: form.email })
    : [];
  const passwordStrength = mode === "register"
    ? getPasswordStrength(form.password, { name: form.name, email: form.email })
    : 0;
  const passwordStrengthPercent = Math.round((passwordStrength / 9) * 100);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "login" ? "Iniciar Sesión" : "Crear Cuenta"}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "10px",
            padding: "4px",
          }}
        >
          {["login", "register"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); }}
              style={{
                flex: 1,
                padding: "8px",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                background: mode === m ? "rgba(212,175,55,0.2)" : "transparent",
                color: mode === m ? "#D4AF37" : "#6b7280",
                fontWeight: 600,
                fontSize: "0.85rem",
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {m === "login" ? "Iniciar Sesión" : "Registrarse"}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" style={{ color: "#f87171", fontSize: "0.75rem", textAlign: "center", margin: 0 }}>
            {error}
          </p>
        )}

        {mode === "register" && (
          <>
            <InputField
              label="Nombre completo"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Tu nombre"
              required
              autoComplete="name"
            />
            <InputField
              label="WhatsApp"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Ej: 5555 5555"
              autoComplete="tel"
            />
            <InputField
              label="Direccion"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Casa, colonia, zona o referencia"
              required
              autoComplete="street-address"
              maxLength={220}
            />
          </>
        )}
        <InputField
          label="Correo electrónico"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="correo@ejemplo.com"
          required
          autoComplete="email"
        />

        <div>
          <label
            htmlFor="auth-password"
            style={{
              display: "block",
              color: "#9ca3af",
              fontSize: "0.8rem",
              marginBottom: "6px",
            }}
          >
            Contraseña
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="auth-password"
              type={showPw ? "text" : "password"}
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="********"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 10 : undefined}
              maxLength={128}
              required
              style={{ ...inputStyle, paddingRight: "42px" }}
            />
            <button
              type="button"
              aria-label={showPw ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPw((p) => !p)}
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "#6b7280",
                cursor: "pointer",
              }}
            >
              {showPw ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          {mode === "register" && (
            <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
              <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${passwordStrengthPercent}%`,
                    height: "100%",
                    background: passwordIssues.length === 0 ? "#25D366" : "#D4AF37",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
              <p style={{ margin: 0, color: passwordIssues.length === 0 ? "#25D366" : "#a0aec0", fontSize: "0.72rem", lineHeight: 1.45 }}>
                {passwordIssues.length === 0
                  ? "Contraseña segura."
                  : `Falta: ${passwordIssues.slice(0, 3).join(", ")}`}
              </p>
            </div>
          )}
        </div>

        {mode === "register" && (
          <InputField
            label="Confirmar contraseña"
            name="confirm"
            type="password"
            value={form.confirm}
            onChange={handleChange}
            placeholder="********"
            required
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ ...goldBtn, marginTop: "0.25rem", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Cargando..." : (mode === "login" ? "Ingresar" : "Crear cuenta")}
        </button>

        <p
          style={{
            color: "#4b5563",
            fontSize: "0.75rem",
            textAlign: "center",
            margin: 0,
          }}
        >
          {mode === "login" ? "No tienes cuenta? " : "Ya tienes cuenta? "}
          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            style={{
              background: "none",
              border: "none",
              color: "#D4AF37",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontFamily: "inherit",
            }}
          >
            {mode === "login" ? "Regístrate aquí" : "Inicia sesión"}
          </button>
        </p>
      </form>
    </Modal>
  );
}
