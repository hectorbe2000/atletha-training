import { Link } from 'react-router-dom';

export function NoEncontrado() {
  return (
    <div className="tarjeta flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-3xl font-semibold tracking-tight">404</p>
      <p className="text-texto-suave">Esta pantalla no existe.</p>
      <Link to="/" className="btn-secundario mt-2">
        Volver al inicio
      </Link>
    </div>
  );
}
