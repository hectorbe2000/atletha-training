import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { api, media, qs } from '../../api.js';
import { BuscadorEjercicios } from '../../componentes/BuscadorEjercicios.jsx';
import { Aviso, Campo, Cargando, Modal, Vacio } from '../../componentes/ui.jsx';
import { useDatos, useRetraso } from '../../hooks.js';

const diaVacio = (n) => ({ etiqueta: `Día ${String.fromCharCode(64 + n)}`, nota: '', ejercicios: [] });

/**
 * Armador de rutinas. Usa la disposición densa de la card para
 * el catálogo: acá el que decide es el profe y necesita ver datos, no mirar
 * la animación.
 */
export function ArmarRutina() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const editando = Boolean(id);

  const { datos: existente, cargando } = useDatos(editando ? `/api/rutinas/${id}` : null, {
    activo: editando,
  });

  const [socioId, setSocioId] = useState(params.get('socio') ?? '');
  const [nombre, setNombre] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activa, setActiva] = useState(true);
  const [dias, setDias] = useState([diaVacio(1)]);

  const [diaAbierto, setDiaAbierto] = useState(null); // índice del día al que se agregan ejercicios
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function eliminarRutina() {
    if (!confirm(`¿Eliminar la rutina "${nombre}"? Se borran sus días y ejercicios. No se puede deshacer.`)) return;
    setError('');
    try {
      await api.del(`/api/rutinas/${id}`);
      navegar(socioId ? `/admin/socios/${socioId}` : '/admin/rutinas');
    } catch (e) {
      setError(e.message);
    }
  }

  // Carga la rutina existente en el formulario.
  useEffect(() => {
    if (!existente) return;
    setSocioId(String(existente.socio_id));
    setNombre(existente.nombre);
    setObjetivo(existente.objetivo ?? '');
    setDescripcion(existente.descripcion ?? '');
    setActiva(existente.activa);
    setDias(
      existente.dias.map((d) => ({
        etiqueta: d.etiqueta,
        nota: d.nota ?? '',
        ejercicios: d.ejercicios.map((e) => ({
          codigo: e.codigo,
          nombre: e.nombre,
          imagen: e.imagen,
          musculo: e.musculo,
          equipo: e.equipo,
          series: e.series,
          repeticiones: e.repeticiones,
          peso_sugerido: e.peso_sugerido ?? '',
          descanso_seg: e.descanso_seg ?? 60,
          nota: e.nota ?? '',
        })),
      }))
    );
  }, [existente]);

  const totalEjercicios = dias.reduce((n, d) => n + d.ejercicios.length, 0);

  function actualizarDia(i, cambios) {
    setDias((ds) => ds.map((d, n) => (n === i ? { ...d, ...cambios } : d)));
  }

  function agregarEjercicio(indiceDia, ejercicio) {
    setDias((ds) =>
      ds.map((d, n) =>
        n !== indiceDia || d.ejercicios.some((e) => e.codigo === ejercicio.codigo)
          ? d
          : {
              ...d,
              ejercicios: [
                ...d.ejercicios,
                {
                  codigo: ejercicio.codigo,
                  nombre: ejercicio.nombre,
                  imagen: ejercicio.imagen,
                  musculo: ejercicio.musculo,
                  equipo: ejercicio.equipo,
                  series: 3,
                  repeticiones: '10',
                  peso_sugerido: '',
                  descanso_seg: 60,
                  nota: '',
                },
              ],
            }
      )
    );
  }

  function moverEjercicio(indiceDia, desde, hacia) {
    setDias((ds) =>
      ds.map((d, n) => {
        if (n !== indiceDia) return d;
        if (hacia < 0 || hacia >= d.ejercicios.length) return d;
        const lista = [...d.ejercicios];
        const [movido] = lista.splice(desde, 1);
        lista.splice(hacia, 0, movido);
        return { ...d, ejercicios: lista };
      })
    );
  }

  async function guardar(e) {
    e.preventDefault();
    setError('');

    if (!socioId) return setError('Elegí a qué socio se le asigna la rutina.');
    if (dias.some((d) => d.ejercicios.length === 0)) {
      return setError('Cada día tiene que tener al menos un ejercicio.');
    }

    setGuardando(true);
    const cuerpo = {
      socio_id: Number(socioId),
      nombre,
      objetivo,
      descripcion,
      activa,
      dias: dias.map((d) => ({
        etiqueta: d.etiqueta,
        nota: d.nota,
        ejercicios: d.ejercicios.map((ej) => ({
          codigo: ej.codigo,
          series: Number(ej.series) || 1,
          repeticiones: String(ej.repeticiones || '10'),
          peso_sugerido: ej.peso_sugerido === '' ? null : Number(ej.peso_sugerido),
          descanso_seg: Number(ej.descanso_seg) || 0,
          nota: ej.nota,
        })),
      })),
    };

    try {
      const r = editando
        ? await api.put(`/api/rutinas/${id}`, cuerpo)
        : await api.post('/api/rutinas', cuerpo);
      navegar(`/admin/socios/${r.socio_id}`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  if (editando && cargando) return <Cargando texto="Cargando la rutina…" />;

  return (
    <form onSubmit={guardar} className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {editando ? 'Editar rutina' : 'Armar rutina'}
        </h1>
        <p className="text-[13px] tabular-nums text-texto-suave">
          {dias.length} {dias.length === 1 ? 'día' : 'días'} · {totalEjercicios} ejercicios
        </p>
      </header>

      <section className="tarjeta space-y-3 p-4">
        <SelectorSocio valor={socioId} onCambio={setSocioId} bloqueado={editando} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre de la rutina" requerido>
            <input
              className="campo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Full body inicial"
              required
            />
          </Campo>
          <Campo etiqueta="Objetivo">
            <input
              className="campo"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder="Hipertrofia, adaptación, fuerza…"
            />
          </Campo>
        </div>

        <Campo etiqueta="Notas generales">
          <textarea
            className="campo min-h-[64px]"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Indicaciones que el socio va a ver en su rutina."
          />
        </Campo>

        <label className="flex cursor-pointer items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
            className="h-4 w-4 accent-[#c9f24d]"
          />
          Rutina activa (el socio la ve en su app)
        </label>
      </section>

      {dias.map((dia, i) => (
        <section key={i} className="tarjeta p-4">
          <header className="mb-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <Campo etiqueta={`Día ${i + 1}`}>
                <input
                  className="campo"
                  value={dia.etiqueta}
                  onChange={(e) => actualizarDia(i, { etiqueta: e.target.value })}
                  placeholder="Día A · Pecho y tríceps"
                />
              </Campo>
            </div>
            {dias.length > 1 && (
              <button
                type="button"
                onClick={() => setDias((ds) => ds.filter((_, n) => n !== i))}
                className="btn-peligro px-3 py-2 text-[13px]"
              >
                Quitar día
              </button>
            )}
          </header>

          <Campo etiqueta="Nota del día">
            <input
              className="campo"
              value={dia.nota}
              onChange={(e) => actualizarDia(i, { nota: e.target.value })}
              placeholder="Calentar 10 minutos antes de empezar."
            />
          </Campo>

          <div className="mt-3 space-y-2">
            {dia.ejercicios.map((ej, j) => (
              <div key={ej.codigo} className="rounded-xl2 border border-borde bg-superficie-alta p-2.5">
                <div className="flex items-center gap-3">
                  <img src={media(ej.imagen)} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-[7px] bg-white object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">{ej.nombre}</p>
                    <p className="text-[11.5px] text-texto-suave">{ej.musculo} · {ej.equipo}</p>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button type="button" onClick={() => moverEjercicio(i, j, j - 1)} disabled={j === 0}
                            className="btn-fantasma px-2 py-1" aria-label="Subir">↑</button>
                    <button type="button" onClick={() => moverEjercicio(i, j, j + 1)} disabled={j === dia.ejercicios.length - 1}
                            className="btn-fantasma px-2 py-1" aria-label="Bajar">↓</button>
                    <button
                      type="button"
                      onClick={() => actualizarDia(i, { ejercicios: dia.ejercicios.filter((_, n) => n !== j) })}
                      className="btn-fantasma px-2 py-1 text-estado-critico"
                      aria-label={`Quitar ${ej.nombre}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Series', 'series', 'number', '3'],
                    ['Reps', 'repeticiones', 'text', '8-12'],
                    ['Peso kg', 'peso_sugerido', 'number', 'opcional'],
                    ['Pausa s', 'descanso_seg', 'number', '60'],
                  ].map(([etiqueta, clave, tipo, ph]) => (
                    <label key={clave} className="block">
                      <span className="mb-1 block text-[11px] text-texto-tenue">{etiqueta}</span>
                      <input
                        type={tipo}
                        min={tipo === 'number' ? '0' : undefined}
                        className="campo py-1.5 text-[13px] tabular-nums"
                        value={ej[clave]}
                        placeholder={ph}
                        onChange={(e) =>
                          actualizarDia(i, {
                            ejercicios: dia.ejercicios.map((x, n) =>
                              n === j ? { ...x, [clave]: e.target.value } : x
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

                <input
                  className="campo mt-2 py-1.5 text-[13px]"
                  value={ej.nota}
                  placeholder="Nota para este ejercicio (opcional)"
                  onChange={(e) =>
                    actualizarDia(i, {
                      ejercicios: dia.ejercicios.map((x, n) => (n === j ? { ...x, nota: e.target.value } : x)),
                    })
                  }
                />
              </div>
            ))}

            {dia.ejercicios.length === 0 && (
              <p className="rounded-[9px] border border-dashed border-borde-fuerte px-3 py-6 text-center text-[13px] text-texto-tenue">
                Este día todavía no tiene ejercicios.
              </p>
            )}

            <button type="button" onClick={() => setDiaAbierto(i)} className="btn-secundario w-full">
              + Agregar ejercicios a {dia.etiqueta || `Día ${i + 1}`}
            </button>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={() => setDias((ds) => [...ds, diaVacio(ds.length + 1)])}
        disabled={dias.length >= 7}
        className="btn-secundario w-full"
      >
        + Agregar otro día
      </button>

      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="sticky bottom-20 flex gap-2 md:bottom-4">
        <button type="submit" className="btn-primario flex-1 py-3" disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear rutina'}
        </button>
        <button type="button" onClick={() => navegar(-1)} className="btn-secundario">
          Cancelar
        </button>
      </div>

      {editando && (
        <section className="tarjeta border-estado-critico/30 p-4">
          <h2 className="text-[14px] font-semibold">Eliminar esta rutina</h2>
          <p className="mt-1 text-[12.5px] text-texto-suave">
            Se borran sus días y ejercicios. Los entrenamientos que el socio ya registró se
            conservan, pero pierden la referencia al día de la rutina. Si solo querés que deje
            de verla, desmarcá “Rutina activa” arriba y guardá: así queda archivada.
          </p>
          <button type="button" onClick={eliminarRutina} className="btn-peligro mt-3">
            Eliminar rutina
          </button>
        </section>
      )}

      <BuscadorEjercicios
        abierto={diaAbierto !== null}
        titulo={`Agregar a ${diaAbierto !== null ? dias[diaAbierto].etiqueta : ''}`}
        yaElegidos={diaAbierto !== null ? dias[diaAbierto].ejercicios.map((e) => e.codigo) : []}
        onElegir={(ej) => agregarEjercicio(diaAbierto, ej)}
        onCerrar={() => setDiaAbierto(null)}
      />
    </form>
  );
}

function SelectorSocio({ valor, onCambio, bloqueado }) {
  const [buscar, setBuscar] = useState('');
  const retrasado = useRetraso(buscar, 300);
  const { datos } = useDatos(`/api/socios${qs({ buscar: retrasado, limite: 8 })}`, { activo: !bloqueado });
  const { datos: elegido } = useDatos(valor ? `/api/socios/${valor}` : null, { activo: Boolean(valor) });

  if (valor && (bloqueado || !buscar)) {
    return (
      <Campo etiqueta="Socio">
        <div className="flex items-center gap-3 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{elegido?.socio?.nombre_completo ?? 'Cargando…'}</p>
            <p className="text-[11.5px] text-texto-suave">
              {elegido?.socio?.codigo} · CI {elegido?.socio?.documento}
            </p>
          </div>
          {!bloqueado && (
            <button type="button" onClick={() => { onCambio(''); setBuscar(''); }} className="btn-fantasma px-2 py-1 text-[12.5px]">
              Cambiar
            </button>
          )}
        </div>
      </Campo>
    );
  }

  return (
    <Campo etiqueta="Socio" requerido hint="Buscá por nombre, cédula o código.">
      <input
        className="campo"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar socio…"
      />
      {buscar && (
        <ul className="mt-2 space-y-1">
          {datos?.datos?.length ? (
            datos.datos.map((s) => (
              <li key={s.socio_id}>
                <button
                  type="button"
                  onClick={() => { onCambio(String(s.socio_id)); setBuscar(''); }}
                  className="w-full rounded-[9px] border border-borde bg-superficie-alta px-3 py-2 text-left
                             transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
                >
                  <span className="block text-[13.5px] font-medium">{s.nombre_completo}</span>
                  <span className="block text-[11.5px] text-texto-suave">{s.codigo} · CI {s.documento}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-[13px] text-texto-tenue">Ningún socio coincide.</li>
          )}
        </ul>
      )}
    </Campo>
  );
}
