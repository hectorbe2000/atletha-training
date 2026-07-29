import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, fecha } from '../../api.js';
import { BotonWhatsApp } from '../../componentes/BotonWhatsApp.jsx';
import { FotoSocio } from '../../componentes/FotoSocio.jsx';
import { Aviso, InsigniaEstado } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

/**
 * Pantalla de mostrador. Está abierta todo el día: se escribe la cédula,
 * Enter, y el resultado se ve de lejos. El foco vuelve solo al campo para
 * que la persona de recepción no tenga que tocar el mouse entre socio y socio.
 */
export function Ingreso() {
  const [documento, setDocumento] = useState('');
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef(null);

  const { datos: ingresos, refrescar } = useDatos('/api/socios/ingresos-hoy');

  const enfocar = () => campo.current?.focus();
  useEffect(enfocar, []);

  async function consultar(forzar = false) {
    const cedula = documento.trim();
    if (!cedula) return;

    setError('');
    setEnviando(true);
    try {
      const r = await api.post('/api/socios/ingreso', { documento: cedula, forzar });
      setResultado(r);
      if (r.registrado) {
        setDocumento('');
        refrescar();
      }
    } catch (e) {
      setError(e.message);
      setResultado(null);
    } finally {
      setEnviando(false);
      enfocar();
    }
  }

  function limpiar() {
    setResultado(null);
    setError('');
    setDocumento('');
    enfocar();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div>
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Ingreso</h1>
          <p className="mt-0.5 text-[13.5px] text-texto-suave">
            Escribí la cédula y presioná Enter.
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            consultar(false);
          }}
          className="mb-4 flex gap-2"
        >
          <input
            ref={campo}
            className="campo flex-1 py-4 text-center text-2xl tabular-nums tracking-widest"
            value={documento}
            onChange={(e) => {
              setDocumento(e.target.value.replace(/\D/g, ''));
              if (resultado) setResultado(null);
            }}
            inputMode="numeric"
            placeholder="0000000"
            maxLength={15}
            autoComplete="off"
            aria-label="Cédula del socio"
          />
          <button type="submit" className="btn-primario px-6" disabled={enviando || !documento}>
            {enviando ? '…' : 'Buscar'}
          </button>
        </form>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {resultado ? (
          <Resultado resultado={resultado} onForzar={() => consultar(true)} onLimpiar={limpiar} />
        ) : (
          !error && (
            <div className="tarjeta grid place-items-center px-6 py-20 text-center text-texto-tenue">
              <p className="text-[15px]">Esperando una cédula…</p>
              <p className="mt-1 text-[13px]">El resultado aparece acá.</p>
            </div>
          )
        )}
      </div>

      {/* Lo que va pasando hoy */}
      <aside>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[14.5px] font-semibold">Entraron hoy</h2>
          <span className="text-[12.5px] tabular-nums text-texto-suave">{ingresos?.length ?? 0}</span>
        </div>

        {ingresos?.length ? (
          <ul className="space-y-1.5">
            {ingresos.map((i) => (
              <li key={i.id}>
                <Link
                  to={`/admin/socios/${i.socio_id}`}
                  className="flex items-center gap-2.5 rounded-[9px] border border-borde bg-superficie px-3 py-2
                             transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{i.nombre_completo}</p>
                    <p className="text-[11px] text-texto-tenue">
                      {new Date(i.hora_entrada).toLocaleTimeString('es-PY', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {i.codigo}
                    </p>
                  </div>
                  {i.estado !== 'AL_DIA' && <InsigniaEstado estado={i.estado} />}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tarjeta px-4 py-8 text-center text-[13px] text-texto-suave">
            Todavía no entró nadie.
          </p>
        )}
      </aside>
    </div>
  );
}

function Resultado({ resultado, onForzar, onLimpiar }) {
  const { socio, permitido, registrado, forzado, mensaje } = resultado;

  const borde = permitido
    ? forzado
      ? 'border-estado-aviso'
      : 'border-estado-bien'
    : 'border-estado-critico';
  const tinta = permitido
    ? forzado
      ? 'text-estado-aviso'
      : 'text-estado-bien'
    : 'text-estado-critico';

  return (
    <section className={`tarjeta border-2 p-5 ${borde}`}>
      <div className="flex items-start gap-4">
        <FotoSocio socio={socio} tam={88} />
        <div className="min-w-0 flex-1">
          <p className={`mb-1 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide ${tinta}`}>
            <span aria-hidden="true">{permitido ? (forzado ? '▲' : '●') : '■'}</span>
            {permitido ? (forzado ? 'Pasó con la membresía vencida' : 'Puede pasar') : 'No puede pasar'}
          </p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">
            {socio.nombre_completo}
          </h2>
          <p className="mt-1 text-[13.5px] text-texto-suave">
            {socio.codigo} · CI {socio.documento}
            {socio.telefono ? ` · ${socio.telefono}` : ''}
          </p>
        </div>
        <InsigniaEstado estado={socio.estado} dias={socio.dias_restantes} className="flex-none" />
      </div>

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
            {registrado ? 'Registrada' : 'Ya estaba'}
          </dd>
        </div>
      </dl>

      <p className={`mt-4 text-[15px] font-medium ${tinta}`}>{mensaje}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {!permitido && (
          <>
            <Link to={`/admin/socios/${socio.socio_id}`} className="btn-primario">
              Cobrar y renovar
            </Link>
            <button type="button" onClick={onForzar} className="btn-secundario">
              Dejar pasar igual
            </button>
            <BotonWhatsApp socio={socio} texto="Avisarle por WhatsApp" />
          </>
        )}
        {permitido && (
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
