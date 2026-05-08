const Service = require('../models/Service');
const {
  SERVICE_CATEGORIES,
  isValidObjectId,
  pickServiceInput,
  parseServicePriceCents,
  sanitizeString
} = require('../utils/validation');
const { auditLog } = require('../utils/auditLogger');

exports.getServices = async (req, res) => {
  try {
    const category = sanitizeString(req.query.category, 30);
    const filter = category && SERVICE_CATEGORIES.has(category) ? { category } : {};
    const services = await Service.find(filter).sort({ createdAt: 1 });
    return res.status(200).json(services);
  } catch (error) {
    console.error('Error fetching services:', error);
    return res.status(500).json({ message: 'Error del servidor al obtener servicios' });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Id de servicio invalido' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    return res.status(200).json(service);
  } catch (error) {
    return res.status(500).json({ message: 'Error del servidor' });
  }
};

exports.createService = async (req, res) => {
  try {
    const input = pickServiceInput(req.body);

    if (!input.title || !input.price || !input.category || !input.waMsg || !SERVICE_CATEGORIES.has(input.category)) {
      return res.status(400).json({ message: 'Datos de servicio invalidos' });
    }

    if (!parseServicePriceCents(input.price)) {
      return res.status(400).json({ message: 'Precio de servicio invalido' });
    }
    if (Object.prototype.hasOwnProperty.call(input, 'durationMinutes') && (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480)) {
      return res.status(400).json({ message: 'Duracion de servicio invalida' });
    }

    const newService = await Service.create(input);
    auditLog('service.created', { userId: req.user.id, serviceId: newService._id });
    return res.status(201).json(newService);
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(400).json({ message: 'Datos de servicio invalidos' });
  }
};

exports.updateService = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Id de servicio invalido' });
    }

    const input = pickServiceInput(req.body);
    if (input.category && !SERVICE_CATEGORIES.has(input.category)) {
      return res.status(400).json({ message: 'Categoria de servicio invalida' });
    }
    if (input.price && !parseServicePriceCents(input.price)) {
      return res.status(400).json({ message: 'Precio de servicio invalido' });
    }
    if (Object.prototype.hasOwnProperty.call(input, 'durationMinutes') && (!Number.isFinite(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480)) {
      return res.status(400).json({ message: 'Duracion de servicio invalida' });
    }

    const service = await Service.findByIdAndUpdate(req.params.id, input, {
      new: true,
      runValidators: true
    });

    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    auditLog('service.updated', { userId: req.user.id, serviceId: service._id });
    return res.status(200).json(service);
  } catch (error) {
    return res.status(400).json({ message: 'Error al actualizar servicio' });
  }
};

exports.deleteService = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Id de servicio invalido' });
    }

    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Servicio no encontrado' });
    }

    auditLog('service.deleted', { userId: req.user.id, serviceId: service._id });
    return res.status(200).json({ message: 'Servicio eliminado correctamente' });
  } catch (error) {
    return res.status(500).json({ message: 'Error al eliminar servicio' });
  }
};

exports.seedServices = async (req, res) => {
  try {
    const count = await Service.countDocuments();
    if (count > 0) {
      return res.status(400).json({ message: 'La base de datos ya contiene servicios.' });
    }

    const defaultServices = [
      {
        title: 'Lavado Exterior',
        price: 'Q35',
        durationMinutes: 30,
        category: 'lavado',
        iconName: 'IconDroplet',
        waMsg: 'Hola! Quiero informacion sobre el Lavado Exterior (Q35)',
        features: ['Lavado completo de carroceria', 'Enjuague y secado', 'Limpiaparabrisas incluido']
      },
      {
        title: 'Lavado Completo',
        price: 'Q60',
        durationMinutes: 60,
        category: 'lavado',
        iconName: 'IconSparkle',
        tag: 'Mas popular',
        waMsg: 'Hola! Quiero informacion sobre el Lavado Completo (Q60)',
        features: ['Todo lo del lavado exterior', 'Limpieza interior', 'Aspirado y tablero', 'Llantas y aros']
      },
      {
        title: 'Promo 2 Lavados Completos',
        price: 'Q100',
        durationMinutes: 120,
        oldPrice: 'Q120',
        category: 'promo',
        iconName: 'IconCar',
        waMsg: 'Hola! Quiero la Promo 2 Lavados Completos por Q100',
        features: ['2 lavados completos', 'Ideal para 2 vehiculos', 'Interior + exterior en ambos', 'Ahorra Q20']
      },
      {
        title: 'Promo 2 Lavados Exteriores',
        price: 'Q60',
        durationMinutes: 60,
        oldPrice: 'Q70',
        category: 'promo',
        iconName: 'IconCar',
        waMsg: 'Hola! Quiero la Promo 2 Lavados Exteriores por Q60',
        features: ['2 lavados exteriores', 'Ideal para 2 vehiculos', 'Carroceria impecable en ambos', 'Ahorra Q10']
      },
      {
        title: 'Membresia Mensual',
        price: 'Q100',
        durationMinutes: 60,
        period: '/ mes',
        category: 'membresia',
        iconName: 'IconCrown',
        description: 'Sin renovacion automatica. Solo 1 vehiculo',
        waMsg: 'Hola! Quiero contratar la Membresia Mensual por Q100',
        features: ['2 lavados completos + 1 lavado exterior', 'Al contratar: 1 lavado completo', 'Dia +15: 1 lavado exterior', 'Final del mes: 1 lavado completo']
      },
      {
        title: 'Membresia Trimestral',
        price: 'Q300',
        durationMinutes: 60,
        period: '/ 3 meses',
        category: 'membresia',
        iconName: 'IconShield',
        tag: 'Mejor valor',
        description: 'Sin renovacion automatica. Solo 1 vehiculo',
        isTrimestral: true,
        waMsg: 'Hola! Quiero contratar la Membresia Trimestral por Q300',
        features: ['9 visitas en 3 meses', '6 lavados completos', '3 lavados exteriores', 'Agenda completa desde el primer dia']
      },
      {
        title: 'Encerado con Cera Liquida',
        price: 'Q60',
        durationMinutes: 45,
        category: 'extra',
        iconName: 'IconSparkle',
        waMsg: 'Hola! Quiero el servicio de Encerado con Cera Liquida (Q60)',
        features: ['Mayor proteccion de pintura', 'Brillo duradero', 'Repele agua y polvo']
      },
      {
        title: 'Lavado de Motor',
        price: 'Q100',
        durationMinutes: 60,
        category: 'extra',
        iconName: 'IconTool',
        waMsg: 'Hola! Quiero el servicio de Lavado de Motor (Q100)',
        features: ['Limpieza profunda de motor', 'Desengrasante premium', 'Inspeccion visual incluida']
      },
      {
        title: 'Detallado Completo',
        price: 'Q500',
        durationMinutes: 300,
        category: 'extra',
        tag: 'Premium',
        iconName: 'IconZap',
        waMsg: 'Hola! Quiero informacion sobre el Detallado Completo (Q500)',
        features: ['Duracion: 4 a 6 horas', 'Interior y exterior completo', 'Pulido de pintura', 'Proteccion de superficies']
      }
    ];

    await Service.insertMany(defaultServices);
    auditLog('service.seeded', { userId: req.user.id, count: defaultServices.length });
    return res.status(201).json({ message: 'Servicios base inicializados correctamente.' });
  } catch (error) {
    console.error('Error seeding services:', error);
    return res.status(500).json({ message: 'Error al inicializar servicios' });
  }
};
