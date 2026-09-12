/**
 * Contrato del molinete.
 *
 * Todo el resto del sistema habla con la puerta a través de esta interfaz y
 * de ninguna otra forma. Quien la implemente puede ser el equipo Actuar de
 * verdad, un simulador, o mañana un molinete de otra marca: mientras cumpla
 * este contrato, no cambia una línea del servicio de acceso.
 *
 * NO hay nada acá sobre cómo se comunica el hardware —ni puerto, ni
 * velocidad, ni comandos, ni identificadores USB— porque todavía no se
 * conoce el protocolo del fabricante. Ese hueco vive en un solo archivo
 * (`adaptadores/actuar.js`) y es lo único que falta completar cuando llegue
 * el equipo.
 *
 * -------------------------------------------------------------------------
 *  Cómo se implementa uno nuevo
 * -------------------------------------------------------------------------
 *
 *   class MiMolinete extends Molinete {
 *     async conectar()  { ...abrir el canal... ; this.marcarConectado(); }
 *     async desconectar() { ...cerrar el canal... }
 *     async abrir(ms)   { ...orden de apertura... }
 *     async denegar()   { ...opcional: buzzer, luz roja... }
 *   }
 *
 * Y cuando el lector reconoce un dedo, el adaptador avisa con:
 *
 *   this.emitirHuella({ biometriaId: '...' });
 *
 * Eso es todo lo que el sistema necesita saber del hardware.
 */
import { EventEmitter } from 'node:events';

/** Estados posibles del vínculo con el equipo. */
export const ESTADO = {
  DESCONECTADO: 'DESCONECTADO',
  CONECTANDO: 'CONECTANDO',
  CONECTADO: 'CONECTADO',
  ERROR: 'ERROR',
};

/**
 * Clase base. Emite:
 *
 *   'huella'  ({ biometriaId })  — el lector reconoció un dedo
 *   'estado'  ({ estado, detalle })
 *   'error'   (Error)
 */
export class Molinete extends EventEmitter {
  constructor(nombre) {
    super();
    this.nombre = nombre;
    this.estado = ESTADO.DESCONECTADO;
    this.detalle = null;
  }

  // --- Lo que cada adaptador tiene que implementar --------------------

  /** Abre el canal con el equipo. Debe dejar el estado en CONECTADO. */
  async conectar() {
    throw new Error(`${this.nombre}: falta implementar conectar()`);
  }

  /** Cierra el canal. Se llama al apagar el servidor. */
  async desconectar() {
    throw new Error(`${this.nombre}: falta implementar desconectar()`);
  }

  /**
   * Da la orden de apertura. `ms` es cuánto tiempo dejar pasar; si el equipo
   * maneja su propio tiempo de cierre, el adaptador puede ignorarlo.
   */
  async abrir(_ms) {
    throw new Error(`${this.nombre}: falta implementar abrir()`);
  }

  /**
   * Señal de rechazo (luz roja, buzzer, lo que soporte el equipo).
   *
   * Es opcional a propósito: si el molinete no tiene forma de señalizar, no
   * pasa nada. Lo que NUNCA debe hacer un rechazo es abrir.
   */
  async denegar() {
    /* sin señalización por defecto */
  }

  // --- Utilidades para los adaptadores --------------------------------

  /** El adaptador llama a esto cuando el lector reconoce un dedo. */
  emitirHuella(datos) {
    if (!datos?.biometriaId) {
      this.emit('error', new Error(`${this.nombre}: llegó una huella sin identificador`));
      return;
    }
    this.emit('huella', { biometriaId: String(datos.biometriaId) });
  }

  marcarEstado(estado, detalle = null) {
    this.estado = estado;
    this.detalle = detalle;
    this.emit('estado', { estado, detalle });
  }

  marcarConectado(detalle = null) {
    this.marcarEstado(ESTADO.CONECTADO, detalle);
  }

  marcarError(error) {
    this.marcarEstado(ESTADO.ERROR, error?.message ?? String(error));
    this.emit('error', error instanceof Error ? error : new Error(String(error)));
  }

  /** Resumen para mostrar en pantalla. */
  situacion() {
    return { nombre: this.nombre, estado: this.estado, detalle: this.detalle };
  }
}
