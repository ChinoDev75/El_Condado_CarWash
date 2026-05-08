import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { IconCar, IconDroplet, IconTool, IconShield, IconStar, IconCalendar } from '../../components/Icons';
import { goldBtn, ghostBtn } from '../../styles/buttonStyles';
import { apiFetch } from '../../lib/api';
import Modal from '../../components/Modal';
import AlertCard from '../../components/AlertCard';
import InputField from '../../components/InputField';
import { inputStyle } from '../../styles/formStyles';
import {
  buildBusinessDateTime,
  formatDisplayDate,
  todayDateKey,
  toDateKey
} from '../../lib/dateUtils';
import { getPlateIssues, isValidPlate, normalizePlate, plateRequirementsText } from '../../lib/securityValidation';

const dayLabels = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const shortDayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const defaultSettings = {
  slotIntervalMinutes: 30,
  weeklySchedule: [
    { day: 0, enabled: false, start: '08:00', end: '17:00' },
    { day: 1, enabled: true, start: '08:00', end: '17:00' },
    { day: 2, enabled: true, start: '08:00', end: '17:00' },
    { day: 3, enabled: true, start: '08:00', end: '17:00' },
    { day: 4, enabled: true, start: '08:00', end: '17:00' },
    { day: 5, enabled: true, start: '08:00', end: '17:00' },
    { day: 6, enabled: true, start: '08:00', end: '14:00' }
  ],
  transferAccount: {
    bankName: 'Configura tu banco',
    accountName: 'El Condado CarWash',
    accountNumber: 'Configura tu numero de cuenta',
    accountType: 'Monetaria',
    instructions: 'Despues de transferir, envia el comprobante por WhatsApp para confirmar tu reserva.'
  },
  unavailableBlocks: []
};

const normalizeClientSettings = (settings = {}) => ({
  ...defaultSettings,
  ...settings,
  weeklySchedule: Array.isArray(settings.weeklySchedule) ? settings.weeklySchedule : defaultSettings.weeklySchedule,
  unavailableBlocks: Array.isArray(settings.unavailableBlocks) ? settings.unavailableBlocks : [],
  transferAccount: {
    ...defaultSettings.transferAccount,
    ...(settings.transferAccount || {})
  }
});

const defaultMetrics = {
  todayCount: 0,
  monthBookings: 0,
  revenueCents: 0,
  pendingPaymentsCents: 0,
  activeMemberships: 0,
  unpaidCount: 0,
  failedPaymentCount: 0,
  cancelledMonthCount: 0,
  completedMonthCount: 0,
  upcomingWeekCount: 0,
  paymentMethodTotals: [],
  membershipVisitSummary: { total: 0, completed: 0, remaining: 0 },
  topServices: [],
  peakHours: [],
  monthLabel: ''
};

const emptyManualBooking = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  customerAddress: '',
  serviceId: '',
  date: '',
  time: '',
  plate: '',
  paymentMethod: 'cash',
  paymentStatus: 'unpaid',
  washMode: 'drop_off',
  internalNotes: ''
};

const emptyClientInvite = {
  name: '',
  phone: '',
  address: ''
};

const emptyUnavailableBlock = () => ({
  date: todayDateKey(),
  start: '12:00',
  end: '13:00',
  note: ''
});

const formatCurrency = (cents = 0) => `Q ${(cents / 100).toFixed(2)}`;
const parsePriceCents = (price) => {
  const value = Number.parseFloat(String(price || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};
const calculateCardFee = (subtotalCents) => Math.round(subtotalCents * 0.045) + 200;
const calculateBookingPoints = (booking) => {
  const baseCents = booking.subtotalCents || booking.totalCents || parsePriceCents(booking.service?.price);
  return baseCents > 0 ? Math.max(1, Math.floor(baseCents / 300)) : 0;
};

const washModeOptions = [
  { value: 'at_home', label: 'A domicilio', detail: 'Uso su luz y agua' },
  { value: 'drop_off', label: 'Llegar a dejar', detail: 'Cliente lo deja en casa C094' },
  { value: 'pickup_and_return', label: 'Ir a recoger', detail: 'Recojo, llevo a C094 y devuelvo' }
];

const getWashModeLabel = (value) => (
  washModeOptions.find((option) => option.value === value)?.label || 'Sin definir'
);

const paymentMethodLabel = (method) => {
  if (method === 'cash') return 'Efectivo';
  if (method === 'transfer') return 'Transferencia';
  return 'Tarjeta';
};

const paymentLabel = (item) => {
  if (item.paymentStatus === 'paid') return 'Pagado';
  if (item.paymentStatus === 'failed') return 'Pago fallido';
  if (item.paymentMethod === 'cash') return 'Pago en efectivo';
  if (item.paymentMethod === 'transfer') return 'Transferencia pendiente';
  return 'Pago pendiente';
};

const paymentBadgeStyle = (item) => {
  if (item.paymentStatus === 'paid') {
    return { background: 'rgba(37, 211, 102, 0.1)', color: '#25D366' };
  }

  if (item.paymentStatus === 'failed') {
    return { background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' };
  }

  return { background: 'rgba(212, 175, 55, 0.12)', color: '#D4AF37' };
};

const formatDateKey = (value) => toDateKey(value);

const formatDate = (value, options = {}) => (
  formatDisplayDate(value, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...options
  })
);

const buildCalendarEvents = (bookings) => {
  const events = [];

  bookings.forEach((booking) => {
    const serviceId = booking.service?._id || booking.service || '';

    events.push({
      id: `${booking._id}-main`,
      bookingId: booking._id,
      serviceId,
      dateKey: formatDateKey(booking.date),
      time: booking.time,
      title: getBookingTitle(booking),
      customer: booking.user?.name || booking.customerName || 'Cliente',
      plate: getVehicleLabel(booking),
      washMode: booking.washMode,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      type: isMembershipBooking(booking) ? 'membresia' : 'reserva'
    });

    (booking.status === 'cancelled' ? [] : (booking.membershipSchedule || []))
      .filter((visit) => visit.status !== 'cancelled')
      .forEach((visit) => {
        events.push({
          id: `${booking._id}-${visit._id || visit.date}`,
          bookingId: booking._id,
          serviceId,
          dateKey: formatDateKey(visit.date),
          time: visit.time,
          title: visit.title,
          customer: booking.user?.name || booking.customerName || 'Cliente',
          visitId: visit._id,
          plate: getVehicleLabel(booking),
          washMode: booking.washMode,
          status: visit.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          type: 'membresia'
        });
      });
  });

  return events.sort((a, b) => `${a.dateKey} ${a.time}`.localeCompare(`${b.dateKey} ${b.time}`));
};

const buildBookingRows = (bookings) => {
  const rows = [];

  bookings.forEach((booking) => {
    const service = typeof booking.service === 'object' && booking.service
      ? booking.service
      : { _id: booking.service, title: 'Servicio eliminado', category: 'reserva' };
    const serviceId = service?._id || booking.service || '';
    const customer = booking.user?.name || booking.customerName || 'Cliente manual';
    const contact = booking.user?.email || booking.customerPhone || booking.customerEmail || '---';

    rows.push({
      ...booking,
      _id: `${booking._id}-main`,
      bookingId: booking._id,
      booking,
      service,
      serviceId,
      customer,
      contact,
      washMode: booking.washMode,
      dateKey: formatDateKey(booking.date),
      plate: getVehicleLabel(booking),
      type: getBookingType({ ...booking, service }),
      isMembershipVisit: false
    });

    (booking.status === 'cancelled' ? [] : (booking.membershipSchedule || []))
      .filter((visit) => visit.status !== 'cancelled')
      .forEach((visit) => {
        rows.push({
          ...booking,
          _id: `${booking._id}-${visit._id || visit.date}`,
          bookingId: booking._id,
          visitId: visit._id,
          booking,
          service: {
            ...service,
            title: visit.title || service?.title || 'Lavado de membresia',
            category: 'membresia'
          },
          serviceId,
          customer,
          contact,
          washMode: booking.washMode,
          date: visit.date,
          dateKey: formatDateKey(visit.date),
          time: visit.time,
          plate: getVehicleLabel(booking),
          status: visit.status,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          type: 'membresia',
          isMembershipVisit: true
        });
      });
  });

  return rows.sort((a, b) => `${a.dateKey} ${a.time}`.localeCompare(`${b.dateKey} ${b.time}`));
};

const getMonthDays = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const leadingDays = firstDay.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let i = 0; i < leadingDays; i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    days.push(new Date(year, month, day));
  }

  return days;
};

const emptyFilters = {
  serviceId: 'all',
  status: 'all',
  paymentStatus: 'all',
  type: 'all'
};

