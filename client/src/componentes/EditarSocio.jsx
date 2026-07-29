import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Aviso, Campo, Modal } from './ui.jsx';

/**
 * Edición de los datos del socio desde la ficha.
 *
 * Incluye la cédula a propósito: un error de tipeo en el alta deja al socio
 * sin poder entrar al sistema, y hasta ahora no había forma de arreglarlo.
 * El servidor rechaza el cambio si esa cédula ya es de otro.
 *
 * También permite darlo de baja sin borrarlo: un socio inactivo desaparece
 * del listado y del mostrador, pero su historial de pagos queda intacto.
 */
export function EditarSocio({ abierto, socio, onCerrar, onGuardado }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  // Se recarga cada vez que se abre, para no arrastrar ediciones descartadas.
  useEffect(() => {
    if (!abierto || !socio) return;
    setForm({
      documento: socio.documento ?? '',
      nombre: socio.nombre ?? '',
      apellido: socio.apellido ?? '',
      email: socio.email ?? '',
      telefono: socio.telefono ?? '',
      fecha_nacimiento: socio.fecha_nacimiento ?? '',
      sexo: socio.sexo ?? '',
      altura_cm: socio.altura_cm ?? '',
      direccion: socio.direccion ?? '',
      objetivo: socio.objetivo ?? '',
      contacto_emergencia: socio.contacto_emergencia ?? '',
      telefono_emergencia: socio.telefono_emergencia ?? '',
      observaciones_medicas: socio.observaciones_medicas ?? '',
      activo: socio.activo ?? true,
    });
    setError('');
    setErrores({});
  }, [abierto, socio]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setErrores({});
    setEnviando(true);
    try {
      await api.patch(`/api/socios/${socio.socio_id}`, form);
      onGuardado();
    } catch (err) {
      setError(err.message);
      setErrores(err.porCampo?.() ?? {});
    } finally {
      setEnviando(false);
    }
  }

  if (!socio) return null;

  return (
    <Modal abierto={abierto} titulo="Editar socio" onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Cédula"
            error={errores.documento}
            hint="Es su usuario para entrar. Si la cambiás, avisale."
            requerido
          >
            <input
              className="campo tabular-nums"
              value={form.documento ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value.replace(/\D/g, '') }))}
              inputMode="numeric"
              maxLength={15}
              required
            />
          </Campo>
          <Campo etiqueta="Teléfono" error={errores.telefono} hint="Se usa para el aviso por WhatsApp.">
            <input className="campo" value={form.telefono ?? ''} onChange={set('telefono')} />
          </Campo>

          <Campo etiqueta="Nombre" error={errores.nombre} requerido>
            <input className="campo" value={form.nombre ?? ''} onChange={set('nombre')} required />
          </Campo>
          <Campo etiqueta="Apellido" error={errores.apellido} requerido>
            <input className="campo" value={form.apellido ?? ''} onChange={set('apellido')} required />
          </Campo>

          <Campo etiqueta="Email" error={errores.email}>
            <input type="email" className="campo" value={form.email ?? ''} onChange={set('email')} />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
            <input
              type="date"
              className="campo"
              value={(form.fecha_nacimiento ?? '').slice(0, 10)}
              onChange={set('fecha_nacimiento')}
            />
          </Campo>

          <Campo etiqueta="Sexo">
            <select className="campo" value={form.sexo ?? ''} onChange={set('sexo')}>
              <option value="">Sin especificar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="OTRO">Otro</option>
            </select>
          </Campo>
          <Campo etiqueta="Altura (cm)" error={errores.altura_cm} hint="Necesaria para calcular el IMC.">
            <input
              type="number"
              min="80"
              max="260"
              className="campo tabular-nums"
              value={form.altura_cm ?? ''}
              onChange={set('altura_cm')}
              placeholder="175"
            />
          </Campo>

          <Campo etiqueta="Dirección">
            <input className="campo" value={form.direccion ?? ''} onChange={set('direccion')} />
          </Campo>
          <Campo etiqueta="Objetivo">
            <input
              className="campo"
              value={form.objetivo ?? ''}
              onChange={set('objetivo')}
              placeholder="Bajar de peso, hipertrofia…"
            />
          </Campo>

          <Campo etiqueta="Contacto de emergencia">
            <input
              className="campo"
              value={form.contacto_emergencia ?? ''}
              onChange={set('contacto_emergencia')}
            />
          </Campo>
          <Campo etiqueta="Teléfono de emergencia">
            <input
              className="campo"
              value={form.telefono_emergencia ?? ''}
              onChange={set('telefono_emergencia')}
            />
          </Campo>
        </div>

        <Campo etiqueta="Observaciones médicas" hint="Lesiones o condiciones a tener en cuenta.">
          <textarea
            className="campo min-h-[70px]"
            value={form.observaciones_medicas ?? ''}
            onChange={set('observaciones_medicas')}
          />
        </Campo>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[9px] border border-borde bg-superficie-alta p-3">
          <input
            type="checkbox"
            checked={form.activo ?? true}
            onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-[#c9f24d]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">Socio activo</span>
            <span className="block text-[12px] text-texto-suave">
              Si lo desmarcás, deja de aparecer en el listado y no puede entrar al sistema ni
              pasar por el mostrador. Su historial de pagos y entrenamientos se conserva.
            </span>
          </span>
        </label>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
