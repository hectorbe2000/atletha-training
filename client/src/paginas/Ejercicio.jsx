import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, media } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AgregarARutina } from '../componentes/AgregarARutina.jsx';
import { Aviso, Cargando } from '../componentes/ui.jsx';
import { useDatos } from '../hooks.js';

// Los 10 idiomas que trae el dataset. No hay portugués.
const IDIOMAS = [
  ['es', 'Español'], ['en', 'English'], ['it', 'Italiano'], ['fr', 'Français'],
  ['ru', 'Русский'], ['tr', 'Türkçe'], ['zh', '中文'], ['hi', 'हिन्दी'],
  ['pl', 'Polski'], ['ko', '한국어'],
];

export function Ejercicio() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const { esSocio, esAdmin } = useAuth();

  const [idioma, setIdioma] = useState('es');
  const { datos: e, error, cargando, setDatos } = useDatos(`/api/ejercicios/${codigo}?idioma=${idioma}`);

  const [abrirRutina, setAbrirRutina] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreEs, setNombreEs] = useState('');

  async function alternarFavorito() {
    const favorito = !e.favorito;
    setDatos((p) => ({ ...p, favorito }));
    try {
      await api.put(`/api/ejercicios/${codigo}/favorito`, { favorito });
    } catch {
      setDatos((p) => ({ ...p, favorito: !favorito }));
    }
  }

  async function guardarNombre() {
    const actualizado = await api.patch(`/api/ejercicios/${codigo}`, { nombre_es: nombreEs || null });
    setDatos((p) => ({ ...p, nombre: actualizado.nombre, nombre_es: actualizado.nombre_es }));
    setEditandoNombre(false);
  }

  if (cargando) return <Cargando texto="Cargando ejercicio…" />;
  if (error) return <Aviso tipo="error">{error.message}</Aviso>;
  if (!e) return null;

  const pasos = e.instrucciones?.pasos ?? [];

  return (
    <div>
      <button type="button" onClick={() => navegar(-1)} className="btn-fantasma mb-3 -ml-2 px-2 text-[13px]">
        ← Volver
      </button>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Animación */}
        <div className="overflow-hidden rounded-xl2 border border-borde bg-white">
          <img src={media(e.gif)} alt={e.nombre} className="w-full" />
        </div>

        <div className="min-w-0">
          <header className="mb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold leading-tight tracking-tight">{e.nombre}</h1>
                {e.nombre_es && (
                  <p className="mt-0.5 text-[13px] text-texto-tenue">{e.nombre_original}</p>
                )}
              </div>
              <span className="flex-none pt-1.5 text-[12px] tabular-nums text-texto-tenue">#{e.codigo}</span>
              {esSocio && (
                <div className="flex flex-none gap-2">
                  <button
                    type="button"
                    aria-pressed={Boolean(e.favorito)}
                    onClick={alternarFavorito}
                    className={e.favorito ? 'btn-secundario border-[#ff6b81]/40 text-[#ff6b81]' : 'btn-secundario'}
                  >
                    {e.favorito ? '♥ Favorito' : '♡ Guardar'}
                  </button>
                  <button type="button" onClick={() => setAbrirRutina(true)} className="btn-primario">
                    + Mi rutina
                  </button>
                </div>
              )}
            </div>

            {esAdmin && (
              <div className="mt-3">
                {editandoNombre ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="campo max-w-xs flex-1"
                      value={nombreEs}
                      onChange={(ev) => setNombreEs(ev.target.value)}
                      placeholder="Nombre en español"
                      autoFocus
                    />
                    <button type="button" onClick={guardarNombre} className="btn-primario py-2 text-[13px]">
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditandoNombre(false)} className="btn-fantasma py-2 text-[13px]">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setNombreEs(e.nombre_es ?? ''); setEditandoNombre(true); }}
                    className="btn-fantasma -ml-2 px-2 py-1 text-[12.5px]"
                  >
                    {e.nombre_es ? 'Editar nombre en español' : '+ Traducir el nombre al español'}
                  </button>
                )}
              </div>
            )}
          </header>

          <dl className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Objetivo', e.musculo, true],
              ['Equipo', e.equipo],
              ['Zona', e.zona],
              ['Grupo', e.grupo_muscular],
            ].map(([k, v, destacado]) => (
              <div key={k} className="tarjeta px-3 py-2.5">
                <dt className="text-[11px] uppercase tracking-wide text-texto-tenue">{k}</dt>
                <dd className={`mt-0.5 text-[13.5px] font-medium ${destacado ? 'text-acento' : ''}`}>
                  {v ?? '—'}
                </dd>
              </div>
            ))}
          </dl>

          {e.musculos_secundarios?.length > 0 && (
            <div className="mb-5">
              <p className="etiqueta">Músculos secundarios</p>
              <div className="flex flex-wrap gap-1.5">
                {e.musculos_secundarios.map((m) => (
                  <span
                    key={m}
                    className="rounded-[9px] border border-borde bg-superficie-alta px-2.5 py-1 text-[12px] text-texto-suave"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <section>
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold">Cómo se hace</h2>
              <select
                className="campo w-auto py-1.5 text-[12.5px]"
                value={idioma}
                onChange={(ev) => setIdioma(ev.target.value)}
                aria-label="Idioma de las instrucciones"
              >
                {IDIOMAS.map(([cod, nom]) => (
                  <option key={cod} value={cod}>{nom}</option>
                ))}
              </select>
            </div>

            {pasos.length ? (
              <ol className="space-y-2.5">
                {pasos.map((p, i) => (
                  <li key={i} className="tarjeta flex gap-3 px-3.5 py-3">
                    <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-superficie-alta text-[12px] font-semibold tabular-nums text-acento">
                      {i + 1}
                    </span>
                    <p className="text-[14px] leading-relaxed text-texto-suave">{p}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <Aviso tipo="info">No hay instrucciones cargadas en este idioma.</Aviso>
            )}
          </section>

          {e.atribucion && (
            <p className="mt-6 text-[11px] text-texto-tenue">{e.atribucion}</p>
          )}

          <Link to="/ejercicios" className="btn-secundario mt-6">
            Ver más ejercicios
          </Link>

          <AgregarARutina
            abierto={abrirRutina}
            ejercicio={e}
            onCerrar={() => setAbrirRutina(false)}
          />
        </div>
      </div>
    </div>
  );
}