const isActiveBooking = (booking) => ['pending', 'confirmed'].includes(booking.status);
const isMembershipBooking = (booking) => (booking.membershipPlan && booking.membershipPlan !== 'none') || booking.service?.category === 'membresia';
const getBookingType = (booking) => (isMembershipBooking(booking) ? 'membresia' : 'reserva');
const getBookingTitle = (booking) => booking.customMembership?.planName || booking.service?.title || 'Servicio';
const getVehicleLabel = (booking) => (
  Array.isArray(booking.vehiclePlates) && booking.vehiclePlates.length > 0
    ? booking.vehiclePlates.join(', ')
    : booking.plate
);

const matchesFilters = (booking, filters) => (
  (filters.serviceId === 'all' || (booking.service?._id || booking.service) === filters.serviceId) &&
  (filters.status === 'all' || booking.status === filters.status) &&
  (filters.paymentStatus === 'all' || booking.paymentStatus === filters.paymentStatus) &&
  (filters.type === 'all' || getBookingType(booking) === filters.type)
);

const matchesEventFilters = (event, filters) => (
  (filters.serviceId === 'all' || event.serviceId === filters.serviceId) &&
  (filters.status === 'all' || event.status === filters.status) &&
  (filters.paymentStatus === 'all' || event.paymentStatus === filters.paymentStatus) &&
  (filters.type === 'all' || event.type === filters.type)
);

