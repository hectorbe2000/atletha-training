import { useMemo, useState } from 'react';

import { api, qs } from '../api.js';
import { useAuth } from '../auth.jsx';
import { AgregarARutina } from '../componentes/AgregarARutina.jsx';
import { CardEjercicio } from '../componentes/CardEjercicio.jsx';
import { Aviso, Cargando, Vacio } from '../componentes/ui.jsx';
import { useDatos, useRetraso } from '../hooks.js';

export function Catalogo() {
  const { esSocio } = useAuth();

  const [buscar, setBuscar] = useState('');
  const [zona, setZona] = useState('');
  const [equipo, setEquipo] = useState('');
  const [musculo, setMusculo] = useState('');
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [paraRutina, setParaRutina] = useState(null);

  const busquedaRetrasada = useRetraso(buscar, 300);

  const { datos: filtros } = useDatos('/api/ejercicios/filtros');

  const ruta = useMemo(
    () =>
      `/api/ejercicios${qs({
        buscar: busquedaRetrasada,
        zona,
        equipo,
        musculo,
        solo_favoritos: soloFavoritos ? 'true' : '',
        pagina,
        limite: 24,
      })}`,
    [busquedaRetrasada, zona, equipo, musculo, soloFavoritos, pagina]
  );

  const { datos, error, cargando, recargando, setDatos } = useDatos(ruta);

  const cambiarFiltro = (setter) => (valor) => {
    setter(valor);
    setPagina(1);
  };

  async function alternarFavorito(codigo, favorito) {
    // Optimista: la card responde al toque y se corrige si el servidor falla.
    setDatos((prev) => ({
      ...prev,
      datos: prev.datos.map((e) => (e.codigo === codigo ? { ...e, favorito } : e)),
    }));
    try {
      await api.put(`/api/ejercicios/${codigo}/favorito`, { favorito });
    } catch {
      setDatos((prev) => ({
        ...prev,
        datos: prev.datos.map((e) => (e.codigo === codigo ? { ...e, favorito: !favorito } : e)),
      }));
    }
  }

  const hayFiltro = Boolean(buscar || zona || equipo || musculo || soloFavoritos);

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Ejercicios</h1>
        <p className="text-[13px] tabular-nums text-texto-suave">
          {datos ? `${datos.total.toLocaleString('es-PY')} resultados` : '—'}
        </p>
      </header>

      {/* Una sola fila de filtros arriba de todo lo que condiciona. */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-tenue"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="campo pl-10"
            placeholder="Buscar por nombre, músculo o equipo…"
            value={buscar}
            onChange={(e) => cambiarFiltro(setBuscar)(e.target.value)}
            aria-label="Buscar ejercicios"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="campo w-auto min-w-[9rem] flex-none py-2 text-[13.5px]"
            value={zona}
            onChange={(e) => cambiarFiltro(setZona)(e.target.value)}
            aria-label="Zona del cuerpo"
          >
            <option value="">Todas las zonas</option>
            {filtros?.zonas?.map((z) => (
              <option key={z.valor} value={z.valor}>
                {z.etiqueta} ({z.cantidad})
              </option>
            ))}
          </select>

          <select
            className="campo w-auto min-w-[9rem] flex-none py-2 text-[13.5px]"
            value={equipo}
            onChange={(e) => cambiarFiltro(setEquipo)(e.target.value)}
            aria-label="Equipamiento"
          >
            <option value="">Todo el equipo</option>
            {filtros?.equipos?.map((q) => (
              <option key={q.valor} value={q.valor}>
                {q.etiqueta} ({q.cantidad})
              </option>
            ))}
          </select>

          <select
            className="campo w-auto min-w-[9rem] flex-none py-2 text-[13.5px]"
            value={musculo}
            onChange={(e) => cambiarFiltro(setMusculo)(e.target.value)}
            aria-label="Músculo objetivo"
          >
            <option value="">Todos los músculos</option>
            {filtros?.musculos?.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta} ({m.cantidad})
              </option>
            ))}
          </select>

          {esSocio && (
            <button
              type="button"
              aria-pressed={soloFavoritos}
              onClick={() => cambiarFiltro(setSoloFavoritos)(!soloFavoritos)}
              className={soloFavoritos ? 'btn-primario py-2 text-[13.5px]' : 'btn-secundario py-2 text-[13.5px]'}
            >
              ♥ Favoritos
            </button>
          )}

          {hayFiltro && (
            <button
              type="button"
              onClick={() => {
                setBuscar(''); setZona(''); setEquipo(''); setMusculo('');
                setSoloFavoritos(false); setPagina(1);
              }}
              className="btn-fantasma py-2 text-[13.5px]"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {error && <Aviso tipo="error">{error.message}</Aviso>}

      {cargando ? (
        <Cargando texto="Cargando ejercicios…" />
      ) : datos?.datos?.length ? (
        <>
          <div
            className="grid grid-cols-2 gap-3 transition-opacity duration-medio ease-salida sm:grid-cols-3 lg:grid-cols-4"
            style={{ opacity: recargando ? 0.45 : 1 }}
          >
            {datos.datos.map((e) => (
              <CardEjercicio
                key={e.codigo}
                ejercicio={e}
                onFavorito={esSocio ? alternarFavorito : undefined}
                onAgregar={esSocio ? setParaRutina : undefined}
              />
            ))}
          </div>

          {datos.paginas > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Paginación">
              <button
                type="button"
                className="btn-secundario"
                disabled={pagina <= 1}
                onClick={() => { setPagina((p) => p - 1); scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                Anterior
              </button>
              <span className="text-[13px] tabular-nums text-texto-suave">
                {pagina} / {datos.paginas}
              </span>
              <button
                type="button"
                className="btn-secundario"
                disabled={pagina >= datos.paginas}
                onClick={() => { setPagina((p) => p + 1); scrollTo({ top: 0, behavior: 'smooth' }); }}
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      ) : (
        <Vacio
          titulo="Ningún ejercicio coincide"
          detalle={
            soloFavoritos
              ? 'Todavía no marcaste ejercicios como favoritos.'
              : 'Probá con menos filtros o con otra palabra.'
          }
        />
      )}

      {paraRutina && (
        <AgregarARutina
          abierto
          ejercicio={paraRutina}
          onCerrar={() => setParaRutina(null)}
        />
      )}
    </div>
  );
}
