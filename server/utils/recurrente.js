const axios = require('axios');
const { parseServicePriceCents } = require('./validation');

exports.createRecurrenteCheckout = async (user, service) => {
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const bookingId = encodeURIComponent(service.bookingId);

    if (!process.env.RECURRENTE_SECRET_KEY || process.env.RECURRENTE_SECRET_KEY === 'tu_secret_key_aqui') {
      console.warn('Recurrente API keys no configuradas. Simulando checkout...');
      return {
        checkout_url: `${clientUrl}/success?booking=${bookingId}&simulated=true`,
        id: 'simulated'
      };
    }

    const amountInCents = service.amountInCents || parseServicePriceCents(service.price);
    if (!amountInCents) {
      throw new Error('Precio invalido');
    }

    const response = await axios.post('https://app.recurrente.com/api/checkouts', {
      items: [
        {
          name: service.title,
          amount_in_cents: amountInCents,
          currency: 'GTQ',
          quantity: 1,
          add_fee: false
        }
      ],
      external_id: service.bookingId,
      user_email: user.email,
      user_name: user.name,
      success_url: `${clientUrl}/success?booking=${bookingId}`,
      cancel_url: `${clientUrl}/dashboard?payment=cancel`
    }, {
      headers: {
        'X-PUBLIC-KEY': process.env.RECURRENTE_PUBLIC_KEY,
        'X-SECRET-KEY': process.env.RECURRENTE_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      checkout_url: response.data.checkout_url,
      id: response.data.id
    };
  } catch (error) {
    console.error('Error al contactar con Recurrente:', error.response?.data || error.message);
    throw new Error('No se pudo generar el link de pago');
  }
};
