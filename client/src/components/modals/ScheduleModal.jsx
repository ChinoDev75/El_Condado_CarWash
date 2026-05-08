import { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import InputField from "../InputField";
import { IconShield } from "../Icons";
import { goldBtn, ghostBtn } from "../../styles/buttonStyles";
import { useAuth } from "../../context/useAuth";
import { apiFetch } from "../../lib/api";
import { todayDateKey } from "../../lib/dateUtils";
import { inputStyle } from "../../styles/formStyles";
import { getPlateIssues, isValidPlate, normalizePlate, plateRequirementsText } from "../../lib/securityValidation";

const parsePriceCents = (price) => {
  const value = Number.parseFloat(String(price || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

const formatCurrency = (cents) => `Q ${(cents / 100).toFixed(2)}`;

const calculateCardFee = (subtotalCents) => Math.round(subtotalCents * 0.045) + 200;
const roundToWholeQuetzalCents = (cents) => Math.max(0, Math.round((Number(cents) || 0) / 100) * 100);
const normalizeReferralCode = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
const DEFAULT_REFERRAL_DISCOUNT_PERCENT = 5;

const defaultTransferAccount = {
  bankName: "Configura tu banco",
  accountName: "El Condado CarWash",
  accountNumber: "Configura tu numero de cuenta",
  accountType: "Monetaria",
  instructions: "Despues de transferir, envia el comprobante por WhatsApp para confirmar tu reserva.",
};

const washModeOptions = [
  { value: "at_home", label: "A domicilio", detail: "Uso su luz y agua" },
  { value: "drop_off", label: "Llegar a dejar", detail: "El cliente lo deja en mi casa C094" },
  { value: "pickup_and_return", label: "Ir a recoger", detail: "Yo recojo el carro, lo llevo a la casa C094 y lo devuelvo" },
];

const getWashModeLabel = (value) => (
  washModeOptions.find((option) => option.value === value)?.label || "Sin definir"
);

export default function ScheduleModal({ open, onClose, serviceName, serviceId, servicePrice, onAuthOpen }) {
  const { user, token } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [serviceDuration, setServiceDuration] = useState(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferAccount, setTransferAccount] = useState(defaultTransferAccount);
  const [referralCode, setReferralCode] = useState("");
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMessage, setReferralMessage] = useState("");
  const [form, setForm] = useState({
    name: user?.name || "",
    date: "",
    time: "",
    plate: "",
    paymentMethod: "card",
    washMode: "drop_off",
  });

  const normalizedPlate = normalizePlate(form.plate);
  const plateIssues = getPlateIssues(form.plate);
  const today = todayDateKey();
  const availableSlots = slots.filter((slot) => slot.available);
  const subtotalCents = parsePriceCents(servicePrice);
  const referralDiscountCents = referralInfo
    ? roundToWholeQuetzalCents(subtotalCents * ((referralInfo.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT) / 100))
    : 0;
  const discountedSubtotalCents = referralInfo
    ? roundToWholeQuetzalCents(subtotalCents - referralDiscountCents)
    : subtotalCents;
  const feeCents = form.paymentMethod === "card"
    ? (referralInfo ? roundToWholeQuetzalCents(calculateCardFee(discountedSubtotalCents)) : calculateCardFee(discountedSubtotalCents))
    : 0;
  const totalCents = discountedSubtotalCents + feeCents;

  const isStepOneValid = useMemo(() => (
    Boolean(form.name.trim()) &&
    Boolean(form.date) &&
    Boolean(form.time) &&
    Boolean(form.washMode) &&
    isValidPlate(normalizedPlate)
  ), [form.date, form.name, form.time, form.washMode, normalizedPlate]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({
      ...p,
      [name]: name === "plate" ? normalizePlate(value) : value,
      ...(name === "date" ? { time: "" } : {})
    }));
    setErrorMsg("");
  }

  function handleReferralChange(event) {
    setReferralCode(normalizeReferralCode(event.target.value));
    setReferralInfo(null);
    setReferralMessage("");
    setErrorMsg("");
  }

  async function applyReferralCode() {
    const code = normalizeReferralCode(referralCode);
    if (!code) {
      setReferralMessage("Ingresa un codigo para aplicarlo.");
      return;
    }

    setReferralLoading(true);
    setReferralMessage("");
    setErrorMsg("");

    try {
      const data = await apiFetch(`/loyalty/referrals/${encodeURIComponent(code)}`, { token });
      setReferralInfo(data);
      setReferralCode(data.code || code);
      setReferralMessage(`Codigo aplicado: ${data.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT}% de descuento.`);
    } catch (err) {
      setReferralInfo(null);
      setReferralMessage(err.message || "No se pudo validar el codigo.");
    } finally {
      setReferralLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!open) return;

      try {
        const settings = await apiFetch("/settings/schedule");
        if (!active) return;

        setTransferAccount({
          ...defaultTransferAccount,
          ...(settings.transferAccount || {}),
        });
      } catch (err) {
        console.error(err);
      }
    });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!active) return;

      if (!open || !user || !serviceId || !form.date) {
        setSlots([]);
        setServiceDuration(null);
        setSlotsLoading(false);
        return;
      }

      setSlotsLoading(true);
      try {
        const data = await apiFetch(`/settings/availability?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(form.date)}`);
        if (!active) return;

        setSlots(Array.isArray(data.slots) ? data.slots : []);
        setServiceDuration(data.service?.durationMinutes || null);
      } catch (err) {
        if (!active) return;
        setSlots([]);
        setServiceDuration(null);
        setErrorMsg(err.message || "No se pudo cargar disponibilidad.");
      } finally {
        if (active) {
          setSlotsLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [form.date, open, serviceId, user]);

  function closeModal() {
    onClose();
    setStep(1);
    setErrorMsg("");
    setReferralCode("");
    setReferralInfo(null);
    setReferralMessage("");
    setReferralLoading(false);
    setTransferModalOpen(false);
  }

  async function handleConfirm() {
    if (!user) return;

    if (!isStepOneValid) {
      setErrorMsg(plateIssues.length > 0 ? `Placa invalida: ${plateIssues[0]}` : "Completa fecha, hora y una placa valida.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const data = await apiFetch("/bookings", {
        method: "POST",
        token,
        body: JSON.stringify({
          serviceId,
          date: form.date,
          time: form.time,
          plate: normalizedPlate,
          paymentMethod: form.paymentMethod,
          washMode: form.washMode,
          referralCode: referralInfo?.code || "",
        }),
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setErrorMsg(err.message || "Error de conexion con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  const transferRows = [
    ["Banco", transferAccount.bankName],
    ["Nombre", transferAccount.accountName],
    ["Cuenta", transferAccount.accountNumber],
    ["Tipo", transferAccount.accountType],
  ];

  return (
    <>
      <Modal open={open} onClose={closeModal} title={user ? `Agendar: ${serviceName}` : "Acceso Requerido"}>
      {!user ? (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <div style={{ color: "#D4AF37", marginBottom: "1.5rem" }}>
            <IconShield />
          </div>
          <h3 style={{ color: "#fff", fontSize: "1.25rem", marginBottom: "1rem", fontFamily: "'Cormorant Garamond', serif" }}>
            Crea una cuenta para agendar
          </h3>
          <p style={{ color: "#a0aec0", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
            Para gestionar tus reservas y puntos de fidelidad necesitas iniciar sesión o registrarte.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button type="button" onClick={() => { closeModal(); onAuthOpen(); }} style={goldBtn}>
              Iniciar Sesión / Registrarse
            </button>
            <button type="button" onClick={closeModal} style={ghostBtn}>
              Tal vez despues
            </button>
          </div>
        </div>
      ) : (
        <>
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <p style={{ color: "#9ca3af", fontSize: "0.875rem", margin: 0 }}>
                Confirma los detalles de tu servicio
              </p>
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
                label="Placa del vehiculo"
                name="plate"
                value={form.plate}
                onChange={handleChange}
                placeholder="Ej: P123ASD"
                required
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                pattern="[Pp][0-9]{3}[A-Za-z]{3}"
              />
              <p style={{ color: plateIssues.length === 0 ? "#25D366" : "#718096", fontSize: "0.75rem", margin: "-6px 0 0", lineHeight: 1.45 }}>
                {form.plate && plateIssues.length === 0 ? "Placa valida." : plateRequirementsText}
              </p>
              <div>
                <label style={{ display: "block", color: "#9ca3af", fontSize: "0.8rem", marginBottom: "6px" }}>
                  Modo de lavado
                </label>
                <select
                  name="washMode"
                  value={form.washMode}
                  onChange={handleChange}
                  style={inputStyle}
                  required
                >
                  {washModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.detail}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
                className="form-grid-2"
              >
                <InputField
                  label="Fecha"
                  name="date"
                  type="date"
                  value={form.date}
                  onChange={handleChange}
                  min={today}
                  required
                />
                <div>
                  <label
                    htmlFor="booking-time"
                    style={{
                      display: "block",
                      color: "#9ca3af",
                      fontSize: "0.8rem",
                      marginBottom: "6px",
                    }}
                  >
                    Hora
                  </label>
                  <select
                    id="booking-time"
                    name="time"
                    value={form.time}
                    onChange={handleChange}
                    style={inputStyle}
                    required
                    disabled={!form.date || slotsLoading || availableSlots.length === 0}
                  >
                    <option value="">
                      {!form.date ? "Elige fecha" : slotsLoading ? "Cargando..." : "Selecciona"}
                    </option>
                    {availableSlots.map((slot) => (
                      <option key={slot.time} value={slot.time}>
                        {slot.time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {serviceDuration && (
                <p style={{ color: "#718096", fontSize: "0.78rem", margin: 0 }}>
                  Duracion estimada del servicio: {serviceDuration} minutos.
                </p>
              )}
              {form.date && !slotsLoading && availableSlots.length === 0 && (
                <p role="alert" style={{ color: "#f87171", fontSize: "0.78rem", margin: 0 }}>
                  No hay horarios disponibles para esta fecha.
                </p>
              )}
              <button
                type="button"
                disabled={!isStepOneValid}
                onClick={() => setStep(2)}
                style={{
                  ...goldBtn,
                  marginTop: "0.5rem",
                  opacity: isStepOneValid ? 1 : 0.5,
                }}
              >
                Continuar al Resumen
              </button>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {errorMsg && (
                <div role="alert" style={{ background: "rgba(248, 113, 113, 0.1)", border: "1px solid #f87171", color: "#f87171", padding: "1rem", borderRadius: "12px", fontSize: "0.85rem", textAlign: "center" }}>
                  {errorMsg}
                </div>
              )}
              <div
                style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  borderRadius: "16px",
                  padding: "1.5rem",
                }}
              >
                <p
                  style={{
                    color: "#D4AF37",
                    fontWeight: 700,
                    marginBottom: "1rem",
                    fontSize: "1rem"
                  }}
                >
                  Resumen de tu Reserva
                </p>
                {[
                  ["Servicio", serviceName],
                  ["Nombre", form.name],
                  ["Placa", normalizedPlate],
                  ["Modo", getWashModeLabel(form.washMode)],
                  ["Fecha", form.date],
                  ["Hora", form.time],
                  ["Pago", form.paymentMethod === "card" ? "Tarjeta" : form.paymentMethod === "transfer" ? "Transferencia" : "Efectivo"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span style={{ color: "#718096", fontSize: "0.875rem" }}>
                      {k}
                    </span>
                    <span
                      style={{
                        color: "#fff",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        textAlign: "right",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "1rem", display: "grid", gap: "10px" }}>
                <label style={{ color: "#a0aec0", fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Metodo de pago
                </label>
                <select
                  name="paymentMethod"
                  value={form.paymentMethod}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="card">Tarjeta (+4.5% + Q2)</option>
                  <option value="transfer">Transferencia</option>
                  <option value="cash">Efectivo</option>
                </select>
                <div style={{ display: "grid", gap: "8px" }}>
                  <label style={{ color: "#a0aec0", fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Codigo de referido
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px" }}>
                    <input
                      value={referralCode}
                      onChange={handleReferralChange}
                      placeholder="EJ: ANA1B2C"
                      style={inputStyle}
                      maxLength={24}
                      autoCapitalize="characters"
                    />
                    <button
                      type="button"
                      onClick={applyReferralCode}
                      disabled={referralLoading || !referralCode}
                      style={{ ...ghostBtn, padding: "10px 14px", opacity: referralLoading || !referralCode ? 0.55 : 1 }}
                    >
                      {referralLoading ? "..." : "Aplicar"}
                    </button>
                  </div>
                  {referralMessage && (
                    <p style={{ margin: 0, color: referralInfo ? "#25D366" : "#f87171", fontSize: "0.78rem" }}>
                      {referralMessage}
                    </p>
                  )}
                </div>
                <div style={{ display: "grid", gap: "6px", fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#a0aec0" }}>
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotalCents)}</span>
                  </div>
                  {referralDiscountCents > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#25D366", fontWeight: 900 }}>
                      <span>Descuento referido ({referralInfo?.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT}%)</span>
                      <span>-{formatCurrency(referralDiscountCents)}</span>
                    </div>
                  )}
                  {form.paymentMethod === "card" && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#D4AF37" }}>
                      <span>Comision tarjeta</span>
                      <span>{formatCurrency(feeCents)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 900, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
                    <span>Total</span>
                    <span>{formatCurrency(totalCents)}</span>
                  </div>
                </div>
              </div>
              {form.paymentMethod === "transfer" && (
                <div style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)", borderRadius: "16px", padding: "1rem", display: "grid", gap: "10px" }}>
                  <p style={{ color: "#D4AF37", fontWeight: 900, margin: 0, fontSize: "0.9rem" }}>
                    Transferencia bancaria
                  </p>
                  <p style={{ color: "#a0aec0", margin: 0, fontSize: "0.82rem", lineHeight: 1.5 }}>
                    Revisa la cuenta antes de agendar y guarda tu comprobante.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTransferModalOpen(true)}
                    style={{ ...ghostBtn, width: "100%", padding: "11px 14px" }}
                  >
                    Ver cuenta para transferir
                  </button>
                </div>
              )}
              <p
                style={{ color: "#718096", fontSize: "0.8rem", textAlign: "center", lineHeight: 1.5 }}
              >
                {form.paymentMethod === "card"
                  ? "Al confirmar, se generara tu link de pago seguro a traves de Recurrente."
                  : form.paymentMethod === "transfer"
                    ? "Tu reserva quedara creada para pago por transferencia."
                    : "Tu reserva quedara creada como pago en efectivo."}
              </p>
              <div className="modal-actions" style={{ display: "flex", gap: "12px", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setStep(1)} disabled={loading} style={{ ...ghostBtn, flex: 1 }}>
                  Editar
                </button>
                <button type="button" onClick={handleConfirm} disabled={loading} style={{ ...goldBtn, flex: 2 }}>
                  {loading ? "Procesando..." : form.paymentMethod === "card" ? "Pagar y Agendar" : "Agendar"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      </Modal>
      <Modal
        open={transferModalOpen && form.paymentMethod === "transfer"}
        onClose={() => setTransferModalOpen(false)}
        title="Datos de Transferencia"
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.18)", borderRadius: "16px", padding: "1rem", display: "grid", gap: "10px" }}>
            {transferRows.map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
                <span style={{ color: "#718096", fontSize: "0.85rem" }}>{label}</span>
                <strong style={{ color: "#fff", textAlign: "right", overflowWrap: "anywhere" }}>{value || "-"}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", paddingTop: "4px" }}>
              <span style={{ color: "#718096", fontSize: "0.85rem" }}>Monto</span>
              <strong style={{ color: "#D4AF37", fontSize: "1.1rem" }}>{formatCurrency(totalCents)}</strong>
            </div>
          </div>
          <p style={{ color: "#a0aec0", fontSize: "0.88rem", lineHeight: 1.6, margin: 0 }}>
            {transferAccount.instructions}
          </p>
          <button type="button" onClick={() => setTransferModalOpen(false)} style={{ ...goldBtn, width: "100%" }}>
            Entendido
          </button>
        </div>
      </Modal>
    </>
  );
}
