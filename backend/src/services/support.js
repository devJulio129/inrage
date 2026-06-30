const SUPPORT_MESSAGE = [
  'Hola, necesito ayuda para recuperar mi acceso a Inrage.',
  'Mi nombre es:',
  'Mi correo o telefono registrado es:',
  'Sucursal: Torres/Central'
].join('\n');

export function whatsappSupportLink(number = process.env.SUPPORT_WHATSAPP_NUMBER) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) {
    return {
      configured: false,
      message: 'Support WhatsApp not configured'
    };
  }

  return {
    configured: true,
    url: `https://wa.me/${digits}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`,
    label: 'Contactar soporte por WhatsApp'
  };
}

export { SUPPORT_MESSAGE };
