import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, media, qs } from '../../api.js';
import { BuscadorEjercicios } from '../../componentes/BuscadorEjercicios.jsx';
import { Aviso, Campo, Cargando, Modal, Vacio } from '../../componentes/ui.jsx';
import { useDatos, useRetraso } from '../../hooks.js';

const NIVELES = [
  ['', 'Sin nivel'],
  ['PRINCIPIANTE', 'Principiante'],
  ['INTERMEDIO', 'Intermedio'],
  ['AVANZADO', 'Avanzado'],
];

const nivelTexto = (n) => NIVELES.find(([v]) => v === n)?.[1] ?? '';

/**
 * Plantillas de rutina.
 *
 * Armar cada rutina desde cero lleva diez minutos. Acá se arma una vez y se
 * asigna en treinta segundos. Al asignarla se copia entera: desde ese momento
 * la rutina del socio y la plantilla son independientes, así que ajustarle los
 * pesos a alguien no le cambia la rutina a todos los demás.
 */
export function Plantillas() {
  const { datos: plantillas, cargando, refrescar } = useDatos('/api/plantillas?todas=true');
  const [editando, setEditando] = useState(null);
  const [asignando, setAsignando] = useState(null);
  const [error, setError] = useState('');

  async function accion(fn) {
    setError('');
    try {
      await fn();
      refrescar();
    } catch (e) {
      setError(e.message);
    }
  }

  const eliminar = (p) => {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"? Las rutinas ya asignadas no se tocan.`)) return;
    accion(() => api.del(`/api/plantillas/${p.id}`));
  };

  if (cargando) return <Cargando texto="Cargando plantillas…" />;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plantillas</h1>
          <p className="mt-0.5 text-[13px] text-texto-suave">
            Rutinas base para asignar rápido. Al asignarlas se copian, así que después las
            ajustás por socio sin tocar el original.
          </p>
        </div>
        <button type="button" onClick={() => setEditando({ nuevo: true })} className="btn-primario">
          + Nueva plantilla
        </button>
      </header>

      {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}

      {plantillas?.length ? (
        <ul className="space-y-2">
          {plantillas.map((p) => (
            <li
              key={p.id}
              className={`tarjeta flex flex-wrap items-center gap-3 p-3.5 ${p.activa ? '' : 'opacity-60'}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">
                  {p.nombre}
                  {p.nivel && (
                    <span className="ml-2 rounded-full border border-borde px-2 py-0.5 text-[10.5px] font-normal text-texto-suave">
                      {nivelTexto(p.nivel)}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12.5px] text-texto-suave">
                  {p.objetivo ? `${p.objetivo} · ` : ''}
                  {p.dias} {p.dias === 1 ? 'día' : 'días'} · {p.ejercicios} ejercicios
                </p>
              </div>
              <div className="flex flex-none flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAsignando(p)}
                  className="btn-primario px-3 py-1.5 text-[12.5px]"
                >
                  Asignar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(p)}
                  className="btn-secundario px-3 py-1.5 text-[12.5px]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => accion(() => api.patch(`/api/plantillas/${p.id}/activa`, { activa: !p.activa }))}
                  className="btn-fantasma px-2.5 py-1.5 text-[12.5px]"
                >
                  {p.activa ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(p)}
                  className="btn-fantasma px-2.5 py-1.5 text-[12.5px] text-estado-critico"
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Vacio
          titulo="Todavía no hay plantillas"
          detalle="Armá una rutina base una sola vez y después asignásela a quien quieras en dos toques."
          accion={
            <button type="button" onClick={() => setEditando({ nuevo: true })} className="btn-primario">
              + Nueva plantilla
            </button>
          }
        />
      )}

      {editando && (
        <EditorPlantilla
          plantilla={editando.nuevo ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={() => { setEditando(null); refrescar(); }}
        />
      )}

      {asignando && (
        <AsignarPlantilla
          plantilla={asignando}
          onCerrar={() => setAsignando(null)}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------
function EditorPlantilla({ plantilla, onCerrar, onGuardada }) {
  const { datos: completa, cargando } = useDatos(
    plantilla ? `/api/plantillas/${plantilla.id}` : null,
    { activo: Boolean(plantilla) }
  );

  const [form, setForm] = useState(null);
  const [diaAbierto, setDiaAbierto] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Se inicializa una vez: con la plantilla cargada, o vacía si es nueva.
  const estado =
    form ??
    (plantilla
      ? completa && {
          nombre: completa.nombre,
          descripcion: completa.descripcion ?? '',
          objetivo: completa.objetivo ?? '',
          nivel: completa.nivel ?? '',
          dias: completa.dias.map((d) => ({
            etiqueta: d.etiqueta,
            nota: d.nota ?? '',
            ejercicios: d.ejercicios.map((e) => ({ ...e })),
          })),
        }
      : { nombre: '', descripcion: '', objetivo: '', nivel: '', dias: [{ etiqueta: 'Día 1', nota: '', ejercicios: [] }] });

  const set = (k, v) => setForm({ ...estado, [k]: v });
  const setDia = (i, cambios) =>
    setForm({ ...estado, dias: estado.dias.map((d, n) => (n === i ? { ...d, ...cambios } : d)) });

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (estado.dias.some((d) => d.ejercicios.length === 0)) {
      return setError('Cada día tiene que tener al menos un ejercicio.');
    }
    setEnviando(true);
    try {
      const cuerpo = {
        nombre: estado.nombre,
        descripcion: estado.descripcion,
        objetivo: estado.objetivo,
        nivel: estado.nivel,
        dias: estado.dias.map((d) => ({
          etiqueta: d.etiqueta,
          nota: d.nota,
          ejercicios: d.ejercicios.map((ej) => ({
            codigo: ej.codigo,
            series: Number(ej.series) || 3,
            repeticiones: String(ej.repeticiones || '10'),
            descanso_seg: Number(ej.descanso_seg) || 60,
            nota: ej.nota ?? '',
          })),
        })),
      };
      if (plantilla) await api.put(`/api/plantillas/${plantilla.id}`, cuerpo);
      else await api.post('/api/plantillas', cuerpo);
      onGuardada();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (plantilla && (cargando || !estado)) {
    return (
      <Modal abierto titulo="Editar plantilla" onCerrar={onCerrar}>
        <Cargando />
      </Modal>
    );
  }

  return (
    <Modal
      abierto
      titulo={plantilla ? 'Editar plantilla' : 'Nueva plantilla'}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
    >
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre" requerido>
            <input
              className="campo"
              value={estado.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              placeholder="Full body principiante"
              required
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Objetivo">
            <input
              className="campo"
              value={estado.objetivo}
              onChange={(e) => set('objetivo', e.target.value)}
              placeholder="Adaptación, hipertrofia…"
            />
          </Campo>
        </div>

        <Campo etiqueta="Nivel">
          <select className="campo" value={estado.nivel} onChange={(e) => set('nivel', e.target.value)}>
            {NIVELES.map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Indicaciones generales">
          <textarea
            className="campo min-h-[60px]"
            value={estado.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            placeholder="El socio ve esto en su rutina."
          />
        </Campo>

        {estado.dias.map((dia, i) => (
          <section key={i} className="rounded-xl2 border border-borde p-3">
            <div className="mb-2 flex gap-2">
              <input
                className="campo flex-1 py-2 text-[13.5px]"
                value={dia.etiqueta}
                onChange={(e) => setDia(i, { etiqueta: e.target.value })}
                placeholder={`Día ${i + 1}`}
              />
              {estado.dias.length > 1 && (
                <button
                  type="button"
                  onClick={() => setForm({ ...estado, dias: estado.dias.filter((_, n) => n !== i) })}
                  className="btn-fantasma px-2 text-estado-critico"
                  aria-label="Quitar día"
                >
                  ✕
                </button>
              )}
            </div>

            {dia.ejercicios.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {dia.ejercicios.map((ej, j) => (
                  <li key={ej.codigo} className="flex items-center gap-2 rounded-[9px] bg-superficie-alta p-2">
                    <img
                      src={media(ej.imagen)}
                      alt=""
                      loading="lazy"
                      className="h-10 w-10 flex-none rounded-[6px] bg-white object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{ej.nombre}</span>
                    <input
                      type="number"
                      min="1"
                      className="campo w-14 py-1 text-center text-[12.5px] tabular-nums"
                      value={ej.series}
                      onChange={(e) =>
                        setDia(i, {
                          ejercicios: dia.ejercicios.map((x, n) =>
                            n === j ? { ...x, series: e.target.value } : x
                          ),
                        })
                      }
                      aria-label="Series"
                    />
                    <span className="text-texto-tenue">×</span>
                    <input
                      className="campo w-16 py-1 text-center text-[12.5px]"
                      value={ej.repeticiones}
                      onChange={(e) =>
                        setDia(i, {
                          ejercicios: dia.ejercicios.map((x, n) =>
                            n === j ? { ...x, repeticiones: e.target.value } : x
                          ),
                        })
                      }
                      aria-label="Repeticiones"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDia(i, { ejercicios: dia.ejercicios.filter((_, n) => n !== j) })
                      }
                      className="btn-fantasma flex-none px-1.5 py-1 text-estado-critico"
                      aria-label={`Quitar ${ej.nombre}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => setDiaAbierto(i)}
              className="btn-secundario w-full py-2 text-[13px]"
            >
              + Ejercicio
            </button>
          </section>
        ))}

        <button
          type="button"
          onClick={() =>
            setForm({
              ...estado,
              dias: [...estado.dias, { etiqueta: `Día ${estado.dias.length + 1}`, nota: '', ejercicios: [] }],
            })
          }
          disabled={estado.dias.length >= 7}
          className="btn-secundario w-full"
        >
          + Agregar día
        </button>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar plantilla'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">Cancelar</button>
        </div>
      </form>

      <BuscadorEjercicios
        abierto={diaAbierto !== null}
        titulo={`Agregar a ${diaAbierto !== null ? estado.dias[diaAbierto].etiqueta : ''}`}
        yaElegidos={diaAbierto !== null ? estado.dias[diaAbierto].ejercicios.map((e) => e.codigo) : []}
        onElegir={(ej) =>
          setDia(diaAbierto, {
            ejercicios: [
              ...estado.dias[diaAbierto].ejercicios,
              { ...ej, series: 3, repeticiones: '10', descanso_seg: 60, nota: '' },
            ],
          })
        }
        onCerrar={() => setDiaAbierto(null)}
      />
    </Modal>
  );
}

// --------------------------------------------------------------------
function AsignarPlantilla({ plantilla, onCerrar }) {
  const navegar = useNavigate();
  const [buscar, setBuscar] = useState('');
  const [nombre, setNombre] = useState(plantilla.nombre);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const retrasado = useRetraso(buscar, 300);
  const { datos } = useDatos(`/api/socios${qs({ buscar: retrasado, limite: 8 })}`);

  async function asignar(socio) {
    setError('');
    setEnviando(true);
    try {
      const r = await api.post(`/api/plantillas/${plantilla.id}/asignar`, {
        socio_id: socio.socio_id,
        nombre,
      });
      navegar(`/admin/rutinas/${r.rutina_id}`);
    } catch (e) {
      setError(e.message);
      setEnviando(false);
    }
  }

  return (
    <Modal abierto titulo={`Asignar "${plantilla.nombre}"`} onCerrar={onCerrar}>
      <div className="space-y-4">
        <Campo etiqueta="Nombre que verá el socio">
          <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>

        <Campo etiqueta="¿A qué socio?" hint="Buscá por nombre, cédula o código." requerido>
          <input
            className="campo"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar socio…"
            autoFocus
          />
        </Campo>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {buscar && (
          <ul className="space-y-1.5">
            {datos?.datos?.length ? (
              datos.datos.map((s) => (
                <li key={s.socio_id}>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => asignar(s)}
                    className="w-full rounded-[9px] border border-borde bg-superficie-alta px-3 py-2.5 text-left
                               transition-colors duration-rapido ease-salida hover:border-acento"
                  >
                    <span className="block text-[13.5px] font-medium">{s.nombre_completo}</span>
                    <span className="block text-[11.5px] text-texto-suave">
                      {s.codigo} · CI {s.documento}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-[13px] text-texto-tenue">Ningún socio coincide.</li>
            )}
          </ul>
        )}

        <p className="text-[12px] text-texto-tenue">
          Al asignarla se crea una rutina nueva copiando la plantilla. Después podés ajustarla
          para ese socio sin que cambie la plantilla.
        </p>
      </div>
    </Modal>
  );
}
