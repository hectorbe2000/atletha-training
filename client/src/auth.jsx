import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { api, borrarToken, cuandoExpire, guardarToken, leerToken } from './api.js';

const ContextoAuth = createContext(null);

export function ProveedorAuth({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [membresia, setMembresia] = useState(null);
  const [cargando, setCargando] = useState(Boolean(leerToken()));

  const salir = useCallback(() => {
    borrarToken();
    setUsuario(null);
    setMembresia(null);
  }, []);

  // Si la API responde 401 en cualquier punto, la sesión se cae acá.
  useEffect(() => cuandoExpire(() => salir()), [salir]);

  const refrescar = useCallback(async () => {
    if (!leerToken()) {
      setUsuario(null);
      setCargando(false);
      return;
    }
    try {
      const datos = await api.get('/api/auth/yo', { sinRedirigir: true });
      setUsuario(datos.usuario);
      setMembresia(datos.membresia);
    } catch {
      borrarToken();
      setUsuario(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const entrar = useCallback(
    async (documento, password) => {
      const datos = await api.post('/api/auth/login', { documento, password }, { sinRedirigir: true });
      guardarToken(datos.token);
      setUsuario(datos.usuario);
      await refrescar();
      return datos.usuario;
    },
    [refrescar]
  );

  const valor = useMemo(
    () => ({
      usuario,
      membresia,
      cargando,
      entrar,
      salir,
      refrescar,
      esAdmin: usuario?.rol === 'ADMIN',
      esSocio: usuario?.rol === 'SOCIO',
    }),
    [usuario, membresia, cargando, entrar, salir, refrescar]
  );

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

export function useAuth() {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <ProveedorAuth>.');
  return ctx;
}
