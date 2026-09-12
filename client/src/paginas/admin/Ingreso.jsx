import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, fecha, qs } from '../../api.js';
import { BotonWhatsApp } from '../../componentes/BotonWhatsApp.jsx';
import { FotoSocio } from '../../componentes/FotoSocio.jsx';
import { Aviso, Campo, InsigniaEstado, Modal } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

/** Cada cuánto se le pregunta a la puerta qué pasó. */
const MS_SONDEO = 2000;

/** Una cédula es solo dígitos; cualquier otra cosa se busca por nombre. */
const esCedula = (texto) => /^[0-9]{4,15}$/.test(texto);

/**
 * Consola de la puerta. Está abierta todo el día en el mostrador.
 *
 * Hace dos cosas a la vez: deja buscar a mano (por cédula o por nombre) y
 * muestra en vivo lo que va pasando en el molinete. Si el lector no reconoce
 * a alguien, la persona de recepción lo resuelve desde la misma pantalla sin
 * tener que ir a otro lado.
 */
export function Ingreso() {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState(null);
  const [coincidencias, setCoincidencias] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [abrirVisita, setAbrirVisita] = useState(false);
  const [visitaHecha, setVisitaHecha] = useState(null);
  const campo = useRef(null);

  const puerta = useDatos('/api/acceso/estado');
  const registros = useDatos('/api/acceso/registros?limite=25');

  const enfocar = () => campo.current?.focus();
  useEffect(enfocar, []);

  // Sondeo de la puerta. Con el molinete apagado igual sirve: la bitácora
  // también recoge los ingresos cargados a mano desde el mostrador.
  const refrescarPuerta = puerta.refrescar;
  const refrescarRegistros = registros.refrescar;
  useEffect(() => {
    const t = setInterval(() => {
      refrescarPuerta();
      refrescarRegistros();
    }, MS_SONDEO);
    return () => clearInterval(t);
  }, [refrescarPuerta, refrescarRegistros]);

  const ultimoDeLaPuerta = puerta.datos?.recientes?.[0] ?? null;

  // Lo que muestra el cartel grande: si el mostrador está consultando algo a
  // mano, manda eso; si no, lo último que pasó por el molinete.
  const mostrado = resultado ?? ultimoDeLaPuerta;
  const vieneDelMolinete = !resultado && Boolean(ultimoDeLaPuerta);

  async function registrarIngreso(cedula, forzar = false) {
    setError('');
    setEnviando(true);
    try {
      const r = await api.post('/api/socios/ingreso', { documento: cedula, forzar });
      setResultado(r);
      setCoincidencias(null);
      if (r.registrado) {
        setTexto('');
        refrescarRegistros();
      }
    } catch (e) {
      setError(e.message);
      setResultado(null);
    } finally {
      setEnviando(false);
      enfocar();
    }
  }

  /**
   * Con un nombre siempre se muestra la lista, aunque haya una sola
   * coincidencia. Registrar la entrada automáticamente por un nombre parcial
   * es la forma de marcarle la asistencia a la persona equivocada.
   */
  async function buscarPorNombre(termino) {
    setError('');
    setEnviando(true);
    setResultado(null);
    try {
      const r = await api.get(`/api/socios${qs({ buscar: termino, limite: 8, inactivos: 'true' })}`);
      setCoincidencias(r.datos ?? []);
    } catch (e) {
      setError(e.message);
      setCoincidencias(null);
    } finally {
      setEnviando(false);
      enfocar();
    }
  }

  function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    if (esCedula(t)) registrarIngreso(t);
    else buscarPorNombre(t);
  }

  function limpiar() {
    setVisitaHecha(null);
    setResultado(null);
    setCoincidencias(null);
    setError('');
    setTexto('');
    enfocar();
  }

  // Requiere al menos un dígito: con el campo vacío, el espaciado ancho
  // deformaba el texto del placeholder.
  const numerico = /^[0-9]+$/.test(texto.trim());

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div>
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Ingreso</h1>
          <p className="mt-0.5 text-[13.5px] text-texto-suave">
            Escribí la cédula y Enter, o buscá por nombre.
          </p>
        </header>

        <form onSubmit={enviar} className="mb-4 flex gap-2">
          <input
            ref={campo}
            className={`campo flex-1 py-4 text-center text-2xl ${
              numerico ? 'tabular-nums tracking-widest' : ''
            }`}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (resultado) setResultado(null);
              if (coincidencias) setCoincidencias(null);
            }}
            placeholder="Cédula o nombre"
            maxLength={60}
            autoComplete="off"
            aria-label="Cédula o nombre del socio"
          />
          <button type="submit" className="btn-primario px-6" disabled={enviando || !texto.trim()}>
            {enviando ? '…' : 'Buscar'}
          </button>
          {/* Para el que no es socio: viene de visita o a probar el gimnasio. */}
          <button
            type="button"
            onClick={() => setAbrirVisita(true)}
            className="btn-secundario px-4"
            title="Dejar pasar a alguien que no es socio"
          >
            Dejar pasar
          </button>
        </form>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {visitaHecha && (
          <Aviso tipo="ok" className="mb-3">
            Pasó {visitaHecha.visitante} —{' '}
            {visitaHecha.tipo === 'DIA_DE_PRUEBA' ? 'día de prueba' : 'visita'}. Quedó registrado.
            {visitaHecha.error_puerta && ' El molinete no abrió: ' + visitaHecha.error_puerta}
          </Aviso>
        )}

        {coincidencias ? (
          <Coincidencias
            socios={coincidencias}
            termino={texto.trim()}
            onElegir={(s) => registrarIngreso(s.documento)}
            onLimpiar={limpiar}
          />
        ) : mostrado ? (
          <Resultado
            resultado={mostrado}
            delMolinete={vieneDelMolinete}
            onForzar={() => registrarIngreso(mostrado.socio?.documento, true)}
            onLimpiar={limpiar}
          />
        ) : (
          !error && (
            <div className="tarjeta grid place-items-center px-6 py-20 text-center text-texto-tenue">
              <p className="text-[15px]">Esperando…</p>
              <p className="mt-1 text-[13px]">
                Apoyá el dedo en el molinete, o escribí una cédula o un nombre.
              </p>
            </div>
          )
        )}
      </div>

      <ModalVisita
        abierto={abrirVisita}
        onCerrar={() => setAbrirVisita(false)}
        onListo={(r) => {
          setAbrirVisita(false);
          setVisitaHecha(r);
          refrescarRegistros();
        }}
      />

      <aside className="space-y-4">
        <EstadoPuerta
          estado={puerta.datos}
          onSimulado={() => {
            refrescarPuerta();
            refrescarRegistros();
          }}
        />
        <Movimiento registros={registros.datos} />
      </aside>
    </div>
  );
}

