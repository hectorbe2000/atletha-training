import { useState } from 'react';

import { api } from '../api.js';
import { useDatos } from '../hooks.js';
import { Aviso, Campo, Cargando, Modal } from './ui.jsx';

/**
 * "Vi este ejercicio y lo quiero en mi rutina".
 *
 * El socio no tiene que planificar la semana antes de guardar el primero:
 * si no tiene ninguna rutina propia, el modal arranca directamente en el
 * formulario de crear una.
 *
 * Las rutinas que armó el profe no aparecen como destino: son de solo lectura.
 */
export function AgregarARutina({ abierto, ejercicio, onCerrar, onAgregado }) {
  const { datos: rutinas, cargando, refrescar } = useDatos('/api/rutinas', { activo: abierto });

  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [diaNuevoEn, setDiaNuevoEn] = useState(null);
  const [etiquetaDia, setEtiquetaDia] = useState('');

  const mias = (rutinas ?? []).filter((r) => r.origen === 'SOCIO');
  const sinRutinasPropias = !cargando && mias.length === 0;

  function cerrar() {
    setError(''); setOk(''); setCreando(false);
    setNombreNuevo(''); setDiaNuevoEn(null); setEtiquetaDia('');
    onCerrar();
  }

  async function agregar(diaId, etiquetaDelDia) {
    setError(''); setOk(''); setEnviando(true);
    try {
      await api.post(`/api/rutinas/dias/${diaId}/ejercicios`, { codigo: ejercicio.codigo });
      setOk(`Agregado a ${etiquetaDelDia}.`);
      onAgregado?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function crearRutina(e) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const rutina = await api.post('/api/rutinas/propia', {
        nombre: nombreNuevo,
        dias: ['Día 1'],
      });
      await api.post(`/api/rutinas/dias/${rutina.dias[0].id}/ejercicios`, {
        codigo: ejercicio.codigo,
      });
      setOk(`Creé "${rutina.nombre}" y agregué el ejercicio.`);
      setCreando(false);
      setNombreNuevo('');
      refrescar();
      onAgregado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function crearDia(rutinaId) {
    setError(''); setEnviando(true);
    try {
      const dia = await api.post(`/api/rutinas/${rutinaId}/dias`, { etiqueta: etiquetaDia });
      await api.post(`/api/rutinas/dias/${dia.id}/ejercicios`, { codigo: ejercicio.codigo });
      setOk(`Agregado a ${dia.etiqueta}.`);
      setDiaNuevoEn(null);
      setEtiquetaDia('');
      refrescar();
      onAgregado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Agregar a mi rutina" onCerrar={cerrar}>
      <p className="mb-4 flex items-center gap-2 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2 text-[13.5px]">
        <span className="text-texto-tenue">Ejercicio:</span>
        <span className="font-semibold">{ejercicio?.nombre}</span>
      </p>

      {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}
      {ok && <Aviso tipo="ok" className="mb-3">{ok}</Aviso>}

      {cargando ? (
        <Cargando />
      ) : creando || sinRutinasPropias ? (
        <form onSubmit={crearRutina} className="space-y-3">
          {sinRutinasPropias && !creando && (
            <p className="text-[13.5px] text-texto-suave">
              Todavía no tenés ninguna rutina propia. Ponele un nombre y la creo con este
              ejercicio adentro.
            </p>
          )}
          <Campo etiqueta="Nombre de la rutina" requerido>
            <input
              className="campo"
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              placeholder="Mi rutina de pecho"
              required
              autoFocus
            />
          </Campo>
          <div className="flex gap-2">
            <button type="submit" className="btn-primario flex-1" disabled={enviando}>
              {enviando ? 'Creando…' : 'Crear y agregar'}
            </button>
            {!sinRutinasPropias && (
              <button type="button" onClick={() => setCreando(false)} className="btn-secundario">
                Cancelar
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {mias.map((r) => (
            <DestinoRutina
              key={r.id}
              rutina={r}
              enviando={enviando}
              onElegirDia={agregar}
              abriendoDia={diaNuevoEn === r.id}
              etiquetaDia={etiquetaDia}
              setEtiquetaDia={setEtiquetaDia}
              onAbrirDia={() => { setDiaNuevoEn(r.id); setEtiquetaDia(`Día ${r.dias + 1}`); }}
              onCancelarDia={() => setDiaNuevoEn(null)}
              onCrearDia={() => crearDia(r.id)}
            />
          ))}

          <button type="button" onClick={() => setCreando(true)} className="btn-secundario w-full">
            + Crear otra rutina
          </button>
        </div>
      )}
    </Modal>
  );
}

function DestinoRutina({
  rutina, enviando, onElegirDia,
  abriendoDia, etiquetaDia, setEtiquetaDia, onAbrirDia, onCancelarDia, onCrearDia,
}) {
  // Los días se piden solo al abrir la rutina: no hace falta traerlos todos.
  const { datos: completa, cargando } = useDatos(`/api/rutinas/${rutina.id}`);

  return (
    <section className="rounded-xl2 border border-borde bg-superficie-alta p-3">
      <p className="mb-2 text-[14px] font-semibold">{rutina.nombre}</p>

      {cargando ? (
        <p className="py-2 text-[13px] text-texto-tenue">Cargando días…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {completa?.dias?.map((d) => (
            <button
              key={d.id}
              type="button"
              disabled={enviando}
              onClick={() => onElegirDia(d.id, d.etiqueta)}
              className="btn-secundario px-3 py-2 text-[13px]"
            >
              {d.etiqueta}
              <span className="text-texto-tenue">({d.ejercicios.length})</span>
            </button>
          ))}

          {abriendoDia ? (
            <div className="flex w-full gap-2">
              <input
                className="campo flex-1 py-2 text-[13px]"
                value={etiquetaDia}
                onChange={(e) => setEtiquetaDia(e.target.value)}
                placeholder="Nombre del día"
                autoFocus
              />
              <button type="button" onClick={onCrearDia} className="btn-primario px-3 py-2 text-[13px]" disabled={enviando}>
                Crear
              </button>
              <button type="button" onClick={onCancelarDia} className="btn-fantasma px-2 py-2 text-[13px]">
                ✕
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAbrirDia} className="btn-fantasma px-3 py-2 text-[13px]">
              + día
            </button>
          )}
        </div>
      )}
    </section>
  );
}
