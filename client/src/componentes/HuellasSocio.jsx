import { useState } from 'react';

import { api, fechaHora } from '../api.js';
import { useDatos } from '../hooks.js';
import { Aviso, Campo } from './ui.jsx';

/**
 * Huellas del socio para el molinete.
 *
 * Acá no se toma la huella: eso lo hace el lector, que guarda la plantilla
 * adentro del equipo. Lo único que se carga es el identificador que el lector
 * devolvió, para saber a quién corresponde. Por eso el campo es de texto y no
 * hay ningún botón de "escanear": mientras no se conozca si el equipo permite
 * disparar el enrolamiento por comando, el enrolamiento se hace en el equipo y
 * acá se anota el número.
 */
export function HuellasSocio({ socioId }) {
  const { datos: huellas, cargando, refrescar } = useDatos(`/api/acceso/biometria/${socioId}`);

  const [biometriaId, setBiometriaId] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function asociar(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      await api.post('/api/acceso/biometria', {
        socio_id: socioId,
        biometria_id: biometriaId.trim(),
        etiqueta: etiqueta.trim(),
      });
      setBiometriaId('');
      setEtiqueta('');
      setMensaje('Huella asociada. Ya puede entrar por el molinete.');
      refrescar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(huella) {
    if (!confirm(`¿Quitar la huella ${huella.biometria_id}? El socio deja de poder entrar con ella.`)) {
      return;
    }
    setError('');
    setMensaje('');
    try {
      await api.del(`/api/acceso/biometria/${huella.id}`);
      refrescar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="tarjeta p-4">
      <h2 className="mb-1 text-[14.5px] font-semibold">Huellas para el molinete</h2>
      <p className="mb-3 text-[12.5px] text-texto-suave">
        Enrolá el dedo en el equipo y cargá acá el identificador que te devolvió. Podés cargar
        más de uno, por si se lastima un dedo.
      </p>

      {cargando ? (
        <p className="py-3 text-[13px] text-texto-suave">Cargando…</p>
      ) : huellas?.length ? (
        <ul className="mb-3 space-y-1.5">
          {huellas.map((h) => (
            <li
              key={h.id}
              className="flex items-center gap-3 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium tabular-nums">{h.biometria_id}</p>
                <p className="text-[11.5px] text-texto-tenue">
                  {h.etiqueta ? `${h.etiqueta} · ` : ''}
                  cargada el {fechaHora(h.creado_en)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => quitar(h)}
                className="btn-fantasma px-2.5 py-1 text-[12.5px] text-estado-critico"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-[9px] border border-dashed border-borde px-3 py-4 text-center text-[13px] text-texto-tenue">
          Sin huellas cargadas. Este socio todavía no puede entrar por el molinete.
        </p>
      )}

      <form onSubmit={asociar} className="flex flex-wrap items-end gap-2">
        <Campo etiqueta="Identificador del lector" requerido>
          <input
            className="campo tabular-nums"
            value={biometriaId}
            onChange={(e) => setBiometriaId(e.target.value)}
            placeholder="El número que dio el equipo"
            maxLength={64}
            required
          />
        </Campo>
        <Campo etiqueta="Qué dedo" hint="Opcional.">
          <input
            className="campo"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            placeholder="Índice derecho"
            maxLength={40}
          />
        </Campo>
        <button type="submit" className="btn-secundario" disabled={enviando || !biometriaId.trim()}>
          {enviando ? 'Asociando…' : 'Asociar huella'}
        </button>
      </form>

      {mensaje && <Aviso tipo="ok" className="mt-3">{mensaje}</Aviso>}
      {error && <Aviso tipo="error" className="mt-3">{error}</Aviso>}
    </section>
  );
}
