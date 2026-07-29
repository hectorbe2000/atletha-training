import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api, fecha } from '../../api.js';
import { Aviso, Cargando, Vacio } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

export function RutinasAdmin() {
  const { datos: rutinas, error, cargando, refrescar } = useDatos('/api/rutinas');
  const [accionError, setAccionError] = useState('');

  async function archivar(r) {
    setAccionError('');
    try {
      await api.patch(`/api/rutinas/${r.id}/activa`, { activa: false });
      refrescar();
    } catch (e) {
      setAccionError(e.message);
    }
  }

  async function eliminar(r) {
    if (!confirm(`¿Eliminar la rutina "${r.nombre}" de ${r.socio_nombre}? No se puede deshacer.`)) return;
    setAccionError('');
    try {
      await api.del(`/api/rutinas/${r.id}`);
      refrescar();
    } catch (e) {
      setAccionError(e.message);
    }
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rutinas</h1>
          <p className="mt-0.5 text-[13px] text-texto-suave">Todas las rutinas activas del gimnasio.</p>
        </div>
        <Link to="/admin/rutinas/nueva" className="btn-primario">+ Armar rutina</Link>
      </header>

      {error && <Aviso tipo="error">{error.message}</Aviso>}
      {accionError && <Aviso tipo="error" className="mb-3">{accionError}</Aviso>}

      {cargando ? (
        <Cargando texto="Cargando rutinas…" />
      ) : rutinas?.length ? (
        <ul className="space-y-2">
          {rutinas.map((r) => (
            <li
              key={r.id}
              className="tarjeta flex flex-wrap items-center gap-3 p-3 transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
            >
              <Link to={`/admin/rutinas/${r.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-semibold">
                  {r.nombre}
                  {r.origen === 'SOCIO' && (
                    <span className="ml-2 rounded-full border border-borde px-2 py-0.5 text-[10.5px] font-normal text-texto-tenue">
                      la armó el socio
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[12px] text-texto-suave">
                  {r.socio_nombre} · {r.socio_codigo}
                </p>
              </Link>
              <div className="text-right text-[12px] text-texto-suave">
                <p>{r.dias} {r.dias === 1 ? 'día' : 'días'}</p>
                <p className="text-texto-tenue">desde {fecha(r.fecha_inicio)}</p>
              </div>
              <div className="flex flex-none gap-1">
                <Link to={`/admin/rutinas/${r.id}`} className="btn-secundario px-3 py-1.5 text-[12.5px]">
                  Editar
                </Link>
                <button
                  type="button"
                  onClick={() => archivar(r)}
                  title="El socio deja de verla, pero no se borra"
                  className="btn-fantasma px-2.5 py-1.5 text-[12.5px]"
                >
                  Archivar
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(r)}
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
          titulo="No hay rutinas todavía"
          detalle="Armá la primera rutina eligiendo un socio y los ejercicios de cada día."
          accion={<Link to="/admin/rutinas/nueva" className="btn-primario">+ Armar rutina</Link>}
        />
      )}
    </div>
  );
}
