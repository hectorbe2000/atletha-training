import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth.jsx';
import { DESARROLLADOR, FONDO_LOGIN, LOGO, NOMBRE_GIMNASIO } from '../marca.js';
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
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      {/* Foto del gimnasio de fondo. `fixed` para que cubra la pantalla aunque
          el formulario haga scroll en un celular chico.
          El velo encima es apenas el necesario para que el título y la línea
          del pie se lean: la foto ya es oscura de por sí, y cargarle más
          opacidad la convertía en una mancha gris. Más fuerte arriba y abajo,
          que es donde hay texto suelto; en el medio manda la tarjeta, que es
          opaca. */}
      <div aria-hidden="true" className="fixed inset-0 bg-fondo">
        <img src={FONDO_LOGIN} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-fondo/60 via-fondo/35 to-fondo/70" />
      </div>

      {/* `relative` sin z negativo en el fondo: apilar por orden es más
          predecible que pelearse con contextos de apilamiento. */}
      <div className="relative w-full max-w-sm">
        <div className="mb-7 text-center">
          {/* El logo viene sobre fondo blanco: se le pone la base blanca para
              que no quede un recuadro raro cuando el tema es oscuro. */}
          <img
            src={LOGO}
            alt={NOMBRE_GIMNASIO}
            width={96}
            height={96}
            className="mx-auto mb-4 h-24 w-24 rounded-2xl bg-white object-contain p-1.5"
          />
          {/* La sombra protege solo al texto, en vez de oscurecer toda la foto. */}
          <h1 className="text-2xl font-semibold tracking-tight [text-shadow:0_2px_14px_rgba(0,0,0,.85)]">
            {NOMBRE_GIMNASIO}
          </h1>
        </div>

        {/* Más opaca que una tarjeta normal: abajo hay una foto, no el fondo liso. */}
        <form onSubmit={enviar} className="tarjeta space-y-4 bg-superficie/95 p-5 shadow-2xl backdrop-blur-sm">
          <Campo etiqueta="Cédula o usuario" requerido>
            <input
              // El socio escribe su cédula; el mostrador, su nombre de usuario.
              // Por eso ya no se filtran las letras ni se fuerza el teclado
              // numérico: se acepta lo que sea y el servidor distingue.
              className="campo"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              autoComplete="username"
              placeholder="Tu cédula"
              maxLength={40}
              required
              autoFocus
            />
          </Campo>

          <Campo etiqueta="Contraseña">
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

        <p className="mt-5 text-center text-[12px] text-texto-suave [text-shadow:0_1px_10px_rgba(0,0,0,.9)]">
          ¿Olvidaste tu contraseña? Solicitá una nueva al encargado.
        </p>

        {/* La firma del que lo hizo: discreta, sin pelearle a la marca del gym. */}
        <p className="mt-8 text-center text-[11px] text-texto-tenue [text-shadow:0_1px_8px_rgba(0,0,0,.9)]">
          Desarrollado por {DESARROLLADOR}
        </p>
      </div>
    </div>
  );
}
