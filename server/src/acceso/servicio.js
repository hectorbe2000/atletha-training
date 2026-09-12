/**
 * El flujo de la puerta.
 *
 *   huella → identificar socio → decidir → abrir o denegar → registrar
 *
 * Este archivo no sabe nada del hardware: habla con un `Molinete` (ver
 * molinete.js) que puede ser el equipo real o el simulador. Y no decide
 * nada por su cuenta: la regla vive en decision.js, compartida con el
 * mostrador.
 */
import { EventEmitter } from 'node:events';

import { una, query } from '../db.js';
import { decidirAcceso, MOTIVOS } from './decision.js';

/** Cuánto tiempo se le pide al molinete que deje pasar. */
const MS_APERTURA = 5000;

export class ServicioAcceso extends EventEmitter {
  constructor(molinete) {
    super();
    this.molinete = molinete;
    /** Los últimos eventos, para que una pantalla que recién abre vea algo. */
    this.recientes = [];

    molinete.on('huella', (datos) => {
      // El manejador es async pero el emisor no espera: si algo falla, que
      // quede en el log y no tumbe el proceso que atiende la puerta.
      this.procesarHuella(datos.biometriaId).catch((error) => {
        console.error('[acceso] fallo procesando una huella:', error);
      });
    });

    molinete.on('estado', (e) => this.emit('estado', e));
    molinete.on('error', (error) => console.error('[acceso] molinete:', error.message));
  }

  async iniciar() {
    await this.molinete.conectar();
  }

  async detener() {
    await this.molinete.desconectar().catch(() => {});
  }

  /**
   * El camino completo de una lectura.
   *
   * El orden importa: primero se decide, después se abre, y recién al final
   * se registra. Si el molinete falla al abrir, el acceso queda registrado
   * como no concretado en vez de aparecer como si la persona hubiera pasado.
   */
  async procesarHuella(biometriaId) {
    // Poner al día los vencimientos antes de decidir: si la membresía venció
    // anoche, el socio no tiene que poder entrar esta mañana.
    await query('SELECT fn_actualizar_membresias_vencidas()');

    const socio = await this.socioDeHuella(biometriaId);
    const decision = decidirAcceso(socio);

    let abrio = false;
    let errorPuerta = null;

    if (decision.permitido) {
      try {
        await this.molinete.abrir(MS_APERTURA);
        abrio = true;
      } catch (error) {
        // La decisión fue "puede pasar" pero la puerta no obedeció. Se
        // registra igual, con la marca de que no llegó a abrirse.
        errorPuerta = error.message;
        console.error('[acceso] no se pudo abrir el molinete:', error.message);
      }
    } else {
      await this.molinete.denegar().catch(() => {});
    }

    const registrado = await this.registrar({
      socio,
      biometriaId,
      decision,
      abrio,
    });

    const evento = {
      ...decision,
      socio: socio ?? null,
      biometria_id: biometriaId,
      abrio,
      error_puerta: errorPuerta,
      asistencia_registrada: registrado.asistenciaNueva,
      ocurrido_en: registrado.ocurrido_en,
    };

    this.recordar(evento);
    this.emit('acceso', evento);
    return evento;
  }

  /** ¿De quién es esta huella? */
  async socioDeHuella(biometriaId) {
    return una(
      `SELECT v.*
         FROM socio_biometria b
         JOIN v_socios_estado v ON v.socio_id = b.socio_id
        WHERE b.biometria_id = $1 AND b.activa`,
      [biometriaId]
    );
  }

  /**
   * Deja constancia. Siempre en `accesos`; en `asistencias` solo si entró.
   *
   * `asistencias` es una fila por socio y día —es lo que alimenta el panel y
   * el progreso— así que el segundo ingreso del mismo día no la duplica.
   */
  async registrar({ socio, biometriaId, decision, abrio }) {
    const acceso = await una(
      `INSERT INTO accesos (socio_id, biometria_id, permitido, motivo, origen)
       VALUES ($1, $2, $3, $4, 'MOLINETE')
       RETURNING ocurrido_en`,
      [socio?.socio_id ?? null, biometriaId, decision.permitido && abrio, decision.motivo]
    );

    let asistenciaNueva = false;
    if (decision.permitido && abrio && socio) {
      const fila = await una(
        `INSERT INTO asistencias (socio_id) VALUES ($1)
         ON CONFLICT (socio_id, fecha) DO NOTHING
         RETURNING id`,
        [socio.socio_id]
      );
      asistenciaNueva = Boolean(fila);
    }

    return { ocurrido_en: acceso.ocurrido_en, asistenciaNueva };
  }

  /** Los últimos 20 eventos, para que la pantalla arranque con contexto. */
  recordar(evento) {
    this.recientes.unshift(evento);
    if (this.recientes.length > 20) this.recientes.pop();
  }

  situacion() {
    return this.molinete.situacion();
  }
}

export { MOTIVOS };
