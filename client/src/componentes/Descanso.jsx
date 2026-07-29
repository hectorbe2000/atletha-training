import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cuenta regresiva del descanso entre series.
 *
 * Aparece pegada abajo apenas se marca una serie y se va sola al llegar a
 * cero. El socio la mira de reojo entre serie y serie, así que el número es
 * grande y los botones son grandes: se usa de pie, transpirado y con una mano.
 */

/** Pitido corto al terminar. Sin archivos: se sintetiza con WebAudio. */
function pitar() {
  try {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.connect(vol);
    vol.connect(ctx.destination);
    osc.frequency.value = 880;
    vol.gain.setValueAtTime(0.0001, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
    osc.onended = () => ctx.close();
  } catch {
    /* si el navegador no deja sonar, no pasa nada */
  }
}

export function useDescanso() {
  const [segundos, setSegundos] = useState(null);
  const [total, setTotal] = useState(0);
  const [etiqueta, setEtiqueta] = useState('');
  const fin = useRef(0);

  const arrancar = useCallback((duracion, texto = '') => {
    if (!duracion || duracion <= 0) return;
    fin.current = performance.now() + duracion * 1000;
    setTotal(duracion);
    setSegundos(duracion);
    setEtiqueta(texto);
  }, []);

  const cortar = useCallback(() => {
    setSegundos(null);
    fin.current = 0;
  }, []);

  const sumar = useCallback((extra) => {
    fin.current += extra * 1000;
    setTotal((t) => t + extra);
    setSegundos(Math.ceil((fin.current - performance.now()) / 1000));
  }, []);

  useEffect(() => {
    if (segundos === null) return undefined;

    // Se calcula contra un instante fijo, no restando de a uno: si el
    // navegador ralentiza el intervalo en segundo plano, el tiempo sigue
    // siendo el real.
    const id = setInterval(() => {
      const quedan = Math.ceil((fin.current - performance.now()) / 1000);
      if (quedan <= 0) {
        pitar();
        setSegundos(null);
        fin.current = 0;
      } else {
        setSegundos(quedan);
      }
    }, 250);

    return () => clearInterval(id);
  }, [segundos === null]);

  return { segundos, total, etiqueta, arrancar, cortar, sumar };
}

export function BarraDescanso({ segundos, total, etiqueta, onCortar, onSumar }) {
  if (segundos === null) return null;

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  const progreso = total ? ((total - segundos) / total) * 100 : 0;
  const porTerminar = segundos <= 5;

  return (
    <div
      role="timer"
      aria-live="off"
      className="fixed inset-x-0 bottom-[68px] z-40 px-3 md:bottom-4"
    >
      <div className="mx-auto max-w-md overflow-hidden rounded-xl2 border border-borde-fuerte bg-superficie-alta shadow-2xl">
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] uppercase tracking-wide text-texto-tenue">
              Descanso{etiqueta ? ` · ${etiqueta}` : ''}
            </p>
            <p
              className={`text-[30px] font-semibold leading-none tabular-nums transition-colors duration-rapido ease-salida
                          ${porTerminar ? 'text-acento' : 'text-texto'}`}
            >
              {minutos > 0 ? `${minutos}:${String(resto).padStart(2, '0')}` : `${resto}s`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => onSumar(15)}
            className="btn-secundario flex-none px-3 py-2 text-[13px]"
          >
            +15s
          </button>
          <button
            type="button"
            onClick={onCortar}
            className="btn-primario flex-none px-3 py-2 text-[13px]"
          >
            Listo
          </button>
        </div>

        <div className="h-1 bg-superficie">
          <div
            className="h-full bg-acento transition-[width] duration-medio ease-linear"
            style={{ width: `${progreso}%` }}
          />
        </div>
      </div>
    </div>
  );
}
