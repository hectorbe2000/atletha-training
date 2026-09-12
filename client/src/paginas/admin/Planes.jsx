import { useState } from 'react';

import { api, guaranies } from '../../api.js';
import { Aviso, Campo, Cargando, Modal } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

const VACIO = { nombre: '', descripcion: '', duracion_dias: '', precio: '', activo: true };

export function Planes() {
  const { datos: planes, cargando, refrescar } = useDatos('/api/planes?todos=true');
  const [editando, setEditando] = useState(null);

  async function alternarActivo(plan) {
    await api.patch(`/api/planes/${plan.id}`, { activo: !plan.activo });
    refrescar();
  }

  if (cargando) return <Cargando texto="Cargando planes…" />;

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planes</h1>
          <p className="mt-0.5 text-[13px] text-texto-suave">
            Los planes inactivos no aparecen al cobrar, pero las membresías ya vendidas siguen valiendo.
          </p>
        </div>
        <button type="button" onClick={() => setEditando(VACIO)} className="btn-primario">
          + Nuevo plan
        </button>
      </header>

      <ul className="space-y-2">
        {planes?.map((p) => (
          <li key={p.id} className={`tarjeta flex flex-wrap items-center gap-3 p-3.5 ${p.activo ? '' : 'opacity-60'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{p.nombre}</p>
              {p.descripcion && <p className="mt-0.5 text-[12.5px] text-texto-suave">{p.descripcion}</p>}
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold tabular-nums">{guaranies(p.precio)}</p>
              <p className="text-[12px] tabular-nums text-texto-tenue">{p.duracion_dias} días</p>
            </div>
            <div className="flex flex-none gap-2">
              <button type="button" onClick={() => setEditando(p)} className="btn-secundario px-3 py-1.5 text-[13px]">
                Editar
              </button>
              <button type="button" onClick={() => alternarActivo(p)} className="btn-fantasma px-3 py-1.5 text-[13px]">
                {p.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* La `key` remonta el editor con el formulario ya cargado, así no hay
          que sincronizar el estado con las props mientras se renderiza. */}
      {editando && (
        <EditorPlan
          key={editando.id ?? 'nuevo'}
          plan={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); refrescar(); }}
        />
      )}
    </div>
  );
}

/**
 * El editor se monta ya con el plan cargado (ver la `key` de arriba).
 *
 * Antes sincronizaba el formulario durante el render comparando `plan.id`
 * contra el último cargado. Un plan nuevo no tiene id: `undefined` nunca
 * coincidía con el `null` inicial, así que el setState se disparaba en cada
 * render y React cortaba con "Too many re-renders" — la pantalla en negro al
 * tocar "+ Nuevo plan". Editar andaba porque ahí sí había id.
 */
function EditorPlan({ plan, onCerrar, onGuardado }) {
  const [form, setForm] = useState(() => ({
    nombre: plan.nombre ?? '',
    descripcion: plan.descripcion ?? '',
    duracion_dias: plan.duracion_dias ?? '',
    precio: plan.precio ?? '',
    activo: plan.activo ?? true,
  }));
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setError(''); setErrores({}); setEnviando(true);
    try {
      const cuerpo = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        duracion_dias: Number(form.duracion_dias),
        precio: Number(form.precio),
      };
      if (plan.id) await api.patch(`/api/planes/${plan.id}`, cuerpo);
      else await api.post('/api/planes', cuerpo);
      setEnviando(false);
      onGuardado();
    } catch (err) {
      setError(err.message);
      setErrores(err.porCampo?.() ?? {});
      setEnviando(false);
    }
  }

  return (
    <Modal abierto titulo={plan.id ? 'Editar plan' : 'Nuevo plan'} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre" error={errores.nombre} requerido>
          <input className="campo" value={form.nombre} onChange={set('nombre')} required autoFocus />
        </Campo>
        <Campo etiqueta="Descripción">
          <input className="campo" value={form.descripcion} onChange={set('descripcion')} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Duración en días" error={errores.duracion_dias} requerido>
            <input
              type="number"
              className="campo tabular-nums"
              value={form.duracion_dias}
              onChange={set('duracion_dias')}
              min="1"
              required
            />
          </Campo>
          <Campo etiqueta="Precio (Gs.)" error={errores.precio} requerido>
            <input
              type="number"
              className="campo tabular-nums"
              value={form.precio}
              onChange={set('precio')}
              min="0"
              required
            />
          </Campo>
        </div>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
