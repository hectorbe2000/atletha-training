import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth.jsx';
import { InsigniaEstado } from './ui.jsx';

const NAV_SOCIO = [
  { a: '/', texto: 'Inicio', movil: true, icono: 'M3 11 12 3l9 8M5 10v10h14V10' },
  { a: '/ejercicios', texto: 'Ejercicios', movil: true, icono: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11' },
  { a: '/rutinas', texto: 'Rutinas', movil: true, icono: 'M8 3v4M16 3v4M3 9h18M5 5h14v16H5z' },
  { a: '/progreso', texto: 'Progreso', movil: true, icono: 'M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16v-3' },
];

// `movil` marca lo que entra en la barra inferior del celular: con más de
// cuatro íconos las etiquetas no se leen. El resto queda en el menú de
// escritorio, que es donde el admin trabaja de verdad.
const NAV_ADMIN = [
  { a: '/admin', texto: 'Panel', movil: true, icono: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z' },
  { a: '/admin/ingreso', texto: 'Ingreso', movil: true, icono: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3' },
  { a: '/admin/socios', texto: 'Socios', movil: true, icono: 'M16 20v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
  { a: '/admin/rutinas', texto: 'Rutinas', movil: true, icono: 'M8 3v4M16 3v4M3 9h18M5 5h14v16H5z' },
  { a: '/ejercicios', texto: 'Ejercicios', icono: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11' },
  { a: '/admin/plantillas', texto: 'Plantillas', icono: 'M4 4h16v4H4zM4 11h10v9H4zM17 11h3v9h-3z' },
  { a: '/admin/planes', texto: 'Planes', icono: 'M3 7h18v12H3zM3 11h18M7 15h4' },
];

function Icono({ d }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function Layout() {
  const { usuario, membresia, esAdmin, salir } = useAuth();
  const navegar = useNavigate();
  const nav = esAdmin ? NAV_ADMIN : NAV_SOCIO;
  const navMovil = nav.filter((i) => i.movil);

  const cerrarSesion = () => {
    salir();
    navegar('/entrar', { replace: true });
  };

  return (
    <div className="min-h-dvh">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 border-b border-borde bg-fondo/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-acento text-[13px] text-acento-texto">
              G
            </span>
            <span className="hidden sm:inline">Gimnasio</span>
          </span>

          {/* Navegación de escritorio */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((i) => (
              <NavLink
                key={i.a}
                to={i.a}
                end={i.a === '/' || i.a === '/admin'}
                className={({ isActive }) =>
                  `rounded-[9px] px-3 py-1.5 text-[13.5px] transition-colors duration-rapido ease-salida ${
                    isActive ? 'bg-superficie-alta text-texto' : 'text-texto-suave hover:text-texto'
                  }`
                }
              >
                {i.texto}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {membresia && <InsigniaEstado estado={membresia.estado} dias={membresia.dias_restantes} />}
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight">
                {usuario?.nombre} {usuario?.apellido}
              </p>
              <p className="text-[11.5px] leading-tight text-texto-tenue">
                {esAdmin ? 'Administrador' : `CI ${usuario?.documento}`}
              </p>
            </div>
            <button type="button" onClick={cerrarSesion} className="btn-secundario px-3 py-1.5 text-[13px]">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 md:pb-12">
        <Outlet />
      </main>

      {/* Navegación inferior en celular */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-fondo/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl">
          {navMovil.map((i) => (
            <NavLink
              key={i.a}
              to={i.a}
              end={i.a === '/' || i.a === '/admin'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] transition-colors duration-rapido ease-salida ${
                  isActive ? 'text-acento' : 'text-texto-tenue'
                }`
              }
            >
              <Icono d={i.icono} />
              {i.texto}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
