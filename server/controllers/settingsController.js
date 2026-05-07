const { isValidObjectId, parseBookingDate, sanitizeString } = require('../utils/validation');
const {
  getAvailabilityForService,
  getBusinessSettings,
  normalizeUnavailableBlocks,
  normalizeWeeklySchedule
} = require('../utils/scheduler');
const { getDateKeyFromStoredDate } = require('../utils/dateTime');
const { auditLog } = require('../utils/auditLogger');

const serializeTransferAccount = (transferAccount = {}) => ({
  bankName: transferAccount.bankName || '',
  accountName: transferAccount.accountName || '',
  accountNumber: transferAccount.accountNumber || '',
  accountType: transferAccount.accountType || '',
  instructions: transferAccount.instructions || ''
});

const sanitizeTransferAccount = (value = {}) => ({
  bankName: sanitizeString(value.bankName, 80),
  accountName: sanitizeString(value.accountName, 120),
  accountNumber: sanitizeString(value.accountNumber, 60),
  accountType: sanitizeString(value.accountType, 60),
  instructions: sanitizeString(value.instructions, 300)
});

const serializeUnavailableBlocks = (blocks = []) => (
  blocks.map((block) => ({
    _id: block._id,
    date: getDateKeyFromStoredDate(block.date),
    start: block.start,
    end: block.end,
    note: block.note || 'Descanso'
  }))
);

const serializeScheduleSettings = (settings) => ({
  weeklySchedule: settings.weeklySchedule,
  slotIntervalMinutes: settings.slotIntervalMinutes,
  transferAccount: serializeTransferAccount(settings.transferAccount),
  unavailableBlocks: serializeUnavailableBlocks(settings.unavailableBlocks)
});

exports.getSchedule = async (req, res) => {
  try {
    const settings = await getBusinessSettings();
    return res.status(200).json(serializeScheduleSettings(settings));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al obtener horario' });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const settings = await getBusinessSettings();
    const slotIntervalMinutes = Number(req.body.slotIntervalMinutes || settings.slotIntervalMinutes);

    if (!Number.isInteger(slotIntervalMinutes) || slotIntervalMinutes < 15 || slotIntervalMinutes > 240) {
      return res.status(400).json({ message: 'Intervalo de horario invalido' });
    }

    settings.weeklySchedule = normalizeWeeklySchedule(req.body.weeklySchedule);
    settings.slotIntervalMinutes = slotIntervalMinutes;
    settings.transferAccount = sanitizeTransferAccount(req.body.transferAccount || settings.transferAccount);
    settings.unavailableBlocks = normalizeUnavailableBlocks(req.body.unavailableBlocks || settings.unavailableBlocks);
    await settings.save();

    auditLog('settings.schedule_updated', {
      adminId: req.user.id,
      unavailableBlockCount: settings.unavailableBlocks.length
    });
    return res.status(200).json(serializeScheduleSettings(settings));
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: 'Error al actualizar horario' });
  }
};

exports.getAvailability = async (req, res) => {
  try {
    const { serviceId } = req.query;
    const date = parseBookingDate(req.query.date);

    if (!isValidObjectId(serviceId) || !date) {
      return res.status(400).json({ message: 'Servicio o fecha invalida' });
    }

    const availability = await getAvailabilityForService({ serviceId, date });
    if (!availability.service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    return res.status(200).json(availability);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error al calcular disponibilidad' });
  }
};
