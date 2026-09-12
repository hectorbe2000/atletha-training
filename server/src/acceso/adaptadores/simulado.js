/**
 * Molinete simulado.
 *
 * Cumple el contrato entero sin hardware: sirve para desarrollar la pantalla,
 * probar el flujo de punta a punta y hacer la demo antes de que llegue el
 * equipo. Es el adaptador que corre por defecto.
 *
 * No simula el protocolo de Actuar —eso no se conoce todavía— sino el
 * comportamiento observable: se conecta, avisa cuando "leyó" un dedo, y
 * anota si le pidieron abrir. Nada de lo que hay acá presupone cómo funciona
 * el equipo real.
 */
import { ESTADO, Molinete } from '../molinete.js';

export class MolineteSimulado extends Molinete {
  constructor() {
    super('simulado');
    /** Las órdenes recibidas, para poder verificarlas en las pruebas. */
    this.ordenes = [];
  }

  async conectar() {
    this.marcarEstado(ESTADO.CONECTANDO);
    this.marcarConectado('simulador en memoria, sin hardware');
  }

  async desconectar() {
    this.marcarEstado(ESTADO.DESCONECTADO);
  }

  async abrir(ms) {
    this.ordenes.push({ orden: 'abrir', ms });
  }

  async denegar() {
    this.ordenes.push({ orden: 'denegar' });
  }

  /**
   * Dispara una lectura como si alguien hubiera apoyado el dedo.
   *
   * Es lo que usa el botón "simular huella" de la pantalla de ingreso y lo
   * que usan las pruebas. El adaptador real no tiene este método: ahí las
   * lecturas las genera el equipo.
   */
  simularHuella(biometriaId) {
    this.emitirHuella({ biometriaId });
  }

  /** ¿Se dio la orden de abrir desde tal momento? Para las pruebas. */
  abrioDesde(indice = 0) {
    return this.ordenes.slice(indice).some((o) => o.orden === 'abrir');
  }
}
