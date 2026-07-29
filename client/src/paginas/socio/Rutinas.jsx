import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api, fecha, media } from '../../api.js';
import { BuscadorEjercicios } from '../../componentes/BuscadorEjercicios.jsx';
import { Aviso, Campo, Cargando, Modal, Vacio } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

export function Rutinas() {
  const { datos: rutinas, error, cargando, refrescar } = useDatos('/api/rutinas');
  const [creando, setCreando] = useState(false);

  if (cargando) return <Cargando texto="Cargando tus rutinas…" />;
  if (error) return <Aviso tipo="error">{error.message}</Aviso>;

  const delProfe = (rutinas ?? []).filter((r) => r.origen === 'PROFE');
  const mias = (rutinas ?? []).filter((r) => r.origen === 'SOCIO');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mis rutinas</h1>
        <button type="button" onClick={() => setCreando(true)} className="btn-primario">
          + Crear rutina
        </button>
      </header>

      {!rutinas?.length && (
        <Vacio
          titulo="Todavía no tenés ninguna rutina"
          detalle="Podés esperar a que el profe te arme una, o armarte la tuya eligiendo ejercicios del catálogo."
          accion={
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreando(true)} className="btn-primario">
                Crear la mía
              </button>
              <Link to="/ejercicios" className="btn-secundario">Ver ejercicios</Link>
            </div>
          }
        />
      )}

      {delProfe.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-texto-tenue">
            Del profe
          </h2>
          {delProfe.map((r) => (
            <DetalleRutina key={r.id} cabecera={r} editable={false} onCambio={refrescar} />
          ))}
        </section>
      )}

      {mias.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-texto-tenue">
            Armadas por vos
          </h2>
          {mias.map((r) => (
            <DetalleRutina key={r.id} cabecera={r} editable onCambio={refrescar} />
          ))}
        </section>
      )}

      <NuevaRutina
        abierto={creando}
        onCerrar={() => setCreando(false)}
        onCreada={() => { setCreando(false); refrescar(); }}
      />
    </div>
  );
}

