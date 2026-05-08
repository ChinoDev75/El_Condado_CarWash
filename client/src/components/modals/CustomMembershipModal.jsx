import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import InputField from "../InputField";
import { IconCar, IconShield } from "../Icons";
import { goldBtn, ghostBtn } from "../../styles/buttonStyles";
import { inputStyle } from "../../styles/formStyles";
import { useAuth } from "../../context/useAuth";
import { apiFetch } from "../../lib/api";
import { todayDateKey } from "../../lib/dateUtils";
import { getPlateIssues, isValidPlate, normalizePlate, plateRequirementsText } from "../../lib/securityValidation";

const parsePriceCents = (price) => {
  const value = Number.parseFloat(String(price || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

const roundToWholeQuetzalCents = (cents) => Math.max(0, Math.round((Number(cents) || 0) / 100) * 100);
const formatCurrency = (cents) => `Q ${Math.round((cents || 0) / 100).toLocaleString("es-GT")}`;
const calculateCardFee = (subtotalCents) => roundToWholeQuetzalCents(Math.round(subtotalCents * 0.045) + 200);
const normalizeReferralCode = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
const DEFAULT_REFERRAL_DISCOUNT_PERCENT = 5;

const getMembershipDiscountRate = (grossSubtotalCents) => {
  if (grossSubtotalCents >= 40000) return 0.23;
  if (grossSubtotalCents >= 30000) return 0.20;
  if (grossSubtotalCents >= 22500) return 0.18;
  if (grossSubtotalCents >= 15000) return 0.15;
  return 0.10;
};

const getMembershipSavings = (grossSubtotalCents) => {
  const originalSubtotalCents = roundToWholeQuetzalCents(grossSubtotalCents);
  const discountRate = getMembershipDiscountRate(originalSubtotalCents);
  const discountCents = roundToWholeQuetzalCents(originalSubtotalCents * discountRate);
  const discountedSubtotalCents = roundToWholeQuetzalCents(originalSubtotalCents - discountCents);

  return {
    originalSubtotalCents,
    discountRatePercent: Math.round(discountRate * 100),
    discountCents,
    discountedSubtotalCents,
  };
};

const getNextDiscountMessage = (grossSubtotalCents) => {
  const nextTier = [
    { minCents: 15000, rate: 12 },
    { minCents: 22500, rate: 15 },
    { minCents: 30000, rate: 18 },
    { minCents: 40000, rate: 20 },
  ].find((tier) => grossSubtotalCents < tier.minCents);

  if (!nextTier) {
    return "Ya desbloqueaste el descuento maximo de membresia.";
  }

  return `Agrega ${formatCurrency(nextTier.minCents - grossSubtotalCents)} al plan para subir a ${nextTier.rate}% de descuento.`;
};

const washModeOptions = [
  { value: "at_home", label: "A domicilio", detail: "Uso su luz y agua" },
  { value: "drop_off", label: "Llegar a dejar", detail: "El cliente lo deja en mi casa C094" },
  { value: "pickup_and_return", label: "Ir a recoger", detail: "Yo recojo el carro, lo llevo a la casa C094 y lo devuelvo" },
];

const tierOptions = [
  { value: "individual", label: "Individual" },
  { value: "duo", label: "Duo" },
  { value: "trio", label: "Trio" },
  { value: "four_plus", label: "4+ carros" },
];

const getTierCount = (tier, carCount) => {
  if (tier === "individual") return 1;
  if (tier === "duo") return 2;
  if (tier === "trio") return 3;
  return Math.max(4, Math.min(12, Number(carCount) || 4));
};

const createVisit = (serviceId = "", carCount = 1) => ({
  serviceId,
  date: "",
  time: "",
  vehicleIndexes: Array.from({ length: carCount }, (_, index) => index),
});

export default function CustomMembershipModal({ open, onClose, onAuthOpen }) {
  const { user, token } = useAuth();
  const [serviceOptions, setServiceOptions] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [slotMap, setSlotMap] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [referralInfo, setReferralInfo] = useState(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralMessage, setReferralMessage] = useState("");
  const [form, setForm] = useState({
    planName: "Mi membresia personalizada",
    carTier: "individual",
    carCount: 4,
    vehiclePlates: [""],
    schedule: [createVisit("", 1), createVisit("", 1), createVisit("", 1)],
    washMode: "drop_off",
    paymentMethod: "card",
  });

  const today = todayDateKey();
  const carCount = getTierCount(form.carTier, form.carCount);
  const firstServiceId = serviceOptions[0]?._id || "";
  const serviceById = useMemo(() => new Map(serviceOptions.map((service) => [service._id, service])), [serviceOptions]);

  const getVisitService = useCallback((visit) => serviceById.get(visit.serviceId || firstServiceId) || null, [firstServiceId, serviceById]);
  const getVisitPlates = useCallback((visit) => (
    visit.vehicleIndexes
      .map((index) => form.vehiclePlates[index])
      .filter(Boolean)
  ), [form.vehiclePlates]);
  const getVisitDuration = useCallback((visit) => {
    const service = getVisitService(visit);
    return (service?.durationMinutes || 60) * Math.max(1, visit.vehicleIndexes.length);
  }, [getVisitService]);
  const getVisitSubtotal = useCallback((visit) => {
    const service = getVisitService(visit);
    return parsePriceCents(service?.price) * visit.vehicleIndexes.length;
  }, [getVisitService]);

  const grossSubtotalCents = form.schedule.reduce((sum, visit) => sum + getVisitSubtotal(visit), 0);
  const membershipSavings = getMembershipSavings(grossSubtotalCents);
  const nextDiscountMessage = getNextDiscountMessage(membershipSavings.originalSubtotalCents);
  const referralDiscountCents = referralInfo
    ? roundToWholeQuetzalCents(membershipSavings.discountedSubtotalCents * ((referralInfo.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT) / 100))
    : 0;
  const referralSubtotalCents = roundToWholeQuetzalCents(membershipSavings.discountedSubtotalCents - referralDiscountCents);
  const feeCents = form.paymentMethod === "card" ? calculateCardFee(referralSubtotalCents) : 0;
  const totalCents = referralSubtotalCents + feeCents;

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!open) return;
      setServicesLoading(true);
      try {
        const services = await apiFetch("/services");
        if (!active) return;
        setServiceOptions((Array.isArray(services) ? services : [])
          .filter((service) => ["lavado", "promo", "extra"].includes(service.category)));
      } catch (err) {
        if (active) setError(err.message || "No se pudo cargar el catalogo.");
      } finally {
        if (active) setServicesLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!open || !user || serviceOptions.length === 0) {
        setSlotMap({});
        return;
      }

      const datedVisits = form.schedule
        .map((visit, index) => ({ ...visit, index, service: getVisitService(visit), durationMinutes: getVisitDuration(visit) }))
        .filter((visit) => visit.date && visit.service?._id && visit.vehicleIndexes.length > 0 && visit.durationMinutes <= 480);

      if (datedVisits.length === 0) {
        setSlotMap({});
        return;
      }

      setSlotsLoading(true);
      try {
        const entries = await Promise.all(datedVisits.map(async (visit) => {
          const data = await apiFetch(`/settings/availability?serviceId=${encodeURIComponent(visit.service._id)}&date=${encodeURIComponent(visit.date)}&durationMinutes=${visit.durationMinutes}`);
          return [visit.index, Array.isArray(data.slots) ? data.slots.filter((slot) => slot.available) : []];
        }));

        if (active) setSlotMap(Object.fromEntries(entries));
      } catch (err) {
        if (active) {
          setError(err.message || "No se pudo cargar disponibilidad.");
          setSlotMap({});
        }
      } finally {
        if (active) setSlotsLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [form.schedule, getVisitDuration, getVisitService, open, serviceOptions, user]);

  const resetAndClose = () => {
    setError("");
    setSubmitting(false);
    setSlotMap({});
    setReferralCode("");
    setReferralInfo(null);
    setReferralLoading(false);
    setReferralMessage("");
    onClose();
  };

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = {
        ...prev,
        [name]: name === "carCount" ? Number(value) : value,
      };

      if (name === "carTier" || name === "carCount") {
        const nextCarCount = getTierCount(next.carTier, next.carCount);
        next.vehiclePlates = Array.from({ length: nextCarCount }, (_, index) => prev.vehiclePlates[index] || "");
        next.schedule = prev.schedule.map((visit) => {
          const validIndexes = visit.vehicleIndexes.filter((index) => index < nextCarCount);
          return {
            ...visit,
            vehicleIndexes: validIndexes.length > 0
              ? validIndexes
              : Array.from({ length: nextCarCount }, (_, index) => index),
            time: "",
          };
        });
      }

      return next;
    });
    setError("");
  };

  const handleReferralChange = (event) => {
    setReferralCode(normalizeReferralCode(event.target.value));
    setReferralInfo(null);
    setReferralMessage("");
    setError("");
  };

  const applyReferralCode = async () => {
    const code = normalizeReferralCode(referralCode);
    if (!code) {
      setReferralMessage("Ingresa un codigo para aplicarlo.");
      return;
    }

    setReferralLoading(true);
    setReferralMessage("");
    setError("");

    try {
      const data = await apiFetch(`/loyalty/referrals/${encodeURIComponent(code)}`, { token });
      setReferralInfo(data);
      setReferralCode(data.code || code);
      setReferralMessage(`Codigo aplicado: ${data.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT}% adicional.`);
    } catch (err) {
      setReferralInfo(null);
      setReferralMessage(err.message || "No se pudo validar el codigo.");
    } finally {
      setReferralLoading(false);
    }
  };

  const updatePlate = (index, value) => {
    setForm((prev) => ({
      ...prev,
      vehiclePlates: prev.vehiclePlates.map((plate, currentIndex) => (
        currentIndex === index ? normalizePlate(value) : plate
      )),
    }));
    setError("");
  };

  const updateVisit = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((visit, currentIndex) => (
        currentIndex === index
          ? { ...visit, [field]: value, ...(field === "date" || field === "serviceId" ? { time: "" } : {}) }
          : visit
      )),
    }));
    setError("");
  };

  const toggleVisitCar = (visitIndex, carIndex) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.map((visit, currentIndex) => {
        if (currentIndex !== visitIndex) return visit;
        const hasCar = visit.vehicleIndexes.includes(carIndex);
        const nextIndexes = hasCar
          ? visit.vehicleIndexes.filter((index) => index !== carIndex)
          : [...visit.vehicleIndexes, carIndex].sort((a, b) => a - b);
        return { ...visit, vehicleIndexes: nextIndexes, time: "" };
      }),
    }));
    setError("");
  };

  const addVisit = () => {
    setForm((prev) => ({
      ...prev,
      schedule: [...prev.schedule, createVisit(firstServiceId, carCount)],
    }));
  };

  const duplicateVisit = (index) => {
    setForm((prev) => ({
      ...prev,
      schedule: [
        ...prev.schedule.slice(0, index + 1),
        { ...prev.schedule[index], date: "", time: "" },
        ...prev.schedule.slice(index + 1),
      ].slice(0, 24),
    }));
  };

  const removeVisit = (index) => {
    setForm((prev) => ({
      ...prev,
      schedule: prev.schedule.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const moveVisit = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= form.schedule.length) return;
    setForm((prev) => {
      const nextSchedule = [...prev.schedule];
      [nextSchedule[index], nextSchedule[target]] = [nextSchedule[target], nextSchedule[index]];
      return { ...prev, schedule: nextSchedule };
    });
  };

  const validation = useMemo(() => {
    if (serviceOptions.length === 0) return "No hay servicios disponibles para armar la membresia.";
    if (form.schedule.length < 1 || form.schedule.length > 24) return "Organiza entre 1 y 24 visitas.";
    if (form.vehiclePlates.length !== carCount) return `Agrega ${carCount} placa(s).`;
    const invalidPlate = form.vehiclePlates.find((plate) => !isValidPlate(plate));
    if (invalidPlate) return `Placa invalida: ${getPlateIssues(invalidPlate)[0]}`;
    if (new Set(form.vehiclePlates).size !== form.vehiclePlates.length) return "No repitas placas.";

    const incompleteVisit = form.schedule.find((visit) => {
      const service = getVisitService(visit);
      return !service?._id || visit.vehicleIndexes.length === 0 || !visit.date || !visit.time;
    });
    if (incompleteVisit) return "Cada visita necesita servicio, carro(s), fecha y hora.";

    const longVisit = form.schedule.find((visit) => getVisitDuration(visit) > 480);
    if (longVisit) return "Una visita dura demasiado. Reduce carros en esa visita o elige otro servicio.";
    return "";
  }, [carCount, form.schedule, form.vehiclePlates, getVisitDuration, getVisitService, serviceOptions.length]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (validation) {
      setError(validation);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const data = await apiFetch("/bookings/custom-membership", {
        method: "POST",
        token,
        body: JSON.stringify({
          planName: form.planName,
          carTier: form.carTier,
          carCount,
          vehiclePlates: form.vehiclePlates,
          schedule: form.schedule.map((visit) => ({
            serviceId: getVisitService(visit)._id,
            date: visit.date,
            time: visit.time,
            vehiclePlates: getVisitPlates(visit),
          })),
          washMode: form.washMode,
          paymentMethod: form.paymentMethod,
          referralCode: referralInfo?.code || "",
        }),
      });

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError(err.message || "No se pudo crear la membresia.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={resetAndClose} title={user ? "Organizar membresia personalizada" : "Acceso requerido"}>
      {!user ? (
        <div style={{ textAlign: "center", padding: "1rem 0" }}>
          <div style={{ color: "#D4AF37", marginBottom: "1.5rem" }}><IconShield /></div>
          <h3 style={{ color: "#fff", fontSize: "1.25rem", marginBottom: "1rem", fontFamily: "'Cormorant Garamond', serif" }}>Crea una cuenta para armar tu plan</h3>
          <p style={{ color: "#a0aec0", fontSize: "0.9rem", marginBottom: "2rem", lineHeight: 1.6 }}>
            Tu membresia guarda carros, placas, agenda, servicios y pagos en tu panel.
          </p>
          <div style={{ display: "grid", gap: "12px" }}>
            <button type="button" onClick={() => { resetAndClose(); onAuthOpen(); }} style={goldBtn}>Iniciar sesion / registrarse</button>
            <button type="button" onClick={resetAndClose} style={ghostBtn}>Cerrar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
          {error && (
            <div role="alert" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171", padding: "0.85rem", borderRadius: "12px", fontSize: "0.84rem" }}>
              {error}
            </div>
          )}

          <InputField label="Nombre del plan" name="planName" value={form.planName} onChange={updateField} maxLength={120} />

          <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Carros incluidos</label>
              <select name="carTier" value={form.carTier} onChange={updateField} style={inputStyle}>
                {tierOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {form.carTier === "four_plus" ? (
              <InputField label="Numero de carros" name="carCount" type="number" min={4} max={12} value={form.carCount} onChange={updateField} required />
            ) : (
              <div style={{ ...inputStyle, display: "flex", alignItems: "center", marginTop: "29px", color: "#D4AF37", fontWeight: 900 }}>
                {carCount} carro(s)
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <label style={{ color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase" }}>Placas del plan</label>
            <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {form.vehiclePlates.map((plate, index) => (
                <InputField
                  key={`plate-${index}`}
                  label={`Carro ${index + 1}`}
                  value={plate}
                  onChange={(event) => updatePlate(index, event.target.value)}
                  placeholder="P123ASD"
                  maxLength={7}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
              ))}
            </div>
            <p style={{ margin: 0, color: "#718096", fontSize: "0.75rem" }}>{plateRequirementsText}</p>
          </div>

          <div>
            <label style={{ display: "block", color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Modo general de lavado</label>
            <select name="washMode" value={form.washMode} onChange={updateField} style={inputStyle}>
              {washModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label} - {option.detail}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase" }}>Organizacion de visitas</label>
              <button type="button" onClick={addVisit} disabled={form.schedule.length >= 24} style={{ ...ghostBtn, padding: "8px 12px", fontSize: "0.78rem" }}>Agregar visita</button>
            </div>

            {form.schedule.map((visit, index) => {
              const service = getVisitService(visit);
              const slots = slotMap[index] || [];
              const durationMinutes = getVisitDuration(visit);
              const visitSubtotal = getVisitSubtotal(visit);

              return (
                <div key={`visit-${index}`} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px", padding: "12px", display: "grid", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ color: "#D4AF37" }}>Visita {index + 1}</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => moveVisit(index, -1)} disabled={index === 0} style={{ ...ghostBtn, padding: "6px 9px", fontSize: "0.72rem", opacity: index === 0 ? 0.45 : 1 }}>Subir</button>
                      <button type="button" onClick={() => moveVisit(index, 1)} disabled={index === form.schedule.length - 1} style={{ ...ghostBtn, padding: "6px 9px", fontSize: "0.72rem", opacity: index === form.schedule.length - 1 ? 0.45 : 1 }}>Bajar</button>
                      <button type="button" onClick={() => duplicateVisit(index)} disabled={form.schedule.length >= 24} style={{ ...ghostBtn, padding: "6px 9px", fontSize: "0.72rem" }}>Duplicar</button>
                      {form.schedule.length > 1 && (
                        <button type="button" onClick={() => removeVisit(index)} style={{ ...ghostBtn, padding: "6px 9px", fontSize: "0.72rem", color: "#f87171", borderColor: "rgba(248,113,113,0.25)" }}>Quitar</button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Servicio de esta visita</label>
                    <select value={visit.serviceId || firstServiceId} onChange={(event) => updateVisit(index, "serviceId", event.target.value)} style={inputStyle} disabled={servicesLoading || serviceOptions.length === 0} required>
                      {serviceOptions.map((option) => (
                        <option key={option._id} value={option._id}>{option.title} - {option.price} - {option.durationMinutes || 60} min</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <label style={{ color: "#a0aec0", fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase" }}>Carros en esta visita</label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {form.vehiclePlates.map((plate, carIndex) => (
                        <label key={`visit-${index}-car-${carIndex}`} style={{ display: "flex", alignItems: "center", gap: "7px", background: visit.vehicleIndexes.includes(carIndex) ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "8px 10px", color: visit.vehicleIndexes.includes(carIndex) ? "#D4AF37" : "#a0aec0", fontSize: "0.78rem", fontWeight: 800 }}>
                          <input type="checkbox" checked={visit.vehicleIndexes.includes(carIndex)} onChange={() => toggleVisitCar(index, carIndex)} />
                          {plate || `Carro ${carIndex + 1}`}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="form-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <InputField label="Fecha" type="date" value={visit.date} onChange={(event) => updateVisit(index, "date", event.target.value)} min={today} required />
                    <div>
                      <label style={{ display: "block", color: "#a0aec0", fontSize: "0.85rem", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase" }}>Hora</label>
                      <select value={visit.time} onChange={(event) => updateVisit(index, "time", event.target.value)} style={inputStyle} disabled={!visit.date || slotsLoading || slots.length === 0 || durationMinutes > 480} required>
                        <option value="">{!visit.date ? "Elige fecha" : slotsLoading ? "Cargando..." : "Selecciona"}</option>
                        {slots.map((slot) => (
                          <option key={slot.time} value={slot.time}>{slot.time}</option>
                        ))}
                      </select>
                      {visit.date && !slotsLoading && slots.length === 0 && (
                        <p style={{ color: "#f87171", fontSize: "0.72rem", margin: "6px 0 0" }}>Sin horarios para esta duracion.</p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "9px" }}>
                      <p style={{ margin: 0, color: "#718096", fontSize: "0.68rem", textTransform: "uppercase" }}>Servicio</p>
                      <strong style={{ color: "#fff", fontSize: "0.78rem" }}>{service?.title || "Servicio"}</strong>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "9px" }}>
                      <p style={{ margin: 0, color: "#718096", fontSize: "0.68rem", textTransform: "uppercase" }}>Duracion</p>
                      <strong style={{ color: durationMinutes > 480 ? "#f87171" : "#fff", fontSize: "0.78rem" }}>{durationMinutes} min</strong>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "9px" }}>
                      <p style={{ margin: 0, color: "#718096", fontSize: "0.68rem", textTransform: "uppercase" }}>Subtotal</p>
                      <strong style={{ color: "#25D366", fontSize: "0.78rem" }}>{formatCurrency(visitSubtotal)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background: "rgba(212,175,55,0.07)", border: "1px solid rgba(212,175,55,0.16)", borderRadius: "16px", padding: "1rem", display: "grid", gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#a0aec0" }}>
              <span>Comprando servicio por servicio</span>
              <span style={{ textDecoration: membershipSavings.discountCents > 0 ? "line-through" : "none" }}>{formatCurrency(membershipSavings.originalSubtotalCents)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#25D366", fontWeight: 900 }}>
              <span>Descuento membresia ({membershipSavings.discountRatePercent}%)</span>
              <span>-{formatCurrency(membershipSavings.discountCents)}</span>
            </div>
            <div style={{ background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.16)", borderRadius: "12px", padding: "10px", display: "grid", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 900 }}>
                <span>Subtotal con membresia</span>
                <span>{formatCurrency(membershipSavings.discountedSubtotalCents)}</span>
              </div>
              <p style={{ margin: 0, color: "#a0aec0", fontSize: "0.78rem" }}>
                Ahorras {formatCurrency(membershipSavings.discountCents)} al organizarlo como plan completo.
              </p>
              <p style={{ margin: 0, color: "#D4AF37", fontSize: "0.76rem", fontWeight: 800 }}>
                {nextDiscountMessage}
              </p>
            </div>
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
            {referralDiscountCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#25D366", fontWeight: 900 }}>
                <span>Descuento referido ({referralInfo?.discountRatePercent || DEFAULT_REFERRAL_DISCOUNT_PERCENT}%)</span>
                <span>-{formatCurrency(referralDiscountCents)}</span>
              </div>
            )}
            <select name="paymentMethod" value={form.paymentMethod} onChange={updateField} style={inputStyle}>
              <option value="card">Tarjeta (+4.5% + Q2)</option>
              <option value="transfer">Transferencia</option>
              <option value="cash">Efectivo</option>
            </select>
            {form.paymentMethod === "card" && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#D4AF37" }}>
                <span>Comision tarjeta</span>
                <span>{formatCurrency(feeCents)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 900, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "10px" }}>
              <span>Total</span>
              <span>{formatCurrency(totalCents)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }} className="modal-actions">
            <button type="button" onClick={resetAndClose} style={ghostBtn}>Cancelar</button>
            <button type="submit" disabled={submitting || Boolean(validation)} style={{ ...goldBtn, opacity: submitting || validation ? 0.55 : 1 }}>
              <IconCar /> {submitting ? "Creando..." : form.paymentMethod === "card" ? "Pagar y crear" : "Crear membresia"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
