import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, media, numero } from '../../api.js';
import { BarraDescanso, useDescanso } from '../../componentes/Descanso.jsx';
import { Aviso, Cargando, Modal } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

const sinMovimiento =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Registro de entrenamiento. Pensada para usarse con una mano, de pie y
 * entre series: objetivos grandes, teclado numérico, y cada serie se guarda
 * sola apenas se marca.
 */
export function Entrenar() {
  const { diaId } = useParams();
  const navegar = useNavigate();

  const { datos: dia, error, cargando } = useDatos(`/api/rutinas/dia/${diaId}`);
  const [sesion, setSesion] = useState(null);
  const [series, setSeries] = useState({}); // `${codigo}-${n}` -> { peso, reps, guardada }
  const [errorGuardado, setErrorGuardado] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const descanso = useDescanso();

  // Abre (o retoma) la sesión del día en cuanto se conoce el día de rutina.
  useEffect(() => {
    if (!dia) return;
    let vivo = true;

    (async () => {
      try {
        const s = await api.post('/api/entrenamiento/sesiones', { rutina_dia_id: dia.id });

        // El servidor reutiliza la sesión que ya estaba abierta hoy. Sin
        // volver a pedir lo cargado, el socio que recarga la página o vuelve
        // a entrar veía 0 series y volumen 0 aunque estuviera todo guardado:
        // no tenía forma de saber por dónde iba.
        let cargadas = {};
        if (s.reutilizada) {
          const detalle = await api.get(`/api/entrenamiento/sesiones/${s.id}`);
          cargadas = Object.fromEntries(
            (detalle.series ?? []).map((sr) => [
              `${sr.codigo}-${sr.numero_serie}`,
              {
                peso: sr.peso ?? '',
                reps: sr.repeticiones ?? '',
                guardada: sr.completada,
              },
            ])
          );
        }

        if (!vivo) return;
        // Los dos juntos: las filas se montan con lo ya cargado adentro.
        setSeries(cargadas);
        setSesion(s);
      } catch (e) {
        if (vivo) setErrorGuardado(e.message);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [dia]);

  const total = useMemo(
    () => (dia?.ejercicios ?? []).reduce((n, e) => n + e.series, 0),
    [dia]
  );
  const hechas = Object.values(series).filter((s) => s.guardada).length;
  const volumen = Object.values(series)
    .filter((s) => s.guardada)
    .reduce((n, s) => n + (Number(s.peso) || 0) * (Number(s.reps) || 0), 0);

  async function guardarSerie(ejercicio, n, datos) {
    const clave = `${ejercicio.codigo}-${n}`;
    const yaEstaba = series[clave]?.guardada;

    setErrorGuardado('');
    setSeries((p) => ({ ...p, [clave]: { ...p[clave], ...datos, guardada: true } }));

    // El descanso arranca al marcar la serie, no al guardarla en el servidor:
    // el socio ya soltó la barra y el reloj tiene que correr desde ahí.
    // No se reinicia si solo está corrigiendo una serie ya cargada.
    if (!yaEstaba && n < ejercicio.series) {
      descanso.arrancar(ejercicio.descanso_seg, ejercicio.nombre);
    }

    try {
      await api.post(`/api/entrenamiento/sesiones/${sesion.id}/series`, {
        codigo: ejercicio.codigo,
        numero_serie: n,
        repeticiones: datos.reps === '' ? null : Number(datos.reps),
        peso: datos.peso === '' ? null : Number(datos.peso),
        completada: true,
      });
    } catch (e) {
      setErrorGuardado(e.message);
      setSeries((p) => ({ ...p, [clave]: { ...p[clave], guardada: false } }));
      descanso.cortar();
    }
  }

  async function finalizar(notas) {
    descanso.cortar();
    setCerrando(true);
    try {
      const r = await api.patch(`/api/entrenamiento/sesiones/${sesion.id}/finalizar`, { notas });
      setResultado(r);
    } catch (e) {
      setErrorGuardado(e.message);
      setCerrando(false);
    }
  }

  if (cargando) return <Cargando texto="Preparando el entrenamiento…" />;
  if (error) return <Aviso tipo="error">{error.message}</Aviso>;
  if (!dia) return null;
  // Se espera a tener la sesión para que las filas se monten con las series
  // ya registradas. Si la sesión no abre, se sigue de largo y las filas
  // quedan deshabilitadas con el error arriba.
  if (!sesion && !errorGuardado) return <Cargando texto="Abriendo la sesión…" />;

  return (
    <div className="pb-4">
      <button type="button" onClick={() => navegar(-1)} className="btn-fantasma mb-3 -ml-2 px-2 text-[13px]">
        ← Volver
      </button>

      <header className="mb-4">
        <p className="text-[12.5px] text-texto-suave">{dia.rutina}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{dia.etiqueta}</h1>
        {dia.nota && <p className="mt-1 text-[13.5px] text-texto-suave">{dia.nota}</p>}
      </header>

      {/* Progreso de la sesión, pegado arriba mientras se entrena */}
      <div className="sticky top-[57px] z-20 mb-4 rounded-xl2 border border-borde bg-superficie/95 p-3 backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="font-medium tabular-nums">
            {hechas} / {total} series
          </span>
          <span className="tabular-nums text-texto-suave">{numero(volumen)} kg</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-superficie-alta">
          <div
            className="h-full rounded-full bg-acento transition-[width] duration-medio ease-salida"
            style={{ width: total ? `${(hechas / total) * 100}%` : '0%' }}
            role="progressbar"
            aria-valuenow={hechas}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="Series completadas"
          />
        </div>
      </div>

      {errorGuardado && <Aviso tipo="error" className="mb-3">{errorGuardado}</Aviso>}

      <div className="space-y-3">
        {dia.ejercicios.map((ej) => (
          <BloqueEjercicio
            key={ej.id}
            ejercicio={ej}
            series={series}
            deshabilitado={!sesion}
            onGuardar={guardarSerie}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => finalizar(null)}
        disabled={!sesion || cerrando || hechas === 0}
        className="btn-primario mt-5 w-full py-3 text-[15px]"
      >
        {cerrando ? 'Cerrando…' : 'Terminar entrenamiento'}
      </button>
      {hechas === 0 && (
        <p className="mt-2 text-center text-[12px] text-texto-tenue">
          Marcá al menos una serie para poder cerrar la sesión.
        </p>
      )}

      <BarraDescanso
        segundos={descanso.segundos}
        total={descanso.total}
        etiqueta={descanso.etiqueta}
        onCortar={descanso.cortar}
        onSumar={descanso.sumar}
      />

      <Modal abierto={Boolean(resultado)} titulo="¡Entrenamiento terminado!" onCerrar={() => navegar('/progreso')}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Series', resultado?.series_completadas ?? 0],
              ['Repeticiones', resultado?.repeticiones ?? 0],
              ['Volumen', `${numero(resultado?.volumen_kg ?? 0)} kg`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[9px] border border-borde bg-superficie-alta px-2 py-3">
                <p className="text-[19px] font-semibold leading-none">{v}</p>
                <p className="mt-1.5 text-[11px] text-texto-tenue">{k}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Link to="/progreso" className="btn-primario flex-1">Ver mi progreso</Link>
            <Link to="/" className="btn-secundario flex-1">Volver al inicio</Link>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BloqueEjercicio({ ejercicio, series, onGuardar, deshabilitado }) {
  const filas = Array.from({ length: ejercicio.series }, (_, i) => i + 1);
  const [ampliado, setAmpliado] = useState(false);

  // Entre serie y serie el socio quiere ver el movimiento, no una foto.
  const miniatura = sinMovimiento ? ejercicio.imagen : ejercicio.gif;

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex items-center gap-3 border-b border-borde p-3">
        <button
          type="button"
          onClick={() => setAmpliado((v) => !v)}
          aria-expanded={ampliado}
          aria-label={ampliado ? 'Achicar la animación' : `Ver la animación de ${ejercicio.nombre}`}
          className="relative flex-none overflow-hidden rounded-[9px] transition-transform duration-rapido ease-salida active:scale-95"
        >
          <img
            src={media(miniatura)}
            alt=""
            loading="lazy"
            className="h-16 w-16 bg-white object-cover"
          />
          <span className="absolute inset-x-0 bottom-0 bg-black/55 py-[2px] text-center text-[9px] font-semibold uppercase tracking-wide text-white">
            {ampliado ? 'cerrar' : 'ver'}
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <Link
            to={`/ejercicios/${ejercicio.codigo}`}
            className="block truncate text-[14.5px] font-semibold leading-tight hover:text-acento"
          >
            {ejercicio.nombre}
          </Link>
          <p className="mt-0.5 text-[12px] text-texto-suave">
            {ejercicio.series} × {ejercicio.repeticiones}
            {ejercicio.descanso_seg ? ` · ${ejercicio.descanso_seg}s de pausa` : ''}
          </p>
          {ejercicio.ultimo_peso != null && (
            <p className="mt-0.5 text-[11.5px] text-texto-tenue">
              La última vez: {ejercicio.ultimo_peso} kg
            </p>
          )}
        </div>
      </div>

      {ampliado && (
        <div className="border-b border-borde bg-white">
          <img
            src={media(sinMovimiento ? ejercicio.imagen : ejercicio.gif)}
            alt={ejercicio.nombre}
            className="mx-auto max-h-[320px] w-auto"
          />
        </div>
      )}

      {ejercicio.nota && (
        <p className="border-b border-borde bg-superficie-alta px-3 py-2 text-[12.5px] text-texto-suave">
          {ejercicio.nota}
        </p>
      )}

      <div className="divide-y divide-borde">
        {filas.map((n) => (
          <FilaSerie
            key={n}
            numero={n}
            ejercicio={ejercicio}
            estado={series[`${ejercicio.codigo}-${n}`]}
            deshabilitado={deshabilitado}
            onGuardar={onGuardar}
          />
        ))}
      </div>
    </section>
  );
}

function FilaSerie({ numero: n, ejercicio, estado, onGuardar, deshabilitado }) {
  const sugeridoPeso = ejercicio.ultimo_peso ?? ejercicio.peso_sugerido ?? '';
  const sugeridoReps = /^\d+$/.test(ejercicio.repeticiones) ? ejercicio.repeticiones : '';

  // Si la serie ya estaba registrada (sesión retomada), manda lo que quedó
  // guardado; recién si no, la sugerencia.
  const [peso, setPeso] = useState(() => String(estado?.peso ?? sugeridoPeso ?? ''));
  const [reps, setReps] = useState(() => String(estado?.reps ?? sugeridoReps ?? ''));
  const refPeso = useRef(null);
  const guardada = Boolean(estado?.guardada);

  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${guardada ? 'bg-acento/[.06]' : ''}`}>
      <span className="w-5 flex-none text-[13px] tabular-nums text-texto-tenue">{n}</span>

      <label className="flex flex-1 items-center gap-1.5">
        <span className="sr-only">Peso de la serie {n} en kilos</span>
        <input
          ref={refPeso}
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          className="campo w-full py-2 text-center tabular-nums"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          placeholder="kg"
          disabled={deshabilitado}
        />
        <span className="text-[12px] text-texto-tenue">kg</span>
      </label>

      <span className="text-texto-tenue">×</span>

      <label className="flex flex-1 items-center gap-1.5">
        <span className="sr-only">Repeticiones de la serie {n}</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          className="campo w-full py-2 text-center tabular-nums"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          disabled={deshabilitado}
        />
        <span className="text-[12px] text-texto-tenue">rep</span>
      </label>

      <button
        type="button"
        onClick={() => onGuardar(ejercicio, n, { peso, reps })}
        disabled={deshabilitado}
        aria-pressed={guardada}
        aria-label={guardada ? `Serie ${n} registrada, tocar para corregir` : `Marcar serie ${n} como hecha`}
        className={`grid h-10 w-10 flex-none place-items-center rounded-[9px] border
                    transition-[transform,background-color,border-color,color] duration-rapido ease-salida active:scale-90
                    ${guardada
                      ? 'border-acento bg-acento text-acento-texto'
                      : 'border-borde bg-superficie-alta text-texto-suave hover:border-borde-fuerte hover:text-texto'}`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 12.5 5 5L20 6.5" />
        </svg>
      </button>
    </div>
  );
}
