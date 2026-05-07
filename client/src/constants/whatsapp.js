const WHATSAPP_NUMBER = "50237674506";
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function whatsappMsg(msg) {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(msg)}`;
}
