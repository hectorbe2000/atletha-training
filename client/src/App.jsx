import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './componentes/Layout.jsx';
import { Cargando } from './componentes/ui.jsx';
import { useAuth } from './auth.jsx';

import { CambiarPassword } from './paginas/CambiarPassword.jsx';
import { Login } from './paginas/Login.jsx';
import { NoEncontrado } from './paginas/NoEncontrado.jsx';

import { Catalogo } from './paginas/Catalogo.jsx';
import { Ejercicio } from './paginas/Ejercicio.jsx';

import { Entrenar } from './paginas/socio/Entrenar.jsx';
import { Inicio } from './paginas/socio/Inicio.jsx';
import { Rutinas } from './paginas/socio/Rutinas.jsx';

import { ArmarRutina } from './paginas/admin/ArmarRutina.jsx';
import { Ingreso } from './paginas/admin/Ingreso.jsx';
import { Planes } from './paginas/admin/Planes.jsx';
import { Plantillas } from './paginas/admin/Plantillas.jsx';
import { RutinasAdmin } from './paginas/admin/RutinasAdmin.jsx';
import { Socios } from './paginas/admin/Socios.jsx';

// Las dos únicas pantallas con gráficos. Recharts pesa más que todo el resto
// del sistema junto, así que viaja en su propio bundle y solo cuando se abren.
const Progreso = lazy(() =>
  import('./paginas/socio/Progreso.jsx').then((m) => ({ default: m.Progreso }))
);
const Panel = lazy(() =>
  import('./paginas/admin/Panel.jsx').then((m) => ({ default: m.Panel }))
);
// La ficha muestra el gráfico de peso, así que también arrastra Recharts.
const SocioFicha = lazy(() =>
  import('./paginas/admin/SocioFicha.jsx').then((m) => ({ default: m.SocioFicha }))
);

/** Exige sesión; opcionalmente, rol de administrador. */
function Privada({ children, admin = false }) {
  const { usuario, cargando, esAdmin } = useAuth();

  if (cargando) return <Cargando texto="Verificando sesión…" />;
  if (!usuario) return <Navigate to="/entrar" replace />;

  // Contraseña inicial sin cambiar: no se puede usar el sistema hasta cambiarla.
  if (usuario.debe_cambiar_password) return <Navigate to="/cambiar-password" replace />;

  if (admin && !esAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { usuario, esAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/entrar" element={usuario ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/cambiar-password" element={<CambiarPassword />} />

      <Route
        element={
          <Privada>
            <Layout />
          </Privada>
        }
      >
        {/* La raíz manda a cada rol a su pantalla */}
        <Route index element={esAdmin ? <Navigate to="/admin" replace /> : <Inicio />} />

        {/* Rutas con gráficos: se cargan bajo demanda */}
        <Route
          path="progreso"
          element={
            <Suspense fallback={<Cargando texto="Cargando gráficos…" />}>
              <Progreso />
            </Suspense>
          }
        />
        <Route
          path="admin"
          element={
            <Privada admin>
              <Suspense fallback={<Cargando texto="Cargando gráficos…" />}>
                <Panel />
              </Suspense>
            </Privada>
          }
        />

        {/* Catálogo: lo usan socio y admin */}
        <Route path="ejercicios" element={<Catalogo />} />
        <Route path="ejercicios/:codigo" element={<Ejercicio />} />

        {/* Socio */}
        <Route path="rutinas" element={<Rutinas />} />
        <Route path="entrenar/:diaId" element={<Entrenar />} />

        {/* Admin */}
        <Route path="admin/ingreso" element={<Privada admin><Ingreso /></Privada>} />
        <Route path="admin/socios" element={<Privada admin><Socios /></Privada>} />
        <Route
          path="admin/socios/:id"
          element={
            <Privada admin>
              <Suspense fallback={<Cargando texto="Cargando la ficha…" />}>
                <SocioFicha />
              </Suspense>
            </Privada>
          }
        />
        <Route path="admin/rutinas" element={<Privada admin><RutinasAdmin /></Privada>} />
        <Route path="admin/rutinas/nueva" element={<Privada admin><ArmarRutina /></Privada>} />
        <Route path="admin/rutinas/:id" element={<Privada admin><ArmarRutina /></Privada>} />
        <Route path="admin/plantillas" element={<Privada admin><Plantillas /></Privada>} />
        <Route path="admin/planes" element={<Privada admin><Planes /></Privada>} />

        <Route path="*" element={<NoEncontrado />} />
      </Route>
    </Routes>
  );
}
