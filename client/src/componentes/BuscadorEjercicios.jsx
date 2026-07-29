import { useMemo, useState } from 'react';

import { qs } from '../api.js';
import { useDatos, useRetraso } from '../hooks.js';
import { FilaEjercicio } from './CardEjercicio.jsx';
import { Aviso, Cargando, Modal, Vacio } from './ui.jsx';

/**
 * Selector de ejercicios del catálogo.
 *
 * Lo usan el armador del administrador y la pantalla de rutinas del socio, así
 * que la búsqueda y los filtros se escriben una sola vez. Usa la disposición
 * densa (la variante "Ficha" del prototipo): acá se elige leyendo datos, no
 * mirando la animación.
 *
 * El modal no se cierra al agregar: lo normal es cargar varios seguidos.
 */
export function BuscadorEjercicios({
  abierto,
  titulo = 'Agregar ejercicios',
  subtitulo,
  yaElegidos = [],
  onElegir,
  onCerrar,
}) {
  const [buscar, setBuscar] = useState('');
  const [zona, setZona] = useState('');
  const [equipo, setEquipo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState('');

  const retrasado = useRetraso(buscar, 300);

  const { datos: filtros } = useDatos('/api/ejercicios/filtros', { activo: abierto });
  const ruta = useMemo(
    () => `/api/ejercicios${qs({ buscar: retrasado, zona, equipo, limite: 20 })}`,
    [retrasado, zona, equipo]
  );
  const { datos, cargando, recargando } = useDatos(ruta, { activo: abierto });

  async function elegir(ejercicio) {
    setError('');
    setOcupado(ejercicio.codigo);
    try {
      await onElegir(ejercicio);
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado('');
    }
  }

  function cerrar() {
    setBuscar(''); setZona(''); setEquipo(''); setError('');
    onCerrar();
  }

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={cerrar} ancho="max-w-2xl">
      <div className="space-y-3">
        {subtitulo && (
          <p className="rounded-[9px] border border-borde bg-superficie-alta px-3 py-2 text-[13px] text-texto-suave">
            {subtitulo}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            type="search"
            className="campo min-w-[12rem] flex-1"
            placeholder="Buscar: sentadilla, gemelos, mancuerna…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            autoFocus
          />
          <select
            className="campo w-auto flex-none py-2 text-[13.5px]"
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            aria-label="Zona del cuerpo"
          >
            <option value="">Todas las zonas</option>
            {filtros?.zonas?.map((z) => (
              <option key={z.valor} value={z.valor}>{z.etiqueta}</option>
            ))}
          </select>
          <select
            className="campo w-auto flex-none py-2 text-[13.5px]"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            aria-label="Equipamiento"
          >
            <option value="">Todo el equipo</option>
            {filtros?.equipos?.map((q) => (
              <option key={q.valor} value={q.valor}>{q.etiqueta}</option>
            ))}
          </select>
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}

        {cargando ? (
          <Cargando />
        ) : datos?.datos?.length ? (
          <ul
            className="space-y-2 transition-opacity duration-medio ease-salida"
            style={{ opacity: recargando ? 0.45 : 1 }}
          >
            {datos.datos.map((e) => {
              const puesto = yaElegidos.includes(e.codigo);
              return (
                <li key={e.codigo}>
                  <FilaEjercicio
                    ejercicio={e}
                    accion={
                      <button
                        type="button"
                        onClick={() => elegir(e)}
                        disabled={puesto || ocupado === e.codigo}
                        className={
                          puesto
                            ? 'btn-fantasma flex-none px-3 py-1.5 text-[12.5px] text-estado-bien'
                            : 'btn-primario flex-none px-3 py-1.5 text-[12.5px]'
                        }
                      >
                        {puesto ? '✓ Puesto' : ocupado === e.codigo ? '…' : '+ Agregar'}
                      </button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <Vacio
            titulo="Ningún ejercicio coincide"
            detalle="Probá con otra palabra o sacá algún filtro."
          />
        )}

        <button type="button" onClick={cerrar} className="btn-secundario w-full">
          Listo
        </button>
      </div>
    </Modal>
  );
}