export default function AdminConsole() {
  const { token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('bookings');
  const [data, setData] = useState({ bookings: [], services: [], users: [], clientInvites: [], settings: defaultSettings, metrics: defaultMetrics });
  const [loading, setLoading] = useState(true);
  const [alertCard, setAlertCard] = useState({ open: false });
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [inviteClientModalOpen, setInviteClientModalOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientInviteForm, setClientInviteForm] = useState(emptyClientInvite);
  const [manualForm, setManualForm] = useState(emptyManualBooking);
  const [manualSlots, setManualSlots] = useState([]);
  const [manualSlotsLoading, setManualSlotsLoading] = useState(false);
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [rescheduleForm, setRescheduleForm] = useState({
    bookingId: '',
    serviceId: '',
    serviceTitle: '',
    customer: '',
    originalDate: '',
    date: '',
    time: ''
  });
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [bookingFilters, setBookingFilters] = useState(emptyFilters);
  const [calendarFilters, setCalendarFilters] = useState(emptyFilters);
  const [editingService, setEditingService] = useState(null);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [serviceForm, setServiceForm] = useState({
    title: '',
    price: '',
    durationMinutes: 60,
    category: 'lavado',
    iconName: 'IconCar',
    tag: '',
    description: '',
    waMsg: '',
    featuresText: ''
  });
  const [unavailableBlockForm, setUnavailableBlockForm] = useState(emptyUnavailableBlock);
  const [dashboardNow] = useState(() => new Date());

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);

      const [bookings, services, users, clientInvites, settings, metrics] = await Promise.all([
        apiFetch('/bookings', { token }),
        apiFetch('/services'),
        apiFetch('/auth/users', { token }),
        apiFetch('/clients', { token }),
        apiFetch('/settings/schedule'),
        apiFetch('/bookings/metrics', { token })
      ]);

      setData({ 
        bookings: Array.isArray(bookings) ? bookings : [], 
        services: Array.isArray(services) ? services : [], 
        users: Array.isArray(users) ? users : [],
        clientInvites: Array.isArray(clientInvites) ? clientInvites : [],
        settings: normalizeClientSettings(settings),
        metrics: metrics || defaultMetrics
      });
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        fetchAllData();
      }
    });

    return () => {
      active = false;
    };
  }, [activeTab, fetchAllData]);

  const closeAlertCard = () => setAlertCard((prev) => ({ ...prev, open: false }));

  const showAlert = ({ type = 'info', title, message }) => {
    setAlertCard({
      open: true,
      type,
      title,
      message,
      confirmLabel: 'Aceptar',
      onConfirm: closeAlertCard
    });
  };

  const showConfirm = ({ title, message, confirmLabel = 'Confirmar', onConfirm }) => {
    setAlertCard({
      open: true,
      type: 'warning',
      title,
      message,
      confirmLabel,
      cancelLabel: 'Cancelar',
      onCancel: closeAlertCard,
      onConfirm: async () => {
        closeAlertCard();
        await onConfirm();
      }
    });
  };

  const updateBookingStatus = async (id, status) => {
    try {
      await apiFetch(`/bookings/${id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ status })
      });
      fetchAllData();
    } catch (err) {
      console.error(err);
      showAlert({ type: 'error', title: 'No se pudo cambiar la reserva', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const updateBookingPaymentStatus = async (id, paymentStatus) => {
    try {
      await apiFetch(`/bookings/${id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ paymentStatus })
      });
      fetchAllData();
      showAlert({ type: 'success', title: 'Pago actualizado', message: 'El estado de pago se guardo correctamente.' });
    } catch (err) {
      console.error(err);
      showAlert({ type: 'error', title: 'No se pudo cambiar el pago', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const handleBookingFilterChange = (event) => {
    const { name, value } = event.target;
    setBookingFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleCalendarFilterChange = (event) => {
    const { name, value } = event.target;
    setCalendarFilters((prev) => ({ ...prev, [name]: value }));
  };

  const openClientProfile = (client) => {
    setSelectedClientId(client._id);
    setClientModalOpen(true);
  };

  const openInviteClient = () => {
    setClientInviteForm(emptyClientInvite);
    setInviteClientModalOpen(true);
  };

  const handleClientInviteChange = (event) => {
    const { name, value } = event.target;
    setClientInviteForm((prev) => ({ ...prev, [name]: value }));
  };

  const openWhatsappInvite = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const saveClientInvite = async (event) => {
    event.preventDefault();

    try {
      const invite = await apiFetch('/clients', {
        method: 'POST',
        token,
        body: JSON.stringify(clientInviteForm)
      });

      setInviteClientModalOpen(false);
      fetchAllData();
      openWhatsappInvite(invite.whatsappUrl || invite.lastWhatsappUrl);
      showAlert({ type: 'success', title: 'Cliente creado', message: 'Se genero el mensaje de WhatsApp para que complete su cuenta.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo crear el cliente', message: err.message || 'Revisa nombre, telefono y direccion.' });
    }
  };

  const resendClientInvite = async (invite) => {
    try {
      const updatedInvite = await apiFetch(`/clients/${invite._id}/resend`, {
        method: 'POST',
        token
      });

      fetchAllData();
      openWhatsappInvite(updatedInvite.whatsappUrl || updatedInvite.lastWhatsappUrl);
      showAlert({ type: 'success', title: 'Invitacion lista', message: 'Se abrio el mensaje actualizado para WhatsApp.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo reenviar', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const openRescheduleBooking = (booking) => {
    if (!booking || !booking.service) return;

    const dateKey = toDateKey(booking.date);
    setRescheduleForm({
      bookingId: booking._id,
      serviceId: booking.service._id || booking.service,
      serviceTitle: booking.service.title || 'Servicio',
      customer: booking.user?.name || booking.customerName || 'Cliente',
      originalDate: dateKey,
      date: dateKey,
      time: booking.time
    });
    setRescheduleSlots([]);
    setRescheduleModalOpen(true);
  };

  const handleRescheduleChange = (event) => {
    const { name, value } = event.target;
    setRescheduleForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'date' ? { time: '' } : {})
    }));
  };

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!rescheduleModalOpen || !rescheduleForm.serviceId || !rescheduleForm.date) {
        setRescheduleSlots([]);
        return;
      }

      setRescheduleSlotsLoading(true);
      try {
        const availability = await apiFetch(`/settings/availability?serviceId=${encodeURIComponent(rescheduleForm.serviceId)}&date=${encodeURIComponent(rescheduleForm.date)}`);
        if (active) {
          let slots = Array.isArray(availability.slots) ? availability.slots.filter((slot) => slot.available) : [];
          const shouldKeepCurrentSlot = rescheduleForm.originalDate === rescheduleForm.date && rescheduleForm.time;
          if (shouldKeepCurrentSlot && !slots.some((slot) => slot.time === rescheduleForm.time)) {
            slots = [{ time: rescheduleForm.time }, ...slots].sort((a, b) => a.time.localeCompare(b.time));
          }
          setRescheduleSlots(slots);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setRescheduleSlots([]);
        }
      } finally {
        if (active) {
          setRescheduleSlotsLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [rescheduleForm.date, rescheduleForm.originalDate, rescheduleForm.serviceId, rescheduleForm.time, rescheduleModalOpen]);

  const saveRescheduleBooking = async (event) => {
    event.preventDefault();

    try {
      await apiFetch(`/bookings/${rescheduleForm.bookingId}/reschedule`, {
        method: 'PUT',
        token,
        body: JSON.stringify({
          date: rescheduleForm.date,
          time: rescheduleForm.time
        })
      });
      setRescheduleModalOpen(false);
      fetchAllData();
      showAlert({ type: 'success', title: 'Reserva reprogramada', message: 'La agenda se actualizo y el horario anterior quedo liberado.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo reprogramar', message: err.message || 'Elige otro horario disponible.' });
    }
  };

  const cancelBookingFromAdmin = (booking) => {
    showConfirm({
      title: 'Cancelar reserva',
      message: `Seguro que quieres cancelar la reserva de ${booking.user?.name || booking.customerName || 'este cliente'}? El horario quedara disponible nuevamente.`,
      confirmLabel: 'Cancelar reserva',
      onConfirm: async () => {
        try {
          await apiFetch(`/bookings/${booking._id}/cancel`, {
            method: 'PUT',
            token
          });
          fetchAllData();
          showAlert({ type: 'success', title: 'Reserva cancelada', message: 'La reserva quedo cancelada y el horario se libero.' });
        } catch (err) {
          showAlert({ type: 'error', title: 'No se pudo cancelar', message: err.message || 'Intenta de nuevo.' });
        }
      }
    });
  };

  const openCreateService = () => {
    setEditingService(null);
    setServiceForm({
      title: '',
      price: '',
      durationMinutes: 60,
      category: 'lavado',
      iconName: 'IconCar',
      tag: '',
      description: '',
      waMsg: '',
      featuresText: ''
    });
    setServiceModalOpen(true);
  };

  const openEditService = (service) => {
    setEditingService(service);
    setServiceForm({
      title: service.title || '',
      price: service.price || '',
      durationMinutes: service.durationMinutes || 60,
      category: service.category || 'lavado',
      iconName: service.iconName || 'IconCar',
      tag: service.tag || '',
      description: service.description || '',
      waMsg: service.waMsg || '',
      featuresText: Array.isArray(service.features) ? service.features.join('\n') : ''
    });
    setServiceModalOpen(true);
  };

  const handleServiceChange = (e) => {
    const { name, value } = e.target;
    setServiceForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveService = async (event) => {
    event.preventDefault();

    const payload = {
      title: serviceForm.title,
      price: serviceForm.price,
      durationMinutes: Number(serviceForm.durationMinutes),
      category: serviceForm.category,
      iconName: serviceForm.iconName,
      tag: serviceForm.tag || null,
      description: serviceForm.description,
      waMsg: serviceForm.waMsg,
      features: serviceForm.featuresText.split('\n').map((item) => item.trim()).filter(Boolean)
    };

    try {
      await apiFetch(editingService ? `/services/${editingService._id}` : '/services', {
        method: editingService ? 'PUT' : 'POST',
        token,
        body: JSON.stringify(payload)
      });
      setServiceModalOpen(false);
      fetchAllData();
      showAlert({ type: 'success', title: 'Servicio guardado', message: 'El catalogo se actualizo correctamente.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo guardar el servicio', message: err.message || 'Revisa los datos e intenta de nuevo.' });
    }
  };

  const deleteService = async (service) => {
    showConfirm({
      title: 'Eliminar servicio',
      message: `Seguro que quieres eliminar ${service.title}? Esta accion no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        try {
          await apiFetch(`/services/${service._id}`, {
            method: 'DELETE',
            token
          });
          fetchAllData();
          showAlert({ type: 'success', title: 'Servicio eliminado', message: `${service.title} se elimino del catalogo.` });
        } catch (err) {
          showAlert({ type: 'error', title: 'No se pudo eliminar el servicio', message: err.message || 'Intenta de nuevo.' });
        }
      }
    });
  };

  const updateScheduleDay = (day, field, value) => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        weeklySchedule: prev.settings.weeklySchedule.map((entry) => (
          entry.day === day ? { ...entry, [field]: value } : entry
        ))
      }
    }));
  };

  const updateSlotInterval = (value) => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        slotIntervalMinutes: Number(value)
      }
    }));
  };

  const updateTransferAccount = (field, value) => {
    setData((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        transferAccount: {
          ...prev.settings.transferAccount,
          [field]: value
        }
      }
    }));
  };

  const handleUnavailableBlockChange = (event) => {
    const { name, value } = event.target;
    setUnavailableBlockForm((prev) => ({ ...prev, [name]: value }));
  };

  const persistScheduleSettings = async (nextSettings, successMessage) => {
    const settings = await apiFetch('/settings/schedule', {
      method: 'PUT',
      token,
      body: JSON.stringify(nextSettings)
    });

    setData((prev) => ({ ...prev, settings: normalizeClientSettings(settings) }));
    showAlert({ type: 'success', title: 'Horario actualizado', message: successMessage });
  };

  const addUnavailableBlock = async () => {
    const { date, start, end, note } = unavailableBlockForm;

    if (!date || !start || !end) {
      showAlert({ type: 'warning', title: 'Descanso incompleto', message: 'Selecciona fecha, hora de inicio y hora de fin.' });
      return;
    }

    if (date < todayDateKey()) {
      showAlert({ type: 'warning', title: 'Fecha invalida', message: 'El descanso debe ser para hoy o una fecha futura.' });
      return;
    }

    if (end <= start) {
      showAlert({ type: 'warning', title: 'Horario invalido', message: 'La hora final debe ser mayor que la hora inicial.' });
      return;
    }

    const nextBlock = {
      date,
      start,
      end,
      note: note.trim() || 'Descanso'
    };

    const nextSettings = {
      ...data.settings,
      unavailableBlocks: [...(data.settings.unavailableBlocks || []), nextBlock]
        .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))
    };

    try {
      await persistScheduleSettings(nextSettings, 'El descanso quedo guardado y ya bloquea ese rango en la agenda.');
      setUnavailableBlockForm(emptyUnavailableBlock());
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo guardar el descanso', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const removeUnavailableBlock = async (index) => {
    const nextSettings = {
      ...data.settings,
      unavailableBlocks: (data.settings.unavailableBlocks || []).filter((_, currentIndex) => currentIndex !== index)
    };

    try {
      await persistScheduleSettings(nextSettings, 'El descanso se quito y ese rango vuelve a depender de la disponibilidad normal.');
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo quitar el descanso', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const saveSchedule = async () => {
    try {
      await persistScheduleSettings(data.settings, 'Tu horario, descansos y datos de transferencia quedaron guardados.');
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo actualizar el horario', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const openManualBooking = () => {
    setManualForm({
      ...emptyManualBooking,
      serviceId: data.services[0]?._id || '',
      date: todayDateKey()
    });
    setManualSlots([]);
    setManualModalOpen(true);
  };

  const handleManualChange = (event) => {
    const { name, value } = event.target;
    setManualForm((prev) => ({
      ...prev,
      [name]: name === 'plate' ? normalizePlate(value) : value,
      ...(name === 'serviceId' || name === 'date' ? { time: '' } : {})
    }));
  };

  useEffect(() => {
    let active = true;

    queueMicrotask(async () => {
      if (!manualModalOpen || !manualForm.serviceId || !manualForm.date) {
        setManualSlots([]);
        return;
      }

      setManualSlotsLoading(true);
      try {
        const availability = await apiFetch(`/settings/availability?serviceId=${encodeURIComponent(manualForm.serviceId)}&date=${encodeURIComponent(manualForm.date)}`);
        if (active) {
          setManualSlots(Array.isArray(availability.slots) ? availability.slots.filter((slot) => slot.available) : []);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setManualSlots([]);
        }
      } finally {
        if (active) {
          setManualSlotsLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [manualForm.date, manualForm.serviceId, manualModalOpen]);

  const saveManualBooking = async (event) => {
    event.preventDefault();
    const normalizedPlate = normalizePlate(manualForm.plate);
    const plateIssues = getPlateIssues(normalizedPlate);

    if (!isValidPlate(normalizedPlate)) {
      showAlert({ type: 'warning', title: 'Placa invalida', message: plateIssues[0] || plateRequirementsText });
      return;
    }

    try {
      await apiFetch('/bookings/admin', {
        method: 'POST',
        token,
        body: JSON.stringify({
          ...manualForm,
          plate: normalizedPlate,
          washMode: manualForm.washMode
        })
      });
      setManualModalOpen(false);
      fetchAllData();
      showAlert({ type: 'success', title: 'Reserva creada', message: 'La cita manual quedo registrada en tu agenda.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo crear la reserva manual', message: err.message || 'Revisa la disponibilidad e intenta de nuevo.' });
    }
  };

  const completeMembershipVisit = async (bookingId, visitId) => {
    try {
      await apiFetch(`/bookings/${bookingId}/membership-visits/${visitId}/complete`, {
        method: 'PUT',
        token
      });
      fetchAllData();
      showAlert({ type: 'success', title: 'Lavado completado', message: 'La visita de membresia quedo marcada como completada.' });
    } catch (err) {
      showAlert({ type: 'error', title: 'No se pudo completar el lavado', message: err.message || 'Intenta de nuevo.' });
    }
  };

  const calendarEvents = useMemo(() => buildCalendarEvents(data.bookings), [data.bookings]);
  const bookingRows = useMemo(() => buildBookingRows(data.bookings), [data.bookings]);
  const filteredBookings = useMemo(() => (
    bookingRows.filter((booking) => matchesFilters(booking, bookingFilters))
  ), [bookingFilters, bookingRows]);
  const filteredCalendarEvents = useMemo(() => (
    calendarEvents.filter((event) => matchesEventFilters(event, calendarFilters))
  ), [calendarEvents, calendarFilters]);
  const upcomingBookingRows = useMemo(() => (
    bookingRows
      .filter((row) => {
        if (!['pending', 'confirmed', 'scheduled'].includes(row.status)) return false;
        const appointmentAt = buildBusinessDateTime(row.date, row.time);
        return appointmentAt && appointmentAt.getTime() >= dashboardNow.getTime();
      })
      .slice(0, 8)
  ), [bookingRows, dashboardNow]);
  const selectedClient = useMemo(() => (
    data.users.find((client) => client._id === selectedClientId) || null
  ), [data.users, selectedClientId]);
  const selectedClientBookings = useMemo(() => (
    data.bookings.filter((booking) => {
      const userId = booking.user?._id || booking.user;
      return userId && String(userId) === String(selectedClientId);
    })
  ), [data.bookings, selectedClientId]);
  const selectedClientRows = useMemo(() => buildBookingRows(selectedClientBookings), [selectedClientBookings]);
  const selectedClientMemberships = useMemo(() => (
    selectedClientBookings.filter((booking) => (
      booking.status !== 'cancelled' &&
      (booking.service?.category === 'membresia' || booking.membershipPlan !== 'none') &&
      (booking.membershipSchedule || []).some((visit) => visit.status === 'scheduled')
    ))
  ), [selectedClientBookings]);
  const monthDays = useMemo(() => getMonthDays(calendarDate), [calendarDate]);
  const todayKey = todayDateKey();
  const selectedMonthLabel = calendarDate.toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  const todayEvents = filteredCalendarEvents.filter((event) => event.dateKey === todayKey);
  const selectedManualService = data.services.find((service) => service._id === manualForm.serviceId);
  const manualSubtotalCents = parsePriceCents(selectedManualService?.price);
  const manualFeeCents = manualForm.paymentMethod === 'card' ? calculateCardFee(manualSubtotalCents) : 0;
  const manualTotalCents = manualSubtotalCents + manualFeeCents;

  const moveCalendarMonth = (amount) => {
    setCalendarDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#05070a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#D4AF37', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.5rem' }}>Accediendo a la consola maestra...</p>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(212,175,55,0.1)', borderTopColor: '#D4AF37', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '20px auto' }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <div className="admin-shell" style={{ minHeight: '100vh', background: '#05070a', color: '#e5e7eb', display: 'flex' }}>
      <AlertCard
        open={alertCard.open}
        type={alertCard.type}
        title={alertCard.title}
        message={alertCard.message}
        confirmLabel={alertCard.confirmLabel}
        cancelLabel={alertCard.cancelLabel}
        onConfirm={alertCard.onConfirm}
        onCancel={alertCard.onCancel}
        onClose={closeAlertCard}
      />
      <Modal
        open={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title={editingService ? 'Editar Servicio' : 'Crear Servicio'}
      >
        <form onSubmit={saveService} style={{ display: 'grid', gap: '1rem' }}>
          <InputField
            label="Nombre"
            name="title"
            value={serviceForm.title}
            onChange={handleServiceChange}
            placeholder="Lavado completo"
            required
          />
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <InputField
              label="Precio"
              name="price"
              value={serviceForm.price}
              onChange={handleServiceChange}
              placeholder="Q60"
              required
            />
            <InputField
              label="Duracion min"
              name="durationMinutes"
              type="number"
              value={serviceForm.durationMinutes}
              onChange={handleServiceChange}
              placeholder="60"
              required
            />
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Categoria
              </label>
              <select name="category" value={serviceForm.category} onChange={handleServiceChange} style={inputStyle}>
                <option value="lavado">Lavado</option>
                <option value="promo">Promo</option>
                <option value="membresia">Membresia</option>
                <option value="extra">Extra</option>
              </select>
            </div>
          </div>
          <InputField
            label="Etiqueta"
            name="tag"
            value={serviceForm.tag}
            onChange={handleServiceChange}
            placeholder="Mas popular"
          />
          <InputField
            label="Icono"
            name="iconName"
            value={serviceForm.iconName}
            onChange={handleServiceChange}
            placeholder="IconCar"
          />
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Descripcion
            </label>
            <textarea
              name="description"
              rows="3"
              value={serviceForm.description}
              onChange={handleServiceChange}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Beneficios
            </label>
            <textarea
              name="featuresText"
              rows="4"
              value={serviceForm.featuresText}
              onChange={handleServiceChange}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <InputField
            label="Mensaje WhatsApp"
            name="waMsg"
            value={serviceForm.waMsg}
            onChange={handleServiceChange}
            placeholder="Hola! Quiero informacion..."
            required
          />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => setServiceModalOpen(false)} style={ghostBtn}>Cancelar</button>
            <button type="submit" style={goldBtn}>Guardar</button>
          </div>
        </form>
      </Modal>
      <Modal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        title="Agendar desde Admin"
      >
        <form onSubmit={saveManualBooking} style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <InputField label="Cliente" name="customerName" value={manualForm.customerName} onChange={handleManualChange} placeholder="Nombre del cliente" required />
            <InputField label="Telefono" name="customerPhone" value={manualForm.customerPhone} onChange={handleManualChange} placeholder="WhatsApp" required />
          </div>
          <InputField label="Direccion" name="customerAddress" value={manualForm.customerAddress} onChange={handleManualChange} placeholder="Casa, colonia, zona o referencia" />
          <InputField label="Correo opcional" name="customerEmail" type="email" value={manualForm.customerEmail} onChange={handleManualChange} placeholder="cliente@correo.com" />
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Servicio</label>
              <select name="serviceId" value={manualForm.serviceId} onChange={handleManualChange} style={inputStyle} required>
                <option value="">Selecciona</option>
                {data.services.map((service) => (
                  <option key={service._id} value={service._id}>{service.title} · {service.price}</option>
                ))}
              </select>
            </div>
            <div>
              <InputField
                label="Placa"
                name="plate"
                value={manualForm.plate}
                onChange={handleManualChange}
                placeholder="P123ASD"
                required
                maxLength={7}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                pattern="[Pp][0-9]{3}[A-Za-z]{3}"
              />
              <p style={{ color: isValidPlate(manualForm.plate) ? '#25D366' : '#718096', fontSize: '0.75rem', margin: '6px 0 0', lineHeight: 1.45 }}>
                {manualForm.plate && isValidPlate(manualForm.plate) ? 'Placa valida.' : plateRequirementsText}
              </p>
            </div>
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <InputField label="Fecha" name="date" type="date" value={manualForm.date} onChange={handleManualChange} required />
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Hora</label>
              <select name="time" value={manualForm.time} onChange={handleManualChange} style={inputStyle} required disabled={manualSlotsLoading || manualSlots.length === 0}>
                <option value="">{manualSlotsLoading ? 'Cargando...' : 'Selecciona'}</option>
                {manualSlots.map((slot) => (
                  <option key={slot.time} value={slot.time}>{slot.time}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Modo de lavado</label>
            <select name="washMode" value={manualForm.washMode} onChange={handleManualChange} style={inputStyle} required>
              {washModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label} - {option.detail}</option>
              ))}
            </select>
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Metodo de pago</label>
              <select name="paymentMethod" value={manualForm.paymentMethod} onChange={handleManualChange} style={inputStyle}>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta (+4.5% + Q2)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Estado pago</label>
              <select name="paymentStatus" value={manualForm.paymentStatus} onChange={handleManualChange} style={inputStyle}>
                <option value="unpaid">Por cobrar</option>
                <option value="paid">Pagado</option>
              </select>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem', display: 'grid', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}><span>Subtotal</span><span>{formatCurrency(manualSubtotalCents)}</span></div>
            {manualForm.paymentMethod === 'card' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D4AF37' }}><span>Comision tarjeta</span><span>{formatCurrency(manualFeeCents)}</span></div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontWeight: 900, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}><span>Total a cobrar</span><span>{formatCurrency(manualTotalCents)}</span></div>
          </div>
          <div>
            <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Notas internas</label>
            <textarea name="internalNotes" rows="3" value={manualForm.internalNotes} onChange={handleManualChange} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setManualModalOpen(false)} style={ghostBtn}>Cancelar</button>
            <button type="submit" style={goldBtn}>Crear reserva</button>
          </div>
        </form>
      </Modal>
      <Modal
        open={rescheduleModalOpen}
        onClose={() => setRescheduleModalOpen(false)}
        title="Reprogramar reserva"
      >
        <form onSubmit={saveRescheduleBooking} style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem' }}>
            <p style={{ margin: 0, color: '#D4AF37', fontWeight: 900 }}>{rescheduleForm.customer}</p>
            <p style={{ margin: '4px 0 0', color: '#a0aec0', fontSize: '0.9rem' }}>{rescheduleForm.serviceTitle}</p>
          </div>
          <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <InputField label="Nueva fecha" name="date" type="date" value={rescheduleForm.date} onChange={handleRescheduleChange} required />
            <div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Nueva hora</label>
              <select
                name="time"
                value={rescheduleForm.time}
                onChange={handleRescheduleChange}
                style={inputStyle}
                required
                disabled={rescheduleSlotsLoading || rescheduleSlots.length === 0}
              >
                <option value="">{rescheduleSlotsLoading ? 'Cargando...' : 'Selecciona'}</option>
                {rescheduleSlots.map((slot) => (
                  <option key={slot.time} value={slot.time}>{slot.time}</option>
                ))}
              </select>
            </div>
          </div>
          <p style={{ margin: 0, color: '#718096', fontSize: '0.85rem', lineHeight: 1.6 }}>
            Si es una membresia sin lavados completados, tambien se recalculara su cronograma de lavados.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setRescheduleModalOpen(false)} style={ghostBtn}>Cerrar</button>
            <button type="submit" style={goldBtn}>Guardar cambio</button>
          </div>
        </form>
      </Modal>
      <Modal
        open={inviteClientModalOpen}
        onClose={() => setInviteClientModalOpen(false)}
        title="Crear cliente"
      >
        <form onSubmit={saveClientInvite} style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.16)', borderRadius: '14px', padding: '1rem' }}>
            <p style={{ margin: 0, color: '#D4AF37', fontWeight: 900 }}>Invitacion por WhatsApp</p>
            <p style={{ margin: '4px 0 0', color: '#a0aec0', fontSize: '0.86rem', lineHeight: 1.5 }}>
              Guardas nombre, telefono y direccion; luego se abre el mensaje para que el cliente cree su cuenta con correo y contrasena.
            </p>
          </div>
          <InputField label="Nombre del cliente" name="name" value={clientInviteForm.name} onChange={handleClientInviteChange} placeholder="Nombre completo" required />
          <InputField label="WhatsApp" name="phone" value={clientInviteForm.phone} onChange={handleClientInviteChange} placeholder="Ej: 5555 5555" required />
          <InputField label="Direccion" name="address" value={clientInviteForm.address} onChange={handleClientInviteChange} placeholder="Casa, colonia, zona o referencia" required maxLength={220} />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setInviteClientModalOpen(false)} style={ghostBtn}>Cancelar</button>
            <button type="submit" style={goldBtn}>Crear y enviar</button>
          </div>
        </form>
      </Modal>
      <Modal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        title={selectedClient ? `Cliente: ${selectedClient.name}` : 'Cliente'}
      >
        {selectedClient && (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1rem' }}>
                <p style={{ margin: 0, color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase' }}>Contacto</p>
                <p style={{ margin: '6px 0 0', color: '#fff', fontWeight: 800 }}>{selectedClient.email}</p>
                <p style={{ margin: '4px 0 0', color: '#a0aec0', fontSize: '0.82rem' }}>{selectedClient.phone || 'Sin telefono'}</p>
                <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.78rem' }}>{selectedClient.address || 'Sin direccion'}</p>
              </div>
              <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.14)', borderRadius: '14px', padding: '1rem' }}>
                <p style={{ margin: 0, color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase' }}>Puntos</p>
                <p style={{ margin: '6px 0 0', color: '#D4AF37', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}><IconStar /> {selectedClient.loyalty_points || 0}</p>
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.75rem', color: '#fff', fontSize: '1rem' }}>Membresia activa</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {selectedClientMemberships.map((booking) => (
                  <div key={`client-membership-${booking._id}`} style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.14)', borderRadius: '14px', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: '#D4AF37' }}>{getBookingTitle(booking)}</strong>
                      <span style={{ color: '#a0aec0', fontSize: '0.82rem' }}>Placas {getVehicleLabel(booking)}</span>
                    </div>
                    <p style={{ margin: '8px 0 0', color: '#718096', fontSize: '0.8rem' }}>{getWashModeLabel(booking.washMode)}</p>
                    {(booking.customMembership?.serviceBreakdown || []).length > 0 && (
                      <p style={{ margin: '6px 0 0', color: '#25D366', fontSize: '0.78rem' }}>
                        {booking.customMembership.serviceBreakdown.map((item) => `${item.title} (${item.carWashes})`).join(' · ')}
                      </p>
                    )}
                    <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                      {(booking.membershipSchedule || []).filter((visit) => visit.status === 'scheduled').map((visit) => (
                        <div key={visit._id || `${booking._id}-${visit.date}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#a0aec0', fontSize: '0.84rem' }}>
                          <span>{visit.title}</span>
                          <span>{formatDate(visit.date)} · {visit.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {selectedClientMemberships.length === 0 && (
                  <p style={{ margin: 0, color: '#718096' }}>Este cliente no tiene una membresia activa.</p>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.75rem', color: '#fff', fontSize: '1rem' }}>Historial y proximos servicios</h3>
              <div style={{ display: 'grid', gap: '8px', maxHeight: '320px', overflowY: 'auto', paddingRight: '4px' }}>
                {[...selectedClientRows].reverse().map((row) => (
                  <div key={`client-row-${row._id}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <div>
                      <p style={{ margin: 0, color: row.isMembershipVisit ? '#D4AF37' : '#fff', fontWeight: 800, fontSize: '0.88rem' }}>{row.isMembershipVisit ? row.service?.title : getBookingTitle(row)}</p>
                      <p style={{ margin: '3px 0 0', color: '#718096', fontSize: '0.78rem' }}>{formatDate(row.date)} · {row.time} · {row.plate}</p>
                      <p style={{ margin: '3px 0 0', color: '#718096', fontSize: '0.74rem' }}>{getWashModeLabel(row.washMode)}</p>
                    </div>
                    <span style={{ color: row.status === 'completed' ? '#25D366' : '#a0aec0', fontSize: '0.75rem', fontWeight: 800 }}>{row.status}</span>
                  </div>
                ))}
                {selectedClientRows.length === 0 && (
                  <p style={{ margin: 0, color: '#718096' }}>Aun no tiene reservas registradas.</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setClientModalOpen(false)} style={ghostBtn}>Cerrar</button>
            </div>
          </div>
        )}
      </Modal>
      
      {/* Sidebar - Fixed */}
      <div className="admin-sidebar" style={{ width: '280px', background: '#0a0d14', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '2.5rem 1.5rem', position: 'fixed', height: '100vh', zIndex: 10 }}>
        <div style={{ marginBottom: '3rem', paddingLeft: '0.5rem', cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.75rem', color: '#D4AF37', margin: 0, fontWeight: 700 }}>Master Panel</h1>
          <p style={{ fontSize: '0.7rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.2em', marginTop: '4px' }}>El Condado CarWash</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[
            { id: 'calendar', label: 'Calendario', icon: <IconCalendar /> },
            { id: 'bookings', label: 'Reservas', icon: <IconCar /> },
            { id: 'services', label: 'Servicios', icon: <IconDroplet /> },
            { id: 'schedule', label: 'Horario', icon: <IconCalendar /> },
            { id: 'users', label: 'Clientes', icon: <IconShield /> },
            { id: 'payments', label: 'Pagos / Ingresos', icon: <IconTool /> },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
                background: activeTab === tab.id ? 'linear-gradient(90deg, rgba(212,175,55,0.15), transparent)' : 'transparent',
                border: 'none', borderRadius: '14px', color: activeTab === tab.id ? '#D4AF37' : '#718096',
                cursor: 'pointer', textAlign: 'left', fontWeight: 600, fontSize: '0.95rem',
                transition: 'all 0.3s ease'
              }}
            >
              <span style={{ display: 'flex', opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="admin-logout" style={{ marginTop: 'auto', position: 'absolute', bottom: '2rem', width: 'calc(100% - 3rem)' }}>
          <button onClick={logout} style={{ ...ghostBtn, width: '100%', borderRadius: '12px', borderColor: 'rgba(248, 113, 113, 0.2)', color: '#f87171' }}>
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="admin-main" style={{ flex: 1, padding: '3rem 4rem', marginLeft: '280px' }}>

        {activeTab === 'calendar' && (
          <div>
            <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif", textTransform: 'capitalize' }}>
                  Calendario de Reservas
                </h2>
                <p style={{ color: '#718096', marginTop: '0.5rem' }}>Reservas normales y lavados programados por membresia en una sola vista.</p>
              </div>
              <div className="admin-page-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button type="button" onClick={openManualBooking} style={{ ...goldBtn, padding: '10px 16px' }}>Agendar</button>
                <button type="button" onClick={() => moveCalendarMonth(-1)} style={{ ...ghostBtn, padding: '10px 14px' }}>Anterior</button>
                <div className="glass-panel" style={{ padding: '10px 18px', borderRadius: '12px', minWidth: '180px', textAlign: 'center', color: '#D4AF37', fontWeight: 800, textTransform: 'capitalize' }}>
                  {selectedMonthLabel}
                </div>
                <button type="button" onClick={() => moveCalendarMonth(1)} style={{ ...ghostBtn, padding: '10px 14px' }}>Siguiente</button>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', borderRadius: '20px', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem' }}>Proximas reservas</h3>
                  <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.85rem' }}>Incluye lavados programados de membresia.</p>
                </div>
                <span style={{ color: '#D4AF37', fontWeight: 900 }}>{upcomingBookingRows.length} en agenda</span>
              </div>
              <div className="admin-upcoming-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {upcomingBookingRows.map((row) => (
                  <div key={`next-${row._id}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '12px' }}>
                    <p style={{ margin: 0, color: row.isMembershipVisit ? '#D4AF37' : '#fff', fontWeight: 900, fontSize: '0.86rem' }}>{row.isMembershipVisit ? row.service?.title : getBookingTitle(row)}</p>
                    <p style={{ margin: '5px 0 0', color: '#a0aec0', fontSize: '0.8rem' }}>{formatDate(row.date)} · {row.time}</p>
                    <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.78rem' }}>{row.user?.name || row.customerName || 'Cliente manual'} · {row.plate}</p>
                    <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.74rem' }}>{getWashModeLabel(row.washMode)}</p>
                  </div>
                ))}
                {upcomingBookingRows.length === 0 && (
                  <p style={{ color: '#718096', margin: 0 }}>No hay proximas reservas.</p>
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1rem', borderRadius: '18px', marginBottom: '1.5rem' }}>
              <div className="admin-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: '12px' }}>
                <select name="serviceId" value={calendarFilters.serviceId} onChange={handleCalendarFilterChange} style={inputStyle}>
                  <option value="all">Todos los servicios</option>
                  {data.services.map((service) => (
                    <option key={service._id} value={service._id}>{service.title}</option>
                  ))}
                </select>
                <select name="status" value={calendarFilters.status} onChange={handleCalendarFilterChange} style={inputStyle}>
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="scheduled">Lavado programado</option>
                  <option value="confirmed">Confirmada</option>
                  <option value="completed">Completada</option>
                  <option value="scheduled">Membresia programada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
                <select name="paymentStatus" value={calendarFilters.paymentStatus} onChange={handleCalendarFilterChange} style={inputStyle}>
                  <option value="all">Todos los pagos</option>
                  <option value="unpaid">Por cobrar</option>
                  <option value="paid">Pagado</option>
                  <option value="failed">Fallido</option>
                </select>
                <select name="type" value={calendarFilters.type} onChange={handleCalendarFilterChange} style={inputStyle}>
                  <option value="all">Todo tipo</option>
                  <option value="reserva">Reservas</option>
                  <option value="membresia">Membresias</option>
                </select>
              </div>
            </div>

            <div className="admin-calendar-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
              <div className="glass-panel" style={{ borderRadius: '24px', padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', marginBottom: '8px' }}>
                  {shortDayLabels.map((day) => (
                    <div key={day} style={{ color: '#718096', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center', padding: '0.5rem' }}>
                      {day}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '8px' }}>
                  {monthDays.map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} style={{ minHeight: '128px' }} />;
                    }

                    const key = toDateKey(day);
                    const events = filteredCalendarEvents.filter((event) => event.dateKey === key);

                    return (
                      <div
                        key={key}
                        style={{
                          minHeight: '128px',
                          borderRadius: '14px',
                          padding: '10px',
                          background: key === todayKey ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                          border: key === todayKey ? '1px solid rgba(212,175,55,0.35)' : '1px solid rgba(255,255,255,0.05)',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ color: '#fff', fontWeight: 800 }}>{day.getDate()}</span>
                          {events.length > 0 && (
                            <span style={{ color: '#D4AF37', fontSize: '0.7rem', fontWeight: 900 }}>{events.length}</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gap: '6px' }}>
                          {events.slice(0, 3).map((event) => (
                            <div key={event.id} style={{ background: event.type === 'membresia' ? 'rgba(212,175,55,0.12)' : 'rgba(37,211,102,0.08)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '6px', overflow: 'hidden' }}>
                              <p style={{ margin: 0, color: '#fff', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.time} {event.customer}</p>
                              <p style={{ margin: 0, color: '#718096', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</p>
                            </div>
                          ))}
                          {events.length > 3 && (
                            <p style={{ color: '#718096', fontSize: '0.68rem', margin: 0 }}>+{events.length - 3} mas</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '24px' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Agenda de Hoy</h3>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {todayEvents.length > 0 ? todayEvents.map((event) => {
                      const linkedBooking = data.bookings.find((booking) => booking._id === event.bookingId);

                      return (
                      <div key={event.id} style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p style={{ margin: 0, color: '#D4AF37', fontWeight: 900 }}>{event.time} · {event.customer}</p>
                        <p style={{ margin: '4px 0', color: '#fff', fontWeight: 700 }}>{event.title}</p>
                        <p style={{ margin: 0, color: '#718096', fontSize: '0.8rem' }}>Placa {event.plate} · {paymentLabel(event)}</p>
                        {linkedBooking && !event.visitId && isActiveBooking(linkedBooking) && (
                          <button
                            type="button"
                            onClick={() => openRescheduleBooking(linkedBooking)}
                            style={{ ...ghostBtn, marginTop: '10px', padding: '7px 10px', fontSize: '0.72rem' }}
                          >
                            Reprogramar
                          </button>
                        )}
                        {event.type === 'membresia' && event.visitId && event.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => completeMembershipVisit(event.bookingId, event.visitId)}
                            style={{ ...ghostBtn, marginTop: '10px', padding: '7px 10px', fontSize: '0.72rem', color: '#25D366', borderColor: 'rgba(37,211,102,0.25)' }}
                          >
                            Completar lavado
                          </button>
                        )}
                      </div>
                      );
                    }) : (
                      <p style={{ color: '#718096', margin: 0 }}>No hay trabajos para hoy.</p>
                    )}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '1.75rem', borderRadius: '24px' }}>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Proximos 7 dias</h3>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {filteredCalendarEvents
                      .filter((event) => {
                        const today = new Date(`${todayKey}T00:00:00`);
                        const limit = new Date(today);
                        limit.setDate(limit.getDate() + 7);
                        const limitKey = toDateKey(limit);
                        return event.dateKey >= todayKey && event.dateKey <= limitKey;
                      })
                      .slice(0, 8)
                      .map((event) => (
                        <div key={`upcoming-${event.id}`} style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: '10px', alignItems: 'center' }}>
                          <span style={{ color: '#718096', fontSize: '0.75rem' }}>{formatDate(event.dateKey)}</span>
                          <span style={{ color: '#e5e7eb', fontSize: '0.85rem' }}>{event.time} · {event.customer}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'bookings' && (
          <div>
            <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Gestión de Reservas</h2>
                <p style={{ color: '#718096', marginTop: '0.5rem' }}>Visualiza y confirma las citas de tus clientes.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                 <button type="button" onClick={openManualBooking} style={{ ...goldBtn, padding: '12px 18px' }}>+ Agendar por WhatsApp</button>
                 <div className="glass-panel" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.7rem', color: '#718096', textTransform: 'uppercase', margin: 0 }}>Pendientes</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D4AF37', margin: 0 }}>{data.bookings.filter(b => b.status === 'pending').length}</p>
                 </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1rem', borderRadius: '18px', marginBottom: '1.5rem' }}>
              <div className="admin-filters-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: '12px' }}>
                <select name="serviceId" value={bookingFilters.serviceId} onChange={handleBookingFilterChange} style={inputStyle}>
                  <option value="all">Todos los servicios</option>
                  {data.services.map((service) => (
                    <option key={service._id} value={service._id}>{service.title}</option>
                  ))}
                </select>
                <select name="status" value={bookingFilters.status} onChange={handleBookingFilterChange} style={inputStyle}>
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="confirmed">Confirmada</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
                <select name="paymentStatus" value={bookingFilters.paymentStatus} onChange={handleBookingFilterChange} style={inputStyle}>
                  <option value="all">Todos los pagos</option>
                  <option value="unpaid">Por cobrar</option>
                  <option value="paid">Pagado</option>
                  <option value="failed">Fallido</option>
                </select>
                <select name="type" value={bookingFilters.type} onChange={handleBookingFilterChange} style={inputStyle}>
                  <option value="all">Todo tipo</option>
                  <option value="reserva">Reservas</option>
                  <option value="membresia">Membresias</option>
                </select>
              </div>
            </div>

            <div className="glass-panel" style={{ borderRadius: '24px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '1.5rem 1rem' }}>Cliente</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Servicio</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Vehículo</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Programación</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Estado Pago</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map(b => (
                    <tr key={b._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{b.user?.name || b.customerName || 'Cliente manual'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#4a5568' }}>{b.user?.email || b.customerPhone || b.customerEmail || '---'}</div>
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ color: '#D4AF37', fontWeight: 600 }}>{b.isMembershipVisit ? b.service?.title : getBookingTitle(b)}</div>
                        <div style={{ fontSize: '0.72rem', color: b.pointsAwarded ? '#25D366' : '#a0aec0' }}>
                          {b.isMembershipVisit
                            ? 'Lavado incluido en membresia'
                            : !b.user
                            ? 'Sin cuenta de cliente'
                            : b.pointsAwarded
                            ? `+${b.loyaltyPointsAwarded || calculateBookingPoints(b)} pts entregados`
                            : `${calculateBookingPoints(b)} pts al completar`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#718096' }}>{formatCurrency(b.totalCents || parsePriceCents(b.service?.price))} · {paymentMethodLabel(b.paymentMethod)}</div>
                        {b.loyaltyRedemption?.discountCents > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#25D366' }}>
                            Canjeo {b.loyaltyRedemption.points} pts por -{formatCurrency(b.loyaltyRedemption.discountCents)}
                          </div>
                        )}
                        <div style={{ fontSize: '0.74rem', color: '#718096' }}>{getWashModeLabel(b.washMode)}</div>
                        {b.customMembership?.washCount > 0 && !b.isMembershipVisit && (
                          <div style={{ fontSize: '0.74rem', color: '#25D366' }}>
                            {b.customMembership.washCount} lavados - {b.customMembership.carCount} carro(s)
                          </div>
                        )}
                        {(b.customMembership?.serviceBreakdown || []).length > 0 && !b.isMembershipVisit && (
                          <div style={{ fontSize: '0.72rem', color: '#718096' }}>
                            {b.customMembership.serviceBreakdown.map((item) => `${item.title} (${item.carWashes})`).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <span style={{ background: '#1a202c', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace', fontWeight: 700 }}>{getVehicleLabel(b)}</span>
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{formatDisplayDate(b.date)}</div>
                        <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{b.time}</div>
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ display: 'grid', gap: '8px', minWidth: '170px' }}>
                          <span style={{
                            width: 'fit-content',
                            fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase',
                            padding: '4px 10px', borderRadius: '20px',
                            ...paymentBadgeStyle(b)
                          }}>
                            {paymentLabel(b)}
                          </span>
                          <select
                            onChange={(e) => updateBookingPaymentStatus(b.bookingId || b._id, e.target.value)}
                            value={b.paymentStatus}
                            style={{
                              background: '#0a0d14',
                              color: '#fff',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              fontSize: '0.8rem',
                              outline: 'none'
                            }}
                          >
                            <option value="unpaid">Por cobrar</option>
                            <option value="paid">Pagado</option>
                            <option value="failed">Fallido</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ display: 'grid', gap: '8px', minWidth: '150px' }}>
                          <select 
                            onChange={(e) => updateBookingStatus(b.bookingId || b._id, e.target.value)}
                            value={b.status}
                            style={{ 
                              background: '#0a0d14', color: '#fff', border: '1px solid rgba(212,175,55,0.3)', 
                              borderRadius: '8px', padding: '6px 10px', fontSize: '0.8rem', outline: 'none',
                              display: b.isMembershipVisit ? 'none' : 'block'
                            }}
                          >
                            <option value="pending">Pendiente</option>
                            <option value="scheduled">Programado</option>
                            <option value="confirmed">Confirmar</option>
                            <option value="completed">Completado</option>
                            <option value="cancelled">Cancelar</option>
                          </select>
                          {b.isMembershipVisit && (
                            <div style={{ display: 'grid', gap: '8px' }}>
                              <span style={{ color: b.status === 'completed' ? '#25D366' : '#D4AF37', fontSize: '0.76rem', fontWeight: 900 }}>
                                {b.status === 'completed' ? 'Lavado completado' : 'Lavado programado'}
                              </span>
                              {b.status === 'scheduled' && (
                                <button type="button" onClick={() => completeMembershipVisit(b.bookingId, b.visitId)} style={{ ...ghostBtn, padding: '6px 9px', fontSize: '0.72rem' }}>
                                  Completar lavado
                                </button>
                              )}
                            </div>
                          )}
                          {!b.isMembershipVisit && isActiveBooking(b) && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => openRescheduleBooking(b.booking || b)} style={{ ...ghostBtn, padding: '6px 9px', fontSize: '0.72rem' }}>
                                Reprogramar
                              </button>
                              <button type="button" onClick={() => cancelBookingFromAdmin(b.booking || b)} style={{ ...ghostBtn, padding: '6px 9px', fontSize: '0.72rem', color: '#f87171', borderColor: 'rgba(248,113,113,0.25)' }}>
                                Cancelar
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredBookings.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ padding: '3rem', textAlign: 'center', color: '#4a5568' }}>No hay reservas con esos filtros.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div>
            <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Horario Operativo</h2>
                <p style={{ color: '#718096', marginTop: '0.5rem' }}>Define dias, horas de trabajo e intervalo de turnos.</p>
              </div>
              <button type="button" onClick={saveSchedule} style={{ ...goldBtn, padding: '12px 24px' }}>Guardar Horario</button>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', marginBottom: '2rem' }}>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                Intervalo entre opciones
              </label>
              <select
                value={data.settings.slotIntervalMinutes}
                onChange={(e) => updateSlotInterval(e.target.value)}
                style={{ ...inputStyle, maxWidth: '220px' }}
              >
                <option value="15">15 minutos</option>
                <option value="30">30 minutos</option>
                <option value="45">45 minutos</option>
                <option value="60">60 minutos</option>
              </select>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', marginBottom: '2rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Descansos y compromisos</h3>
                <p style={{ color: '#718096', margin: '6px 0 0', fontSize: '0.9rem' }}>
                  Bloquea solo un rango de horas en una fecha especifica sin cerrar todo el dia.
                </p>
              </div>

              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <InputField
                  label="Fecha"
                  name="date"
                  type="date"
                  min={todayDateKey()}
                  value={unavailableBlockForm.date}
                  onChange={handleUnavailableBlockChange}
                />
                <InputField
                  label="Motivo"
                  name="note"
                  value={unavailableBlockForm.note}
                  onChange={handleUnavailableBlockChange}
                  placeholder="Compromiso, almuerzo, mandado..."
                />
                <InputField
                  label="Inicio"
                  name="start"
                  type="time"
                  value={unavailableBlockForm.start}
                  onChange={handleUnavailableBlockChange}
                />
                <InputField
                  label="Fin"
                  name="end"
                  type="time"
                  value={unavailableBlockForm.end}
                  onChange={handleUnavailableBlockChange}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
                <button type="button" onClick={addUnavailableBlock} style={{ ...ghostBtn, padding: '10px 14px' }}>
                  Agregar descanso
                </button>
              </div>

              <div style={{ display: 'grid', gap: '10px' }}>
                {(data.settings.unavailableBlocks || []).map((block, index) => (
                  <div
                    key={block._id || `${block.date}-${block.start}-${block.end}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, color: '#fff', fontWeight: 800 }}>{block.note || 'Descanso'}</p>
                      <p style={{ margin: '4px 0 0', color: '#718096', fontSize: '0.85rem' }}>
                        {formatDate(block.date, { weekday: undefined })} · {block.start} - {block.end}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeUnavailableBlock(index)} style={{ ...ghostBtn, padding: '7px 10px', fontSize: '0.75rem' }}>
                      Quitar
                    </button>
                  </div>
                ))}
                {(data.settings.unavailableBlocks || []).length === 0 && (
                  <p style={{ margin: 0, color: '#718096', fontSize: '0.9rem' }}>
                    No tienes descansos registrados.
                  </p>
                )}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', marginBottom: '2rem' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Cuenta para transferencias</h3>
                <p style={{ color: '#718096', margin: '6px 0 0', fontSize: '0.9rem' }}>
                  Estos datos se muestran al cliente solo cuando elige pagar por transferencia.
                </p>
              </div>
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <InputField
                  label="Banco"
                  value={data.settings.transferAccount.bankName}
                  onChange={(event) => updateTransferAccount('bankName', event.target.value)}
                  placeholder="Banco"
                />
                <InputField
                  label="Nombre de cuenta"
                  value={data.settings.transferAccount.accountName}
                  onChange={(event) => updateTransferAccount('accountName', event.target.value)}
                  placeholder="El Condado CarWash"
                />
                <InputField
                  label="Numero de cuenta"
                  value={data.settings.transferAccount.accountNumber}
                  onChange={(event) => updateTransferAccount('accountNumber', event.target.value)}
                  placeholder="0000000000"
                />
                <InputField
                  label="Tipo de cuenta"
                  value={data.settings.transferAccount.accountType}
                  onChange={(event) => updateTransferAccount('accountType', event.target.value)}
                  placeholder="Monetaria / Ahorro"
                />
              </div>
              <label style={{ display: 'block', color: '#a0aec0', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>
                Instrucciones para el cliente
              </label>
              <textarea
                rows="3"
                value={data.settings.transferAccount.instructions}
                onChange={(event) => updateTransferAccount('instructions', event.target.value)}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div className="glass-panel" style={{ borderRadius: '24px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left' }}>Dia</th>
                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left' }}>Abierto</th>
                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left' }}>Inicio</th>
                    <th style={{ padding: '1.25rem 1rem', textAlign: 'left' }}>Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {data.settings.weeklySchedule.map((entry) => (
                    <tr key={entry.day} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '1rem', fontWeight: 700 }}>{dayLabels[entry.day]}</td>
                      <td style={{ padding: '1rem' }}>
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={(e) => updateScheduleDay(entry.day, 'enabled', e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <input
                          type="time"
                          value={entry.start}
                          onChange={(e) => updateScheduleDay(entry.day, 'start', e.target.value)}
                          disabled={!entry.enabled}
                          style={{ ...inputStyle, maxWidth: '160px', opacity: entry.enabled ? 1 : 0.5 }}
                        />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <input
                          type="time"
                          value={entry.end}
                          onChange={(e) => updateScheduleDay(entry.day, 'end', e.target.value)}
                          disabled={!entry.enabled}
                          style={{ ...inputStyle, maxWidth: '160px', opacity: entry.enabled ? 1 : 0.5 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Listado de Clientes</h2>
                <p style={{ color: '#718096', marginTop: '0.5rem' }}>Clientes con cuenta y enlaces pendientes para crear acceso.</p>
              </div>
              <button type="button" onClick={openInviteClient} style={{ ...goldBtn, padding: '12px 18px' }}>+ Crear cliente</button>
            </div>
            <div className="glass-panel" style={{ borderRadius: '24px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '1.5rem 1rem' }}>Nombre</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Contacto</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Direccion</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Puntos Fidelidad</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Rol</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Registro</th>
                    <th style={{ padding: '1.5rem 1rem' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map(u => (
                    <tr key={u._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '1.5rem 1rem', fontWeight: 700 }}>{u.name}</td>
                      <td style={{ padding: '1.5rem 1rem', color: '#a0aec0' }}>
                        <div>{u.email}</div>
                        <div style={{ color: '#718096', fontSize: '0.8rem' }}>{u.phone || 'Sin telefono'}</div>
                      </td>
                      <td style={{ padding: '1.5rem 1rem', color: '#718096', maxWidth: '220px' }}>{u.address || 'Sin direccion'}</td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#D4AF37', fontWeight: 800 }}>
                          <IconStar /> {u.loyalty_points}
                        </div>
                      </td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', background: u.role === 'admin' ? '#D4AF37' : '#1a202c', color: u.role === 'admin' ? '#0a0d14' : '#fff' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '1.5rem 1rem', color: '#718096' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '1.5rem 1rem' }}>
                        <button type="button" onClick={() => openClientProfile(u)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: '0.78rem' }}>
                          Ver historial
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data.users.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#4a5568' }}>No hay clientes registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="glass-panel" style={{ borderRadius: '24px', overflowX: 'auto', marginTop: '2rem' }}>
              <div style={{ padding: '1.5rem 1.5rem 0' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.15rem' }}>Invitaciones por WhatsApp</h3>
                <p style={{ color: '#718096', margin: '4px 0 1rem', fontSize: '0.9rem' }}>Clientes creados desde admin que aun pueden completar su cuenta.</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '760px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '1.25rem 1rem' }}>Cliente</th>
                    <th style={{ padding: '1.25rem 1rem' }}>Telefono</th>
                    <th style={{ padding: '1.25rem 1rem' }}>Direccion</th>
                    <th style={{ padding: '1.25rem 1rem' }}>Estado</th>
                    <th style={{ padding: '1.25rem 1rem' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientInvites.map((invite) => (
                    <tr key={invite._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '1.25rem 1rem', fontWeight: 800, color: '#fff' }}>{invite.name}</td>
                      <td style={{ padding: '1.25rem 1rem', color: '#a0aec0' }}>{invite.phone}</td>
                      <td style={{ padding: '1.25rem 1rem', color: '#718096', maxWidth: '240px' }}>{invite.address}</td>
                      <td style={{ padding: '1.25rem 1rem' }}>
                        <span style={{ fontSize: '0.7rem', padding: '4px 10px', borderRadius: '999px', background: invite.status === 'claimed' ? 'rgba(37,211,102,0.12)' : 'rgba(212,175,55,0.12)', color: invite.status === 'claimed' ? '#25D366' : '#D4AF37', fontWeight: 900, textTransform: 'uppercase' }}>
                          {invite.status === 'claimed' ? 'Cuenta creada' : 'Pendiente'}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => openWhatsappInvite(invite.lastWhatsappUrl)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: '0.78rem' }}>
                            WhatsApp
                          </button>
                          {invite.status !== 'claimed' && (
                            <button type="button" onClick={() => resendClientInvite(invite)} style={{ ...ghostBtn, padding: '7px 12px', fontSize: '0.78rem' }}>
                              Reenviar link
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.clientInvites.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ padding: '2.5rem', textAlign: 'center', color: '#4a5568' }}>No hay invitaciones creadas.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '2.5rem', fontFamily: "'Cormorant Garamond', serif" }}>Control de Ingresos</h2>
            <div className="admin-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Recaudado</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#25D366' }}>{formatCurrency(data.metrics.revenueCents)}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Por Cobrar</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f87171' }}>{formatCurrency(data.metrics.pendingPaymentsCents)}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Reservas Hoy</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#D4AF37' }}>{data.metrics.todayCount}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Membresias Activas</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#D4AF37' }}>{data.metrics.activeMemberships}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Proximos 7 dias</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#D4AF37' }}>{data.metrics.upcomingWeekCount || 0}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Pagos por revisar</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f87171' }}>{data.metrics.unpaidCount || 0}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Completadas Mes</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#25D366' }}>{data.metrics.completedMonthCount || 0}</p>
               </div>
               <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
                  <p style={{ color: '#718096', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Pagos Fallidos</p>
                  <p style={{ fontSize: '2.5rem', fontWeight: 900, color: '#f87171' }}>{data.metrics.failedPaymentCount || 0}</p>
               </div>
            </div>
            <div className="admin-insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
              <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Servicios mas pedidos</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(data.metrics.topServices || []).map((item) => (
                    <div key={item.title} style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                      <span>{item.title}</span>
                      <strong style={{ color: '#D4AF37' }}>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Horas pico</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(data.metrics.peakHours || []).map((item) => (
                    <div key={item.time} style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                      <span>{item.time}</span>
                      <strong style={{ color: '#D4AF37' }}>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Ingresos por metodo</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {(data.metrics.paymentMethodTotals || []).map((item) => (
                    <div key={item.method} style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                      <span>{paymentMethodLabel(item.method)} ({item.count})</span>
                      <strong style={{ color: '#25D366' }}>{formatCurrency(item.revenueCents)}</strong>
                    </div>
                  ))}
                  {(data.metrics.paymentMethodTotals || []).length === 0 && <p style={{ color: '#718096', margin: 0 }}>Sin pagos conciliados este mes.</p>}
                </div>
              </div>
              <div className="glass-panel" style={{ padding: '2rem', borderRadius: '24px' }}>
                <h3 style={{ margin: '0 0 1rem' }}>Lavados de membresia</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                    <span>Programados</span>
                    <strong style={{ color: '#D4AF37' }}>{data.metrics.membershipVisitSummary?.total || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                    <span>Completados</span>
                    <strong style={{ color: '#25D366' }}>{data.metrics.membershipVisitSummary?.completed || 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a0aec0' }}>
                    <span>Pendientes</span>
                    <strong style={{ color: '#D4AF37' }}>{data.metrics.membershipVisitSummary?.remaining || 0}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <div className="admin-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
              <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, fontFamily: "'Cormorant Garamond', serif" }}>Catálogo Maestro</h2>
              <button type="button" onClick={openCreateService} style={{ ...goldBtn, padding: '12px 24px' }}>+ Crear Nuevo Servicio</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
              {data.services.map(s => (
                <div key={s._id} className="glass-panel" style={{ padding: '2rem', borderRadius: '24px', border: '1px solid rgba(212,175,55,0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                    <div style={{ color: '#D4AF37' }}><IconDroplet /></div>
                    <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', color: '#718096', textTransform: 'uppercase' }}>{s.category}</span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem', fontWeight: 700 }}>{s.title}</h3>
                  <p style={{ color: '#D4AF37', fontWeight: 900, fontSize: '1.5rem', margin: '0 0 1.5rem', fontFamily: "'Cormorant Garamond', serif" }}>{s.price}</p>
                  <p style={{ color: '#718096', fontSize: '0.8rem', margin: '0 0 1.5rem' }}>Duracion: {s.durationMinutes || 60} min</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => openEditService(s)} style={{ ...ghostBtn, padding: '10px', fontSize: '0.8rem', flex: 1 }}>Editar</button>
                    <button type="button" onClick={() => deleteService(s)} style={{ ...ghostBtn, padding: '10px', fontSize: '0.8rem', flex: 1, color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)' }}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
