import { Link } from 'react-router-dom';

import { fecha, media, numero } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Cargando, InsigniaEstado, Tile, Vacio } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

export function Inicio() {
  const { usuario, membresia } = useAuth();
  const { datos: rutinas, cargando } = useDatos('/api/rutinas');
  const { datos: resumen } = useDatos('/api/entrenamiento/progreso/resumen');
  const { datos: sesiones } = useDatos('/api/entrenamiento/sesiones?limite=3');

  const rutinaActiva = rutinas?.find((r) => r.activa);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {usuario?.nombre}
        </h1>
        <p className="mt-0.5 text-[13.5px] text-texto-suave">
          {membresia?.codigo ? `Socio ${membresia.codigo}` : `CI ${usuario?.documento}`}
        </p>
      </header>

      {/* Estado de membresía: lo primero que el socio quiere saber. */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11.5px] uppercase tracking-wide text-texto-tenue">Membresía</p>
            <p className="mt-1 text-lg font-semibold">{membresia?.plan ?? 'Sin plan activo'}</p>
            {membresia?.fecha_fin && (
              <p className="mt-0.5 text-[13px] text-texto-suave">
                Vence el {fecha(membresia.fecha_fin)}
              </p>
            )}
          </div>
          <InsigniaEstado estado={membresia?.estado} dias={membresia?.dias_restantes} />
        </div>

        {membresia?.estado === 'VENCIDO' && (
          <p className="mt-3 rounded-[9px] border border-estado-critico/40 bg-estado-critico/10 px-3 py-2 text-[13px] text-estado-critico">
            Tu membresía venció. Pasá por el mostrador para renovarla.
          </p>
        )}
        {membresia?.estado === 'POR_VENCER' && (
          <p className="mt-3 rounded-[9px] border border-estado-aviso/40 bg-estado-aviso/10 px-3 py-2 text-[13px] text-estado-aviso">
            Te quedan {membresia.dias_restantes} días. Acordate de renovar.
          </p>
        )}
      </section>

      {/* Números del socio */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile etiqueta="Entrenamientos" valor={numero(resumen?.totales?.sesiones ?? 0)} />
        <Tile
          etiqueta="Este mes"
          valor={numero(resumen?.este_mes?.sesiones ?? 0)}
          detalle={`${numero(resumen?.este_mes?.volumen ?? 0)} kg movidos`}
        />
        <Tile etiqueta="Racha" valor={`${numero(resumen?.racha_semanas ?? 0)} sem`} acento />
        <Tile etiqueta="Volumen total" valor={`${numero(resumen?.totales?.volumen_total ?? 0)} kg`} />
      </div>

      {/* Rutina de hoy */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Tu rutina</h2>
          <Link to="/rutinas" className="text-[13px] text-texto-suave hover:text-texto">
            Ver todas
          </Link>
        </div>

        {cargando ? (
          <Cargando />
        ) : rutinaActiva ? (
          <RutinaResumen rutinaId={rutinaActiva.id} />
        ) : (
          <Vacio
            titulo="Todavía no tenés una rutina asignada"
            detalle="Pedile al profe que te arme una, o explorá el catálogo por tu cuenta."
            accion={<Link to="/ejercicios" className="btn-primario">Ver ejercicios</Link>}
          />
        )}
      </section>

      {/* Últimas sesiones */}
      {sesiones?.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">Últimos entrenamientos</h2>
            <Link to="/progreso" className="text-[13px] text-texto-suave hover:text-texto">
              Ver progreso
            </Link>
          </div>
          <ul className="space-y-2">
            {sesiones.map((s) => (
              <li key={s.id} className="tarjeta flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">
                    {s.dia_rutina ?? 'Entrenamiento libre'}
                  </p>
                  <p className="text-[12px] text-texto-suave">
                    {fecha(s.fecha)}
                    {s.duracion_min ? ` · ${s.duracion_min} min` : ''}
                  </p>
                </div>
                <span className="flex-none text-right">
                  <span className="block text-[14px] font-semibold tabular-nums">
                    {numero(s.volumen_kg ?? 0)} kg
                  </span>
                  <span className="block text-[11.5px] text-texto-tenue">
                    {s.series_completadas ?? 0} series
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Días de la rutina activa, con acceso directo a entrenar. */
function RutinaResumen({ rutinaId }) {
  const { datos: rutina, cargando } = useDatos(`/api/rutinas/${rutinaId}`);

  if (cargando) return <Cargando />;
  if (!rutina) return null;

  return (
    <div className="space-y-2">
      <p className="text-[13.5px] text-texto-suave">
        <span className="font-medium text-texto">{rutina.nombre}</span>
        {rutina.objetivo ? ` · ${rutina.objetivo}` : ''}
      </p>
      {rutina.dias.map((d) => (
        <div key={d.id} className="tarjeta flex items-center gap-3 p-2.5">
          <div className="flex -space-x-2">
            {d.ejercicios.slice(0, 3).map((ej) => (
              <img
                key={ej.id}
                src={media(ej.imagen)}
                alt=""
                loading="lazy"
                className="h-11 w-11 rounded-[9px] border-2 border-superficie bg-white object-cover"
              />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{d.etiqueta}</p>
            <p className="text-[12px] text-texto-suave">{d.ejercicios.length} ejercicios</p>
          </div>
          <Link to={`/entrenar/${d.id}`} className="btn-primario flex-none px-3 py-2 text-[13px]">
            Entrenar
          </Link>
        </div>
      ))}
    </div>
  );
}
