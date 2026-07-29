import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth.jsx';
import { Aviso, Campo } from '../componentes/ui.jsx';

export function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();

  const [documento, setDocumento] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const usuario = await entrar(documento.trim(), password);
      navegar(usuario.debe_cambiar_password ? '/cambiar-password' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-acento text-xl font-bold text-acento-texto">
            G
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Gimnasio</h1>
          <p className="mt-1 text-[13.5px] text-texto-suave">Entrá con tu número de cédula</p>
        </div>

        <form onSubmit={enviar} className="tarjeta space-y-4 p-5">
          <Campo etiqueta="Cédula de identidad" requerido>
            <input
              className="campo tabular-nums"
              value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoComplete="username"
              placeholder="1234567"
              maxLength={15}
              required
              autoFocus
            />
          </Campo>

          <Campo
            etiqueta="Contraseña"
            hint="Si es tu primera vez, tu contraseña es tu misma cédula."
          >
            <input
              type="password"
              className="campo"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </Campo>

          <Aviso tipo="error">{error}</Aviso>

          <button type="submit" className="btn-primario w-full" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-5 text-center text-[12px] text-texto-tenue">
          ¿Olvidaste tu contraseña? Pedí que te la reinicien en el mostrador.
        </p>
      </div>
    </div>
  );
}
