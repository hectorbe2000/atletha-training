import { useState } from 'react';

import { api } from '../api.js';
import { enlaceWhatsApp, mensajeVencimiento, telefonoWhatsApp } from '../whatsapp.js';

const IconoWhatsApp = ({ tam = 15 }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.15h-.01c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.21 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.98-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z" />
  </svg>
);

/**
 * Abre WhatsApp con el aviso de vencimiento ya escrito.
 *
 * No manda nada desde el servidor: `wa.me` abre la app del celular o WhatsApp
 * Web en la PC, y el admin revisa el texto y toca enviar. Al usarlo se anota
 * la fecha del aviso para que el socio no aparezca de nuevo mañana como
 * pendiente de contactar.
 */
export function BotonWhatsApp({ socio, variante = 'secundario', onAvisado, texto }) {
  const [avisando, setAvisando] = useState(false);

  const numero = telefonoWhatsApp(socio?.telefono);
  const mensaje = socio ? mensajeVencimiento(socio) : '';
  const enlace = enlaceWhatsApp(socio?.telefono, mensaje);

  if (!numero) {
    return (
      <span
        title={
          socio?.telefono
            ? `El teléfono cargado (${socio.telefono}) no parece un celular válido.`
            : 'Este socio no tiene teléfono cargado.'
        }
        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-[9px] border border-borde
                   px-2.5 py-1.5 text-[12.5px] text-texto-tenue opacity-60"
      >
        <IconoWhatsApp />
        Sin teléfono
      </span>
    );
  }

  async function marcarAvisado(e) {
    // No se frena la navegación: el enlace abre en otra pestaña igual.
    e.stopPropagation();
    if (avisando) return;
    setAvisando(true);
    try {
      await api.post(`/api/socios/${socio.socio_id}/aviso`);
      onAvisado?.();
    } catch {
      /* que falle el registro no debe impedir el aviso */
    } finally {
      setAvisando(false);
    }
  }

  const clase =
    variante === 'primario'
      ? 'btn-primario'
      : 'inline-flex items-center gap-1.5 rounded-[9px] border border-[#25D366]/40 bg-[#25D366]/10 ' +
        'px-2.5 py-1.5 text-[12.5px] font-semibold text-[#25D366] transition-colors ' +
        'duration-rapido ease-salida hover:bg-[#25D366]/20';

  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      onClick={marcarAvisado}
      className={clase}
      title={mensaje}
    >
      <IconoWhatsApp />
      {texto ?? 'Avisar'}
    </a>
  );
}

/** "avisado hoy" / "avisado hace 3 días" — o nada si nunca se le avisó. */
export function SelloAviso({ dias }) {
  if (dias == null) return null;
  const texto = dias === 0 ? 'avisado hoy' : dias === 1 ? 'avisado ayer' : `avisado hace ${dias} d`;
  // Pasada una semana el aviso ya no cuenta: se vuelve a mostrar como pendiente.
  const viejo = dias > 7;
  return (
    <span
      className={`whitespace-nowrap text-[11px] ${viejo ? 'text-texto-tenue' : 'text-estado-bien'}`}
    >
      ✓ {texto}
    </span>
  );
}
