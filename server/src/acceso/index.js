/**
 * Armado del control de acceso.
 *
 * Qué molinete se usa lo decide `MOLINETE` en gym/.env:
 *
 *   MOLINETE=simulado   (por defecto) — sin hardware, para desarrollar y probar
 *   MOLINETE=actuar     — el equipo real, cuando su adaptador esté completo
 *   MOLINETE=ninguno    — control de acceso apagado
 *
 * Si el molinete no arranca, el resto del sistema sigue funcionando: el
 * mostrador registra ingresos a mano como siempre. Una puerta que no abre no
 * puede dejar al gimnasio sin poder cobrar.
 */
import { config } from '../config.js';
import { MolineteActuar } from './adaptadores/actuar.js';
import { MolineteSimulado } from './adaptadores/simulado.js';
import { ServicioAcceso } from './servicio.js';

let servicio = null;

function crearMolinete(cual) {
  switch (cual) {
    case 'actuar':
      return new MolineteActuar(config.molinete.opciones);
    case 'simulado':
      return new MolineteSimulado();
    default:
      return null;
  }
}

/**
 * Arranca el control de acceso. Devuelve el servicio, o null si está apagado.
 * No lanza: un fallo del molinete queda en consola y el sistema sigue.
 */
export async function iniciarAcceso() {
  const cual = config.molinete.tipo;
  if (cual === 'ninguno') {
    console.log('  Control de acceso: apagado (MOLINETE=ninguno)');
    return null;
  }

  const molinete = crearMolinete(cual);
  if (!molinete) {
    console.warn(`  Control de acceso: "${cual}" no existe. Opciones: simulado, actuar, ninguno.`);
    return null;
  }

  servicio = new ServicioAcceso(molinete);

  try {
    await servicio.iniciar();
    console.log(`  Control de acceso: ${cual} — ${molinete.detalle ?? 'conectado'}`);
  } catch (error) {
    // El adaptador de Actuar lanza a propósito mientras no esté completo.
    console.warn(`  Control de acceso: ${cual} no arrancó — ${error.message}`);
  }

  return servicio;
}

export const accesoActivo = () => servicio;

export async function detenerAcceso() {
  if (servicio) await servicio.detener();
  servicio = null;
}
