import { useState } from 'react';

import { bajarArchivo } from '../api.js';

/**
 * Hoja llena con la esquina doblada y la flecha de bajar.
 *
 * Relleno y no de trazo fino: a 16 px las líneas de 1,8 se empastan y se ve
 * sucio. Va en el rojo de la marca, que es lo que lo hace leer como "PDF" de
 * un vistazo sin tener que escribir las letras, que a este tamaño no entran.
 */
const IconoPdf = ({ tam = 16 }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M13.2 2H7.5A2.5 2.5 0 0 0 5 4.5v15A2.5 2.5 0 0 0 7.5 22h9a2.5 2.5 0 0 0 2.5-2.5V7.8L13.2 2Z"
      fill="currentColor"
    />
    {/* La esquina doblada, aclarando sobre el color de la hoja. */}
    <path d="M13.2 2 19 7.8h-3.8a2 2 0 0 1-2-2V2Z" fill="#fff" fillOpacity=".38" />
    <path
      d="M12 11.6v4.9m0 0 1.9-1.9M12 16.5l-1.9-1.9"
      stroke="#fff"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Baja el comprobante de un pago en PDF.
 *
 * Se descarga en vez de abrirse en una pestaña: `window.open` después de un
 * `await` ya no cuenta como gesto del usuario y el bloqueador de emergentes
 * lo corta, así que el botón parecía no hacer nada. Bajado, el mostrador lo
 * abre para imprimir o lo adjunta al WhatsApp, que es lo que se hace con él.
 */
export function BotonComprobante({ pagoId, texto, titulo, className }) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  async function bajar(e) {
    e.preventDefault();
    e.stopPropagation();
    if (bajando) return;
    setError('');
    setBajando(true);
    try {
      await bajarArchivo(
        `/api/pagos/${pagoId}/comprobante`,
        `comprobante-${String(pagoId).padStart(7, '0')}.pdf`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBajando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={bajar}
      disabled={bajando}
      title={error || titulo || 'Bajar el comprobante en PDF'}
      aria-label={texto ? undefined : 'Bajar el comprobante en PDF'}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-[9px] border border-borde bg-superficie-alta ' +
          'px-2.5 py-1.5 text-[12.5px] font-medium text-texto-suave transition-colors ' +
          'duration-rapido ease-salida hover:border-borde-fuerte hover:text-texto ' +
          'disabled:opacity-60'
      }
    >
      {/* El ícono va en el rojo de la marca aunque el botón sea gris. */}
      <span className="text-[#e0281f]">
        <IconoPdf />
      </span>
      {texto}
      {error && <span className="sr-only">Error: {error}</span>}
    </button>
  );
}
