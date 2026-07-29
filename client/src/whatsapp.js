import { fecha } from './api.js';

/**
 * Avisos por WhatsApp.
 *
 * No hace falta ninguna API ni token: `wa.me` abre la aplicación instalada en
 * el celular o WhatsApp Web en la PC, con el mensaje ya escrito. El admin solo
 * revisa y toca enviar.
 */

/** Cambiá esto por el nombre real del gimnasio: aparece en cada mensaje. */
export const NOMBRE_GIMNASIO = 'el gimnasio';

/**
 * "de el gimnasio" no se dice. Se contrae cuando el nombre arranca con
 * artículo y se deja tal cual cuando es un nombre propio:
 *   'el gimnasio' -> "del gimnasio"
 *   'Power Gym'   -> "de Power Gym"
 */
const DE_GIMNASIO = /^el\s+/i.test(NOMBRE_GIMNASIO)
  ? `del ${NOMBRE_GIMNASIO.replace(/^el\s+/i, '')}`
  : `de ${NOMBRE_GIMNASIO}`;

/** Código de país por defecto para los números cargados en formato local. */
const PAIS = '595'; // Paraguay

/**
 * Lleva un teléfono a formato internacional sin signos, que es lo que pide
 * wa.me. Acepta lo que la gente escribe de verdad:
 *   "0981 123 456"    -> 595981123456
 *   "0981123456"      -> 595981123456
 *   "981123456"       -> 595981123456
 *   "+595 981 123456" -> 595981123456
 *   "+54 9 11 ..."    -> se respeta el país que ya trae
 *
 * Devuelve null si el número no da para ser un celular.
 */
export function telefonoWhatsApp(telefono, pais = PAIS) {
  const crudo = String(telefono ?? '').trim();
  if (!crudo) return null;

  const digitos = crudo.replace(/\D/g, '');
  if (!digitos) return null;

  let internacional;
  if (crudo.startsWith('+')) internacional = digitos; // ya venía con país
  else if (digitos.startsWith(pais)) internacional = digitos;
  else if (digitos.startsWith('0')) internacional = pais + digitos.slice(1);
  else internacional = pais + digitos;

  // Un internacional válido anda entre 10 y 15 dígitos (E.164).
  if (internacional.length < 10 || internacional.length > 15) return null;
  return internacional;
}

/** ¿Se le puede escribir a este socio? */
export const tieneWhatsApp = (telefono) => telefonoWhatsApp(telefono) !== null;

/**
 * Mensaje según en qué situación está la membresía. El tuteo y el tono son
 * los de un gimnasio de barrio, no los de un banco.
 */
export function mensajeVencimiento(socio) {
  const nombre = (socio.nombre_completo ?? socio.nombre ?? '').split(' ')[0];
  const plan = socio.plan ? `tu plan ${socio.plan}` : 'tu membresía';
  const dias = socio.dias_restantes;

  switch (socio.estado) {
    case 'VENCIDO': {
      const cuantos = Math.abs(dias ?? 0);
      const hace =
        cuantos === 0 ? 'venció hoy'
        : cuantos === 1 ? 'venció ayer'
        : `venció hace ${cuantos} días`;
      return (
        `Hola ${nombre}! Te escribimos ${DE_GIMNASIO}. ` +
        `Te avisamos que ${plan} ${hace} (${fecha(socio.fecha_fin)}). ` +
        `Cuando quieras pasás y lo renovamos así seguís entrenando. ¡Te esperamos!`
      );
    }

    case 'POR_VENCER': {
      const cuantos = dias ?? 0;
      const cuando =
        cuantos === 0 ? 'vence hoy'
        : cuantos === 1 ? 'vence mañana'
        : `vence en ${cuantos} días`;
      return (
        `Hola ${nombre}! Te escribimos ${DE_GIMNASIO}. ` +
        `${plan[0].toUpperCase() + plan.slice(1)} ${cuando} (${fecha(socio.fecha_fin)}). ` +
        `Podés renovarlo cuando vengas a entrenar, así no se te corta. ¡Nos vemos!`
      );
    }

    case 'SIN_MEMBRESIA':
      return (
        `Hola ${nombre}! Te escribimos ${DE_GIMNASIO}. ` +
        `Vimos que todavía no tenés un plan activo. Pasá cuando quieras y lo activamos.`
      );

    default:
      return (
        `Hola ${nombre}! Te escribimos ${DE_GIMNASIO}. ` +
        `${plan[0].toUpperCase() + plan.slice(1)} está al día hasta el ${fecha(socio.fecha_fin)}.`
      );
  }
}

/** URL de wa.me con el mensaje ya cargado. */
export function enlaceWhatsApp(telefono, mensaje) {
  const numero = telefonoWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
