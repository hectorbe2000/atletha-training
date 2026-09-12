/**
 * Adaptador del molinete Actuar. ESQUELETO — NO FUNCIONA TODAVÍA.
 *
 * =====================================================================
 *  Esto es lo único que falta para que el control de acceso funcione.
 *  Todo lo demás (decisión, registro, pantalla, enrolamiento) ya está
 *  hecho y probado contra el simulador.
 * =====================================================================
 *
 * Está a propósito vacío. No se inventaron comandos, ni velocidad de puerto,
 * ni identificadores USB, ni el significado de los 4 pines: inventar eso
 * habría dado un archivo que parece terminado, que no anda, y que además
 * manda bytes desconocidos a un equipo que controla una puerta.
 *
 * ---------------------------------------------------------------------
 *  QUÉ HAY QUE AVERIGUAR ANTES DE COMPLETAR ESTE ARCHIVO
 * ---------------------------------------------------------------------
 *
 *  Pedile al proveedor de Actuar el manual de integración o el SDK. Lo que
 *  hace falta saber es:
 *
 *  1. TRANSPORTE — cómo se habla con el equipo.
 *     · ¿El USB se presenta como puerto serie virtual (COM en Windows),
 *       como teclado (HID), o requiere un driver propio?
 *     · Si es serie: velocidad, bits de datos, paridad, bits de parada,
 *       control de flujo.
 *     · Si es HID: los identificadores del dispositivo.
 *     · El conector de 4 pines suele ser alimentación y el relé de la
 *       barrera, no datos — pero hay que confirmarlo con el fabricante.
 *       NO conectar nada sin el pinout oficial.
 *
 *  2. LECTURA DE HUELLA — cómo avisa que reconoció un dedo.
 *     · ¿Manda un mensaje solo (push) o hay que preguntarle (polling)?
 *     · Cómo empieza y termina cada mensaje, y si lleva verificación.
 *     · Qué identificador devuelve y de qué tipo: número de usuario del
 *       equipo, índice de plantilla, o una cadena.
 *
 *  3. APERTURA — cómo se le ordena abrir.
 *     · El comando exacto y qué contesta.
 *     · Si el equipo cierra solo después de un tiempo o hay que cerrarlo.
 *     · Qué pasa si nadie pasa: ¿se cierra igual?
 *
 *  4. ENROLAMIENTO — cómo se carga una huella nueva.
 *     · ¿Se hace desde el equipo o se puede disparar por comando?
 *     · Cómo se sabe qué identificador quedó asignado. (De eso depende el
 *       enrolamiento asistido; ver `servicio.js`.)
 *
 *  5. ESTADO — cómo saber si sigue vivo.
 *     · ¿Hay un comando de "estás ahí?" o hay que inferirlo del silencio?
 *
 * ---------------------------------------------------------------------
 *  CÓMO COMPLETARLO
 * ---------------------------------------------------------------------
 *
 *  Los cuatro métodos de abajo son los únicos que hay que llenar. El resto
 *  del sistema no se toca. Cuando el lector reconozca un dedo, llamá a:
 *
 *      this.emitirHuella({ biometriaId: <lo que devuelva el equipo> });
 *
 *  Para probarlo sin arriesgar la puerta: `MOLINETE=actuar` en gym/.env y
 *  la pantalla de Ingreso muestra el estado de la conexión en vivo.
 *
 *  Si el transporte termina siendo un puerto serie, va a hacer falta una
 *  dependencia para hablarle (`serialport`); todavía no se instaló porque
 *  no se sabe si es el caso.
 */
import { ESTADO, Molinete } from '../molinete.js';

/** Se lanza al intentar usar el adaptador sin haberlo completado. */
class FaltaElProtocolo extends Error {
  constructor(que) {
    super(
      `Molinete Actuar: falta implementar ${que}. ` +
        'Ver las instrucciones en server/src/acceso/adaptadores/actuar.js. ' +
        'Mientras tanto, dejá MOLINETE=simulado en gym/.env.'
    );
    this.name = 'FaltaElProtocolo';
  }
}

export class MolineteActuar extends Molinete {
  constructor(opciones = {}) {
    super('actuar');
    // Lo que venga de la configuración se guarda tal cual. Ninguno tiene
    // valor por defecto inventado: si hace falta, se completa cuando se
    // conozca el equipo.
    this.opciones = opciones;
  }

  async conectar() {
    this.marcarEstado(ESTADO.CONECTANDO);

    // TODO(hardware): abrir el canal con el equipo.
    //
    //   1. Detectar o recibir por configuración el puerto/dispositivo.
    //   2. Abrirlo con los parámetros del fabricante.
    //   3. Suscribirse a los mensajes entrantes y, por cada lectura de
    //      huella, llamar a this.emitirHuella({ biometriaId }).
    //   4. this.marcarConectado(<descripción del canal>);
    //
    // Ante una desconexión: this.marcarError(error). El servicio ya sabe
    // que con el molinete caído no se abre nada.
    const error = new FaltaElProtocolo('la conexión con el equipo');
    this.marcarError(error);
    throw error;
  }

  async desconectar() {
    // TODO(hardware): cerrar el canal y soltar el puerto.
    this.marcarEstado(ESTADO.DESCONECTADO);
  }

  async abrir(_ms) {
    // TODO(hardware): mandar la orden de apertura y esperar la confirmación.
    //
    // Que esto lance mientras esté sin implementar es intencional: es
    // preferible que la puerta no abra y quede el error registrado, a que
    // el sistema crea que abrió cuando no abrió.
    throw new FaltaElProtocolo('la orden de apertura');
  }

  async denegar() {
    // TODO(hardware): señal de rechazo, si el equipo la soporta.
    //
    // No lanza: que no haya luz roja no puede tumbar el flujo. El rechazo
    // ya quedó registrado y se muestra en pantalla.
  }
}
