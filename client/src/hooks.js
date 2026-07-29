import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api.js';

/**
 * Carga una ruta de la API.
 *
 * Mantiene los datos anteriores mientras recarga (`recargando`) en vez de
 * volver al esqueleto: así el layout no salta al cambiar un filtro.
 */
export function useDatos(ruta, { activo = true } = {}) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(activo);
  const [recargando, setRecargando] = useState(false);
  const primeraVez = useRef(true);

  const cargar = useCallback(
    async (signal) => {
      if (!activo || !ruta) {
        setCargando(false);
        return;
      }
      if (primeraVez.current) setCargando(true);
      else setRecargando(true);

      try {
        const respuesta = await api.get(ruta, { signal });
        if (signal?.aborted) return;
        setDatos(respuesta);
        setError(null);
      } catch (err) {
        if (err.name === 'AbortError' || signal?.aborted) return;
        setError(err);
      } finally {
        if (!signal?.aborted) {
          setCargando(false);
          setRecargando(false);
          primeraVez.current = false;
        }
      }
    },
    [ruta, activo]
  );

  useEffect(() => {
    const control = new AbortController();
    cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  const refrescar = useCallback(() => cargar(), [cargar]);

  return { datos, error, cargando, recargando, refrescar, setDatos };
}

/** Retrasa un valor: evita pegarle a la API en cada tecla del buscador. */
export function useRetraso(valor, ms = 300) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
