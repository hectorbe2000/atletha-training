import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { api, guardarToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Aviso, Campo, Cargando } from '../componentes/ui.jsx';

export function CambiarPassword() {
  const { usuario, cargando, refrescar, salir } = useAuth();
  const navegar = useNavigate();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/entrar" replace />;

  const obligatorio = usuario.debe_cambiar_password;

  async function enviar(e) {
    e.preventDefault();
    setError('');
    if (nueva !== repetir) {
      setError('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    setEnviando(true);
    try {
      const r = await api.post('/api/auth/cambiar-password', {
        password_actual: actual,
        password_nueva: nueva,
      });
      // Cambiar la contraseña invalida las sesiones abiertas, incluida esta:
      // el servidor devuelve un token nuevo para no dejarnos afuera.
      if (r?.token) guardarToken(r.token);
      await refrescar();
      navegar('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">
          {obligatorio ? 'Elegí tu contraseña' : 'Cambiar contraseña'}
        </h1>
        <p className="mb-6 text-[13.5px] text-texto-suave">
          {obligatorio
            ? 'Estás usando la contraseña inicial. Elegí una propia para continuar.'
            : 'Tu contraseña nueva reemplaza a la actual en todos tus dispositivos.'}
        </p>

        <form onSubmit={enviar} className="tarjeta space-y-4 p-5">
          <Campo etiqueta="Contraseña actual" requerido>
            <input
              type="password"
              className="campo"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </Campo>

          <Campo etiqueta="Contraseña nueva" hint="Mínimo 6 caracteres." requerido>
            <input
              type="password"
              className="campo"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </Campo>

          <Campo etiqueta="Repetí la contraseña nueva" requerido>
            <input
              type="password"
              className="campo"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </Campo>

          <Aviso tipo="error">{error}</Aviso>

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar contraseña'}
          </button>

          <button
            type="button"
            onClick={() => {
              salir();
              navegar('/entrar', { replace: true });
            }}
            className="btn-fantasma w-full"
          >
            Salir
          </button>
        </form>
      </div>
    </div>
  );
}