function NuevaRutina({ abierto, onCerrar, onCreada }) {
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [dias, setDias] = useState(3);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      await api.post('/api/rutinas/propia', {
        nombre,
        objetivo,
        dias: Array.from({ length: dias }, (_, i) => `Día ${i + 1}`),
      });
      setNombre(''); setObjetivo(''); setDias(3);
      onCreada();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Nueva rutina" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre" requerido>
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Mi rutina de fuerza"
            required
            autoFocus
          />
        </Campo>
        <Campo etiqueta="Objetivo">
          <input
            className="campo"
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Hipertrofia, resistencia…"
          />
        </Campo>
        <Campo etiqueta="¿Cuántos días?" hint="Después podés agregar o quitar.">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                aria-pressed={dias === n}
                className={dias === n ? 'btn-primario flex-1 py-2' : 'btn-secundario flex-1 py-2'}
              >
                {n}
              </button>
            ))}
          </div>
        </Campo>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Creando…' : 'Crear rutina'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function DetalleRutina({ cabecera, editable, onCambio }) {
  const { datos: rutina, cargando, refrescar } = useDatos(`/api/rutinas/${cabecera.id}`);
  const [error, setError] = useState('');
  const [agregandoDia, setAgregandoDia] = useState(false);
  const [etiquetaDia, setEtiquetaDia] = useState('');
  // Día al que se le están sumando ejercicios desde el buscador.
  const [diaAbierto, setDiaAbierto] = useState(null);

  async function accion(fn) {
    setError('');
    try {
      await fn();
      refrescar();
      onCambio?.();
    } catch (e) {
      setError(e.message);
    }
  }

  const quitarEjercicio = (filaId) =>
    accion(() => api.del(`/api/rutinas/ejercicios/${filaId}`));

  const quitarDia = (diaId, etiqueta) => {
    if (!confirm(`¿Eliminar "${etiqueta}" con todos sus ejercicios?`)) return;
    accion(() => api.del(`/api/rutinas/dias/${diaId}`));
  };

  const eliminarRutina = () => {
    if (!confirm(`¿Eliminar la rutina "${cabecera.nombre}"? No se puede deshacer.`)) return;
    accion(() => api.del(`/api/rutinas/${cabecera.id}`));
  };

  const agregarDia = () =>
    accion(async () => {
      await api.post(`/api/rutinas/${cabecera.id}/dias`, { etiqueta: etiquetaDia });
      setAgregandoDia(false);
      setEtiquetaDia('');
    });

  return (
    <section className={`tarjeta p-4 ${cabecera.activa ? '' : 'opacity-60'}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{cabecera.nombre}</h3>
          <p className="mt-0.5 text-[12.5px] text-texto-suave">
            {cabecera.objetivo ? `${cabecera.objetivo} · ` : ''}
            {cabecera.dias} {cabecera.dias === 1 ? 'día' : 'días'} · desde {fecha(cabecera.fecha_inicio)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editable && (
            <span className="rounded-full border border-borde bg-superficie-alta px-2.5 py-1 text-[11.5px] text-texto-suave">
              Solo lectura
            </span>
          )}
          {!cabecera.activa && (
            <span className="rounded-full border border-borde bg-superficie-alta px-2.5 py-1 text-[11.5px] text-texto-tenue">
              Archivada
            </span>
          )}
          {editable && (
            <button type="button" onClick={eliminarRutina} className="btn-peligro px-2.5 py-1 text-[12px]">
              Eliminar
            </button>
          )}
        </div>
      </header>

      {cabecera.descripcion && (
        <p className="mb-3 text-[13.5px] leading-relaxed text-texto-suave">{cabecera.descripcion}</p>
      )}

      {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}

      {cargando ? (
        <Cargando />
      ) : (
        <div className="space-y-4">
          {rutina?.dias?.map((d) => (
            <div key={d.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[14.5px] font-semibold">{d.etiqueta}</h4>
                <div className="flex gap-2">
                  {cabecera.activa && d.ejercicios.length > 0 && (
                    <Link to={`/entrenar/${d.id}`} className="btn-primario px-3 py-1.5 text-[13px]">
                      Entrenar
                    </Link>
                  )}
                  {editable && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDiaAbierto(d)}
                        className="btn-secundario px-3 py-1.5 text-[13px]"
                      >
                        + Ejercicio
                      </button>
                      <button
                        type="button"
                        onClick={() => quitarDia(d.id, d.etiqueta)}
                        className="btn-fantasma px-2 py-1.5 text-[12.5px] text-estado-critico"
                      >
                        Quitar día
                      </button>
                    </>
                  )}
                </div>
              </div>
              {d.nota && <p className="mb-2 text-[12.5px] text-texto-tenue">{d.nota}</p>}

              {d.ejercicios.length === 0 ? (
                <div className="rounded-[9px] border border-dashed border-borde-fuerte px-3 py-5 text-center">
                  <p className="text-[12.5px] text-texto-tenue">Este día está vacío.</p>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setDiaAbierto(d)}
                      className="btn-primario mt-2.5 px-3 py-1.5 text-[13px]"
                    >
                      + Agregar el primer ejercicio
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {d.ejercicios.map((ej) => (
                    <li key={ej.id} className="flex items-center gap-2">
                      <Link
                        to={`/ejercicios/${ej.codigo}`}
                        className="flex flex-1 items-center gap-3 rounded-[9px] border border-borde bg-superficie-alta p-2
                                   transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
                      >
                        <img
                          src={media(ej.imagen)}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 flex-none rounded-[7px] bg-white object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium">{ej.nombre}</p>
                          <p className="text-[11.5px] text-texto-suave">
                            {ej.musculo} · {ej.equipo}
                          </p>
                        </div>
                        <div className="flex-none text-right">
                          <p className="text-[13.5px] font-semibold tabular-nums">
                            {ej.series} × {ej.repeticiones}
                          </p>
                          {ej.peso_sugerido != null && (
                            <p className="text-[11.5px] tabular-nums text-texto-tenue">
                              {ej.peso_sugerido} kg
                            </p>
                          )}
                        </div>
                      </Link>

                      {editable && (
                        <button
                          type="button"
                          onClick={() => quitarEjercicio(ej.id)}
                          aria-label={`Quitar ${ej.nombre}`}
                          className="btn-fantasma flex-none px-2 py-2 text-estado-critico"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {editable && (
            agregandoDia ? (
              <div className="flex gap-2">
                <input
                  className="campo flex-1 py-2 text-[13px]"
                  value={etiquetaDia}
                  onChange={(e) => setEtiquetaDia(e.target.value)}
                  placeholder={`Día ${(rutina?.dias?.length ?? 0) + 1}`}
                  autoFocus
                />
                <button type="button" onClick={agregarDia} className="btn-primario px-3 py-2 text-[13px]">
                  Agregar
                </button>
                <button type="button" onClick={() => setAgregandoDia(false)} className="btn-fantasma px-2">
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEtiquetaDia(`Día ${(rutina?.dias?.length ?? 0) + 1}`);
                  setAgregandoDia(true);
                }}
                className="btn-secundario w-full"
              >
                + Agregar día
              </button>
            )
          )}
        </div>
      )}

      <BuscadorEjercicios
        abierto={diaAbierto !== null}
        titulo={`Agregar a ${diaAbierto?.etiqueta ?? ''}`}
        subtitulo={`Se suman al final de ${diaAbierto?.etiqueta ?? 'este día'}. Podés cargar varios seguidos.`}
        yaElegidos={diaAbierto?.ejercicios?.map((e) => e.codigo) ?? []}
        onElegir={async (ej) => {
          await api.post(`/api/rutinas/dias/${diaAbierto.id}/ejercicios`, { codigo: ej.codigo });
          const fresca = await api.get(`/api/rutinas/${cabecera.id}`);
          setDiaAbierto(fresca.dias.find((d) => d.id === diaAbierto.id) ?? diaAbierto);
          refrescar();
          onCambio?.();
        }}
        onCerrar={() => setDiaAbierto(null)}
      />
    </section>
  );
}
