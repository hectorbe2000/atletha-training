import { useRef, useState } from 'react';

import { api } from '../api.js';

/**
 * Foto del socio.
 *
 * En el mostrador sirve para reconocer a quien entra y evitar que se presten
 * la cédula, así que en la pantalla de Ingreso se muestra grande.
 *
 * La foto se achica en el navegador antes de subirla: la de un celular pesa
 * 3-5 MB y no tiene sentido mandar eso por el WiFi del gimnasio ni instalar
 * dependencias nativas de imagen en el servidor.
 */

const LADO_MAXIMO = 512;

async function achicar(archivo, lado = LADO_MAXIMO) {
  const bitmap = await createImageBitmap(archivo);

  // Recorte cuadrado centrado: las fichas y el mostrador muestran círculos.
  const corte = Math.min(bitmap.width, bitmap.height);
  const x = (bitmap.width - corte) / 2;
  const y = (bitmap.height - corte) / 2;
  const destino = Math.min(corte, lado);

  const lienzo = document.createElement('canvas');
  lienzo.width = destino;
  lienzo.height = destino;
  const ctx = lienzo.getContext('2d');
  ctx.drawImage(bitmap, x, y, corte, corte, 0, 0, destino, destino);
  bitmap.close?.();

  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
}

const iniciales = (nombre = '') =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export function FotoSocio({
  socio,
  tam = 56,
  editable = false,
  onCambio,
  className = '',
}) {
  const entrada = useRef(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const url = socio?.foto_url;
  const nombre = socio?.nombre_completo ?? `${socio?.nombre ?? ''} ${socio?.apellido ?? ''}`;

  async function alElegir(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;

    setError('');
    setSubiendo(true);
    try {
      const chico = await achicar(archivo);
      const cuerpo = new FormData();
      cuerpo.append('foto', chico, 'foto.jpg');
      const r = await api.subir(`/api/socios/${socio.socio_id}/foto`, cuerpo);
      onCambio?.(r.foto_url);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    setError('');
    setSubiendo(true);
    try {
      await api.del(`/api/socios/${socio.socio_id}/foto`);
      onCambio?.(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  const circulo = (
    <div
      className="relative flex-none overflow-hidden rounded-full border border-borde bg-superficie-alta"
      style={{ width: tam, height: tam }}
    >
      {url ? (
        <img src={url} alt={nombre} className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center font-semibold text-texto-tenue"
          style={{ fontSize: Math.round(tam * 0.36) }}
          aria-hidden="true"
        >
          {iniciales(nombre) || '?'}
        </span>
      )}

      {subiendo && (
        <span className="absolute inset-0 grid place-items-center bg-black/60">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-borde-fuerte border-t-acento" />
        </span>
      )}
    </div>
  );

  if (!editable) return <div className={className}>{circulo}</div>;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {circulo}
      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={subiendo}
            className="btn-secundario px-2.5 py-1 text-[12px]"
          >
            {url ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {url && (
            <button
              type="button"
              onClick={quitar}
              disabled={subiendo}
              className="btn-fantasma px-2 py-1 text-[12px] text-estado-critico"
            >
              Quitar
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-[11.5px] text-estado-critico">{error}</p>
        ) : (
          <p className="mt-1 text-[11.5px] text-texto-tenue">
            Se recorta cuadrada y se achica sola.
          </p>
        )}
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={alElegir}
        className="hidden"
      />
    </div>
  );
}
