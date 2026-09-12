/**
 * La regla de quién puede pasar. Una sola, para todo el sistema.
 *
 * La usan el mostrador (cuando se tipea la cédula) y el molinete (cuando se
 * apoya el dedo). Antes vivía adentro del endpoint del mostrador; si el
 * molinete hubiera traído su propia copia, tarde o temprano una iba a decir
 * que sí y la otra que no para el mismo socio, y eso en la puerta se discute
 * con el socio parado adelante.
 *
 * Es una función pura: recibe una fila de `v_socios_estado` y devuelve la
 * decisión. No toca la base, no abre nada, no registra nada. Así se puede
 * probar sin hardware y sin PostgreSQL.
 */

/**
 * Motivos posibles. Son los que se guardan en `accesos.motivo`, así que
 * agregar uno nuevo implica pensar qué se muestra en pantalla.
 */
export const MOTIVOS = {
  AL_DIA: 'AL_DIA',
  POR_VENCER: 'POR_VENCER',
  VENCIDO: 'VENCIDO',
  SIN_MEMBRESIA: 'SIN_MEMBRESIA',
  INACTIVO: 'INACTIVO',
  // La huella llegó pero no está asociada a ningún socio.
  NO_RECONOCIDO: 'NO_RECONOCIDO',
  // Los que entran sin ser socios y los deja pasar el administrador.
  VISITA: 'VISITA',
  DIA_DE_PRUEBA: 'DIA_DE_PRUEBA',
};

/** Lo que se muestra en la pantalla del molinete para cada motivo. */
const MENSAJES = {
  AL_DIA: 'Adelante.',
  POR_VENCER: 'Adelante. Tu plan está por vencer.',
  VENCIDO: 'Tu membresía está vencida. Pasá por el mostrador.',
  SIN_MEMBRESIA: 'No tenés un plan activo. Pasá por el mostrador.',
  INACTIVO: 'Tu cuenta está dada de baja. Consultá en el mostrador.',
  NO_RECONOCIDO: 'Huella no reconocida. Pasá por el mostrador.',
};

/**
 * Decide si un socio puede pasar.
 *
 * `socio` es una fila de `v_socios_estado`, o null/undefined si la huella no
 * corresponde a nadie.
 *
 * Devuelve siempre la misma forma: { permitido, motivo, mensaje, dias_restantes }.
 */
export function decidirAcceso(socio) {
  if (!socio) {
    return respuesta(false, MOTIVOS.NO_RECONOCIDO, null);
  }

  // La baja gana sobre cualquier membresía: un socio dado de baja no entra
  // aunque le queden días pagados.
  if (!socio.activo) {
    return respuesta(false, MOTIVOS.INACTIVO, socio);
  }

  switch (socio.estado) {
    case 'AL_DIA':
      return respuesta(true, MOTIVOS.AL_DIA, socio);
    case 'POR_VENCER':
      // Pasa igual: todavía tiene días pagados. El aviso es para que sepa.
      return respuesta(true, MOTIVOS.POR_VENCER, socio);
    case 'VENCIDO':
      return respuesta(false, MOTIVOS.VENCIDO, socio);
    default:
      return respuesta(false, MOTIVOS.SIN_MEMBRESIA, socio);
  }
}

function respuesta(permitido, motivo, socio) {
  let mensaje = MENSAJES[motivo];

  // Al vencido se le dice hace cuánto: es el dato que evita la discusión.
  if (motivo === MOTIVOS.VENCIDO && Number.isInteger(socio?.dias_restantes)) {
    const dias = Math.abs(socio.dias_restantes);
    mensaje =
      dias === 0
        ? 'Tu membresía vence hoy. Pasá por el mostrador.'
        : `Tu membresía venció hace ${dias} ${dias === 1 ? 'día' : 'días'}. Pasá por el mostrador.`;
  }
  if (motivo === MOTIVOS.POR_VENCER && Number.isInteger(socio?.dias_restantes)) {
    const dias = socio.dias_restantes;
    mensaje =
      dias <= 0
        ? 'Adelante. Tu plan vence hoy.'
        : `Adelante. Te quedan ${dias} ${dias === 1 ? 'día' : 'días'} de plan.`;
  }

  return {
    permitido,
    motivo,
    mensaje,
    dias_restantes: socio?.dias_restantes ?? null,
  };
}
