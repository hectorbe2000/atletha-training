import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { media } from '../api.js';

/**
 * Card del catálogo — variante "Demostración" del prototipo.
 *
 * El GIF es el contenido: con los nombres del dataset en inglés, la animación
 * es el único identificador que el socio reconoce sin traducir nada.
 *
 * El costo de esa decisión (muchos GIFs corriendo a la vez en un celular
 * viejo) se paga con un IntersectionObserver: la animación solo se carga
 * mientras la card está en pantalla, y al salir vuelve a la foto fija.
 */

const sinMovimiento =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function IconoCorazon({ relleno }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={relleno ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20.5 4.2 13a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1A4.8 4.8 0 0 1 19.8 13Z" />
    </svg>
  );
}

export function CardEjercicio({ ejercicio, onFavorito, onAgregar, to }) {
  const { codigo, nombre, imagen, gif, musculo, equipo, favorito } = ejercicio;
  const contenedor = useRef(null);
  const [visible, setVisible] = useState(false);
  const [cargada, setCargada] = useState(false);

  useEffect(() => {
    if (sinMovimiento) return undefined;
    const nodo = contenedor.current;
    if (!nodo) return undefined;

    const observador = new IntersectionObserver(
      ([entrada]) => setVisible(entrada.isIntersecting),
      // Un poco de margen para que el GIF ya esté cargado al llegar.
      { rootMargin: '200px 0px' }
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  const animando = visible && !sinMovimiento;
  const fuente = animando ? media(gif) : media(imagen);

  return (
    <article
      ref={contenedor}
      className="group relative aspect-[4/5] overflow-hidden rounded-xl2 border border-borde
                 bg-superficie-alta transition-[transform,border-color] duration-medio ease-salida
                 hover:-translate-y-[3px] hover:border-borde-fuerte active:-translate-y-px"
    >
      <Link to={to ?? `/ejercicios/${codigo}`} className="block h-full w-full">
        <img
          key={fuente}
          src={fuente}
          alt={nombre}
          loading="lazy"
          decoding="async"
          onLoad={() => setCargada(true)}
          className={`h-full w-full bg-white object-cover transition-opacity duration-medio ease-salida
                      ${cargada ? 'opacity-100' : 'opacity-0'}`}
        />

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-11"
          style={{
            background:
              'linear-gradient(to top, rgba(6,8,10,.94) 12%, rgba(6,8,10,.72) 48%, transparent)',
          }}
        >
          <h3 className="mb-1.5 text-[15.5px] font-semibold leading-tight tracking-tight line-clamp-2">
            {nombre}
          </h3>
          <p className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-acento px-2 py-[3px] text-[11px] font-semibold text-acento-texto">
              {musculo ?? '—'}
            </span>
            <span className="rounded-full bg-white/[.12] px-2 py-[3px] text-[11px] text-[#e6eaf0]">
              {equipo ?? '—'}
            </span>
          </p>
        </div>
      </Link>

      <div className="absolute right-2.5 top-2.5 flex flex-col gap-2">
        {onFavorito && (
          <button
            type="button"
            aria-pressed={Boolean(favorito)}
            aria-label={favorito ? `Quitar ${nombre} de favoritos` : `Marcar ${nombre} como favorito`}
            onClick={() => onFavorito(codigo, !favorito)}
            className={`grid h-[34px] w-[34px] place-items-center rounded-full
                        border bg-[rgba(10,12,15,.62)] backdrop-blur transition-[transform,color,border-color]
                        duration-rapido ease-salida active:scale-90
                        ${favorito
                          ? 'border-[rgba(255,107,129,.45)] text-[#ff6b81]'
                          : 'border-borde text-texto-suave hover:border-borde-fuerte hover:text-texto'}`}
          >
            <IconoCorazon relleno={favorito} />
          </button>
        )}

        {onAgregar && (
          <button
            type="button"
            aria-label={`Agregar ${nombre} a mi rutina`}
            title="Agregar a mi rutina"
            onClick={() => onAgregar(ejercicio)}
            className="grid h-[34px] w-[34px] place-items-center rounded-full border border-borde
                       bg-[rgba(10,12,15,.62)] text-texto-suave backdrop-blur
                       transition-[transform,color,border-color] duration-rapido ease-salida
                       active:scale-90 hover:border-acento hover:text-acento"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Disposición densa reutilizada del prototipo "Ficha": el armador de rutinas
 * del admin necesita ver especificaciones, no mirar el movimiento.
 */
export function FilaEjercicio({ ejercicio, accion }) {
  const { codigo, nombre, imagen, musculo, equipo, zona } = ejercicio;
  return (
    <div className="tarjeta flex items-center gap-3 p-2.5">
      <img
        src={media(imagen)}
        alt=""
        loading="lazy"
        className="h-14 w-14 flex-none rounded-[9px] bg-white object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold leading-tight">{nombre}</p>
        <p className="mt-0.5 text-[12px] text-texto-suave">
          <span className="text-texto">{musculo}</span> · {equipo} · {zona}
        </p>
      </div>
      <span className="hidden flex-none text-[11px] tabular-nums text-texto-tenue sm:block">#{codigo}</span>
      {accion}
    </div>
  );
}