/** Lista de socios que coinciden con un nombre. */
function Coincidencias({ socios, termino, onElegir, onLimpiar }) {
  if (!socios.length) {
    return (
      <div className="tarjeta px-6 py-14 text-center">
        <p className="text-[15px] text-texto-suave">
          No hay ningún socio que coincida con “{termino}”.
        </p>
        <button type="button" onClick={onLimpiar} className="btn-secundario mt-4">
          Probar otra vez
        </button>
      </div>
    );
  }

  return (
    <section className="tarjeta p-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold">
          {socios.length === 1 ? 'Un socio coincide' : `${socios.length} socios coinciden`}
        </h2>
        <button type="button" onClick={onLimpiar} className="btn-fantasma px-2 py-1 text-[12.5px]">
          Cancelar
        </button>
      </header>

      <ul className="space-y-1.5">
        {socios.map((s) => (
          <li key={s.socio_id}>
            <button
              type="button"
              onClick={() => onElegir(s)}
              className="flex w-full items-center gap-3 rounded-[9px] border border-borde bg-superficie-alta
                         px-3 py-2.5 text-left transition-colors duration-rapido ease-salida
                         hover:border-acento"
            >
              <FotoSocio socio={s} tam={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{s.nombre_completo}</p>
                <p className="text-[12px] text-texto-suave">
                  {s.codigo} · CI {s.documento}
                  {!s.activo && ' · dado de baja'}
                </p>
              </div>
              <InsigniaEstado estado={s.estado} dias={s.dias_restantes} />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[12px] text-texto-tenue">
        Tocá al socio para registrar su entrada.
      </p>
    </section>
  );
}

/** Estado del molinete, con el botón de simular cuando corresponde. */
function EstadoPuerta({ estado, onSimulado }) {
  const [huella, setHuella] = useState('');
  const [error, setError] = useState('');

  if (!estado) return null;

  if (!estado.activo) {
    return (
      <section className="tarjeta p-3.5">
        <p className="text-[13px] font-medium text-texto-suave">Molinete apagado</p>
        <p className="mt-1 text-[12px] text-texto-tenue">
          Los ingresos se registran a mano desde acá.
        </p>
      </section>
    );
  }

  const { nombre, estado: conexion, detalle } = estado.molinete ?? {};
  const conectado = conexion === 'CONECTADO';
  const simulable = nombre === 'simulado';

  async function simular(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/acceso/simular', { biometria_id: huella.trim() });
      setHuella('');
      onSimulado();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="tarjeta p-3.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-none rounded-full ${
            conectado ? 'bg-estado-bien' : 'bg-estado-critico'
          }`}
        />
        <p className="text-[13px] font-medium">
          Molinete {conectado ? 'conectado' : 'sin conexión'}
        </p>
        <span className="ml-auto text-[11.5px] uppercase tracking-wide text-texto-tenue">
          {nombre}
        </span>
      </div>

      {!conectado && detalle && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-texto-tenue">{detalle}</p>
      )}

      {simulable && (
        <form onSubmit={simular} className="mt-3 border-t border-borde pt-3">
          <p className="mb-1.5 text-[11.5px] text-texto-tenue">
            Molinete simulado: probá una lectura escribiendo un identificador.
          </p>
          <div className="flex gap-1.5">
            <input
              className="campo flex-1 py-1.5 text-[13px]"
              value={huella}
              onChange={(e) => setHuella(e.target.value)}
              placeholder="Ej. SIM-001"
              maxLength={64}
            />
            <button type="submit" className="btn-secundario px-3 py-1.5 text-[12.5px]" disabled={!huella.trim()}>
              Leer
            </button>
          </div>
          {error && <p className="mt-1.5 text-[11.5px] text-estado-critico">{error}</p>}
        </form>
      )}
    </section>
  );
}

/** Lo que va pasando en la puerta: entradas y rechazos. */
function Movimiento({ registros }) {
  const hora = (v) =>
    new Date(v).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[14.5px] font-semibold">Movimiento de la puerta</h2>
        <span className="text-[12.5px] tabular-nums text-texto-suave">
          {registros?.length ?? 0}
        </span>
      </div>

      {registros?.length ? (
        <ul className="space-y-1.5">
          {registros.map((a) => {
            const fila = (
              <>
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${
                    a.permitido ? 'bg-estado-bien' : 'bg-estado-critico'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {a.nombre_completo ??
                      a.visitante ??
                      (a.motivo === 'NO_RECONOCIDO' ? 'Huella no reconocida' : 'Socio eliminado')}
                  </p>
                  <p className="text-[11px] text-texto-tenue">
                    {hora(a.ocurrido_en)}
                    {' · '}
                    {a.permitido ? (a.forzado ? 'dejado pasar' : 'entró') : MOTIVO_CORTO[a.motivo] ?? a.motivo}
                    {a.origen === 'MOSTRADOR' && ' · mostrador'}
                  </p>
                </div>
              </>
            );

            return (
              <li key={a.id}>
                {a.socio_id ? (
                  <Link
                    to={`/admin/socios/${a.socio_id}`}
                    className="flex items-start gap-2.5 rounded-[9px] border border-borde bg-superficie px-3 py-2
                               transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
                  >
                    {fila}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-[9px] border border-borde bg-superficie px-3 py-2">
                    {fila}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tarjeta px-4 py-8 text-center text-[13px] text-texto-suave">
          Todavía no pasó nadie.
        </p>
      )}
    </div>
  );
}

const MOTIVO_CORTO = {
  VENCIDO: 'vencido',
  SIN_MEMBRESIA: 'sin plan',
  INACTIVO: 'dado de baja',
  NO_RECONOCIDO: 'no reconocido',
  VISITA: 'visita',
  DIA_DE_PRUEBA: 'día de prueba',
};

/**
 * Cuánto falta para el cumpleaños del socio.
 *
 * Solo se muestra si está cerca: un "faltan 247 días" no le sirve a nadie en
 * el mostrador y le saca lugar a lo que sí importa.
 */
function Cumpleanos({ dias }) {
  if (dias == null || dias > 7) return null;

  const texto =
    dias === 0 ? '¡Hoy es su cumpleaños!'
    : dias === 1 ? 'Cumple años mañana'
    : `Cumple años en ${dias} días`;

  return (
    <p
      className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium ${
        dias === 0
          ? 'border-acento/50 bg-acento/10 text-acento'
          : 'border-borde bg-superficie-alta text-texto-suave'
      }`}
    >
      <span aria-hidden="true">🎂</span>
      {texto}
    </p>
  );
}

/** Deja pasar a alguien que no es socio: una visita o un día de prueba. */
function ModalVisita({ abierto, onCerrar, onListo }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('DIA_DE_PRUEBA');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await api.post('/api/acceso/visita', { nombre: nombre.trim(), tipo, nota: nota.trim() });
      setNombre('');
      setNota('');
      onListo(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Dejar pasar" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-[13px] text-texto-suave">
          Para alguien que no es socio. Queda registrado con su nombre, así después se puede
          ver cuántas visitas y cuántos días de prueba hubo.
        </p>

        <Campo etiqueta="Nombre" requerido>
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            maxLength={120}
            required
            autoFocus
          />
        </Campo>

        <Campo etiqueta="Motivo">
          <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="DIA_DE_PRUEBA">Día de prueba</option>
            <option value="VISITA">Visita</option>
          </select>
        </Campo>

        <Campo etiqueta="Nota" hint="Opcional. Quién lo trajo, si dejó teléfono…">
          <input
            className="campo"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={200}
          />
        </Campo>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando || !nombre.trim()}>
            {enviando ? 'Registrando…' : 'Dejar pasar'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Resultado({ resultado, delMolinete, onForzar, onLimpiar }) {
  const { socio, permitido, registrado, forzado, mensaje, motivo } = resultado;

  // El evento del molinete trae `abrio`; el del mostrador, `registrado`.
  const entro = permitido && (resultado.abrio ?? true);

  const borde = entro ? (forzado ? 'border-estado-aviso' : 'border-estado-bien') : 'border-estado-critico';
  const tinta = entro ? (forzado ? 'text-estado-aviso' : 'text-estado-bien') : 'text-estado-critico';

  return (
    <section className={`tarjeta border-2 p-5 ${borde}`}>
      {delMolinete && (
        <p className="mb-3 text-[11.5px] uppercase tracking-wide text-texto-tenue">
          Molinete · {new Date(resultado.ocurrido_en).toLocaleTimeString('es-PY', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}

      {socio ? (
        <div className="flex items-start gap-4">
          <FotoSocio socio={socio} tam={88} />
          <div className="min-w-0 flex-1">
            <p className={`mb-1 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide ${tinta}`}>
              <span aria-hidden="true">{entro ? (forzado ? '▲' : '●') : '■'}</span>
              {entro
                ? forzado
                  ? 'Pasó con la membresía vencida'
                  : 'Acceso autorizado'
                : 'Acceso denegado'}
            </p>
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">
              {socio.nombre_completo}
            </h2>
            <p className="mt-1 text-[13.5px] text-texto-suave">
              {socio.codigo} · CI {socio.documento}
              {socio.telefono ? ` · ${socio.telefono}` : ''}
            </p>
            <Cumpleanos dias={socio.dias_cumple} />
          </div>
          <InsigniaEstado estado={socio.estado} dias={socio.dias_restantes} className="flex-none" />
        </div>
      ) : (
        <div>
          <p className={`mb-1 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide ${tinta}`}>
            <span aria-hidden="true">■</span> Acceso denegado
          </p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">
            Huella no reconocida
          </h2>
          {resultado.biometria_id && (
            <p className="mt-1 text-[13.5px] text-texto-suave">
              Identificador leído: {resultado.biometria_id}
            </p>
          )}
        </div>
      )}

      {socio && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-texto-tenue">Plan</dt>
            <dd className="mt-0.5 text-[14px] font-medium">{socio.plan ?? 'Sin plan'}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-texto-tenue">Vence</dt>
            <dd className="mt-0.5 text-[14px] font-medium">
              {socio.fecha_fin ? fecha(socio.fecha_fin) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-texto-tenue">Asistencia</dt>
            <dd className="mt-0.5 text-[14px] font-medium">
              {(resultado.asistencia_registrada ?? registrado) ? 'Registrada' : 'Ya estaba'}
            </dd>
          </div>
        </dl>
      )}

      <p className={`mt-4 text-[15px] font-medium ${tinta}`}>{mensaje}</p>

      {resultado.error_puerta && (
        <Aviso tipo="error" className="mt-3">
          Se autorizó el acceso pero el molinete no abrió: {resultado.error_puerta}
        </Aviso>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!entro && socio && (
          <>
            <Link to={`/admin/socios/${socio.socio_id}`} className="btn-primario">
              Cobrar y renovar
            </Link>
            {/* A un socio dado de baja no se lo deja pasar desde acá: primero
                hay que reactivarlo, que es una decisión de otro tipo. */}
            {motivo !== 'INACTIVO' && (
              <button type="button" onClick={onForzar} className="btn-secundario">
                Dejar pasar igual
              </button>
            )}
            <BotonWhatsApp socio={socio} texto="Avisarle por WhatsApp" />
          </>
        )}
        {entro && socio && (
          <Link to={`/admin/socios/${socio.socio_id}`} className="btn-secundario">
            Ver ficha
          </Link>
        )}
        <button type="button" onClick={onLimpiar} className="btn-fantasma">
          Siguiente
        </button>
      </div>
    </section>
  );
}
