import { useEffect, useRef } from 'react';

/* --------------------------------------------------------------------
   Piezas chicas compartidas por todas las pantallas.
   -------------------------------------------------------------------- */

export function Cargando({ texto = 'Cargando…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 py-14 text-texto-suave ${className}`}>
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-borde-fuerte border-t-acento"
        aria-hidden="true"
      />
      <span className="text-sm">{texto}</span>
    </div>
  );
}

export function Vacio({ titulo, detalle, accion }) {
  return (
    <div className="tarjeta flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-[15px] font-semibold">{titulo}</p>
      {detalle && <p className="max-w-sm text-sm text-texto-suave">{detalle}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  );
}

export function Aviso({ tipo = 'error', children, className = '' }) {
  const estilos = {
    error: 'border-estado-critico/40 bg-estado-critico/10 text-estado-critico',
    ok: 'border-estado-bien/40 bg-estado-bien/10 text-estado-bien',
    info: 'border-borde bg-superficie-alta text-texto-suave',
  }[tipo];
  if (!children) return null;
  return (
    <p
      role={tipo === 'error' ? 'alert' : 'status'}
      className={`rounded-[9px] border px-3.5 py-2.5 text-[13px] leading-relaxed ${estilos} ${className}`}
    >
      {children}
    </p>
  );
}

/** Estado de membresía: color + ícono + texto. Nunca color solo. */
export function InsigniaEstado({ estado, dias, className = '' }) {
  const mapa = {
    AL_DIA: { texto: 'Al día', clase: 'text-estado-bien border-estado-bien/40 bg-estado-bien/10', icono: '●' },
    POR_VENCER: { texto: 'Por vencer', clase: 'text-estado-aviso border-estado-aviso/40 bg-estado-aviso/10', icono: '▲' },
    VENCIDO: { texto: 'Vencido', clase: 'text-estado-critico border-estado-critico/40 bg-estado-critico/10', icono: '■' },
    SIN_MEMBRESIA: { texto: 'Sin membresía', clase: 'text-texto-tenue border-borde bg-superficie-alta', icono: '○' },
  };
  const e = mapa[estado] ?? mapa.SIN_MEMBRESIA;

  let sufijo = '';
  if (estado === 'POR_VENCER' && dias != null) sufijo = ` · ${dias} d`;
  if (estado === 'VENCIDO' && dias != null) sufijo = ` · hace ${Math.abs(dias)} d`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${e.clase} ${className}`}
    >
      <span aria-hidden="true">{e.icono}</span>
      {e.texto}
      {sufijo}
    </span>
  );
}

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclado = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', alTeclado);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', alTeclado);
      document.body.style.overflow = previo;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`w-full ${ancho} max-h-[92vh] overflow-y-auto rounded-t-2xl border border-borde bg-superficie
                    p-5 shadow-2xl outline-none sm:rounded-xl2`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="btn-fantasma -mr-2 -mt-1 px-2 py-1" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({ etiqueta, error, hint, children, requerido }) {
  return (
    <label className="block">
      <span className="etiqueta">
        {etiqueta}
        {requerido && <span className="text-estado-critico"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[12px] text-estado-critico">{error}</span>}
      {hint && !error && <span className="mt-1 block text-[12px] text-texto-tenue">{hint}</span>}
    </label>
  );
}

/** Número grande. Es un dato, no un gráfico: tipografía, no color de serie. */
export function Tile({ etiqueta, valor, detalle, acento = false, className = '' }) {
  return (
    <div className={`tarjeta px-4 py-3.5 ${className}`}>
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-texto-tenue">{etiqueta}</p>
      <p className={`mt-1.5 text-[26px] font-semibold leading-none tracking-tight ${acento ? 'text-acento' : ''}`}>
        {valor}
      </p>
      {detalle && <p className="mt-1.5 text-[12px] text-texto-suave">{detalle}</p>}
    </div>
  );
}
