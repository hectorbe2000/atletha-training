import { useState } from 'react';
import { Link } from 'react-router-dom';

import { fecha, fechaCorta, numero } from '../../api.js';
import {
  BarrasAgrupadas, BarrasSimples, Lineas, MarcoGrafico, TablaDatos,
} from '../../componentes/graficos.jsx';
import { PesoYMedidas } from '../../componentes/PesoYMedidas.jsx';
import { Cargando, Tile, Vacio } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m) => {
  const [a, mes] = m.split('-');
  return `${MESES[Number(mes) - 1]} ${a.slice(2)}`;
};

export function Progreso() {
  // Un solo control de rango arriba: alcanza a todos los gráficos de la página.
  const [semanas, setSemanas] = useState(12);

  const { datos: resumen, cargando } = useDatos('/api/entrenamiento/progreso/resumen');
  const { datos: volumen, recargando: recVol } = useDatos(
    `/api/entrenamiento/progreso/volumen?semanas=${semanas}`
  );
  const { datos: asistencia, recargando: recAsis } = useDatos(
    '/api/entrenamiento/progreso/asistencia?meses=6'
  );

  const [codigoElegido, setCodigoElegido] = useState('');
  const { datos: evolucion, recargando: recEvo } = useDatos(
    codigoElegido ? `/api/entrenamiento/progreso/ejercicio/${codigoElegido}` : null,
    { activo: Boolean(codigoElegido) }
  );

  if (cargando) return <Cargando texto="Calculando tu progreso…" />;

  const sinDatos = !resumen?.totales?.sesiones;
  if (sinDatos) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Mi progreso</h1>
        <Vacio
          titulo="Todavía no registraste entrenamientos"
          detalle="Registrá tu primera sesión desde tu rutina y acá vas a ver el volumen, la asistencia y tus marcas."
          accion={<Link to="/rutinas" className="btn-primario">Ir a mis rutinas</Link>}
        />
        <PesoYMedidas />
      </div>
    );
  }

  const datosVolumen = (volumen ?? []).map((v) => ({ ...v, etiqueta: fechaCorta(v.semana) }));
  const datosAsistencia = (asistencia ?? []).map((a) => ({ ...a, etiqueta: etiquetaMes(a.mes) }));
  const datosEvolucion = (evolucion?.puntos ?? []).map((p) => ({
    ...p,
    etiqueta: fechaCorta(p.fecha),
    peso_max: Number(p.peso_max),
    rm_estimado: Number(p.rm_estimado),
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Mi progreso</h1>
        <label className="flex items-center gap-2 text-[13px] text-texto-suave">
          Últimas
          <select
            className="campo w-auto py-1.5 text-[13px]"
            value={semanas}
            onChange={(e) => setSemanas(Number(e.target.value))}
          >
            {[8, 12, 26, 52].map((n) => (
              <option key={n} value={n}>{n} semanas</option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile etiqueta="Entrenamientos" valor={numero(resumen.totales.sesiones)} />
        <Tile etiqueta="Series" valor={numero(resumen.totales.series)} />
        <Tile etiqueta="Volumen total" valor={`${numero(resumen.totales.volumen_total)} kg`} />
        <Tile etiqueta="Racha" valor={`${numero(resumen.racha_semanas)} sem`} acento />
      </div>

      <PesoYMedidas />

      <MarcoGrafico
        titulo="Volumen por semana"
        detalle="Kilos totales movidos (peso × repeticiones) en cada semana."
        recargando={recVol}
        tabla={
          <TablaDatos
            columnas={[
              { clave: 'semana', titulo: 'Semana', formato: (v) => fecha(v) },
              { clave: 'sesiones', titulo: 'Entrenamientos', derecha: true },
              { clave: 'series', titulo: 'Series', derecha: true },
              { clave: 'volumen_kg', titulo: 'Volumen (kg)', derecha: true, formato: (v) => numero(v) },
            ]}
            filas={volumen ?? []}
          />
        }
      >
        <BarrasSimples
          datos={datosVolumen}
          x="etiqueta"
          y="volumen_kg"
          nombre="Volumen"
          formato={(v) => `${numero(v)} kg`}
        />
      </MarcoGrafico>

      <MarcoGrafico
        titulo="Asistencia y entrenamientos por mes"
        detalle="Veces que pasaste por el gimnasio y sesiones que registraste."
        recargando={recAsis}
        tabla={
          <TablaDatos
            columnas={[
              { clave: 'mes', titulo: 'Mes', formato: etiquetaMes },
              { clave: 'asistencias', titulo: 'Asistencias', derecha: true },
              { clave: 'entrenamientos', titulo: 'Entrenamientos', derecha: true },
            ]}
            filas={asistencia ?? []}
          />
        }
      >
        <BarrasAgrupadas
          datos={datosAsistencia}
          x="etiqueta"
          series={[
            { clave: 'asistencias', nombre: 'Asistencias' },
            { clave: 'entrenamientos', nombre: 'Entrenamientos' },
          ]}
        />
      </MarcoGrafico>

      {/* Marcas por ejercicio */}
      {resumen.records?.length > 0 && (
        <section className="tarjeta p-4">
          <h3 className="mb-1 text-[14.5px] font-semibold tracking-tight">Tus mejores marcas</h3>
          <p className="mb-3 text-[12px] text-texto-suave">
            El 1RM estimado usa la fórmula de Epley: peso × (1 + reps ÷ 30). Es una estimación, no un máximo real.
          </p>
          <TablaDatos
            columnas={[
              { clave: 'nombre', titulo: 'Ejercicio' },
              { clave: 'peso_max', titulo: 'Peso máx.', derecha: true, formato: (v) => `${numero(v, 1)} kg` },
              { clave: 'rm_estimado', titulo: '1RM est.', derecha: true, formato: (v) => `${numero(v, 1)} kg` },
              {
                clave: 'codigo',
                titulo: '',
                derecha: true,
                formato: (v) => (
                  <button
                    type="button"
                    onClick={() => setCodigoElegido(v)}
                    className="text-[12px] text-acento hover:underline"
                  >
                    Ver evolución
                  </button>
                ),
              },
            ]}
            filas={resumen.records}
          />
        </section>
      )}

      {codigoElegido && (
        <MarcoGrafico
          titulo={`Evolución · ${evolucion?.ejercicio?.nombre ?? ''}`}
          detalle="Peso máximo levantado y 1RM estimado, ambos en kilos."
          recargando={recEvo}
          tabla={
            <TablaDatos
              columnas={[
                { clave: 'fecha', titulo: 'Fecha', formato: (v) => fecha(v) },
                { clave: 'peso_max', titulo: 'Peso máx. (kg)', derecha: true, formato: (v) => numero(v, 1) },
                { clave: 'rm_estimado', titulo: '1RM est. (kg)', derecha: true, formato: (v) => numero(v, 1) },
                { clave: 'series', titulo: 'Series', derecha: true },
              ]}
              filas={evolucion?.puntos ?? []}
            />
          }
        >
          {datosEvolucion.length > 1 ? (
            <Lineas
              datos={datosEvolucion}
              x="etiqueta"
              series={[
                { clave: 'peso_max', nombre: 'Peso máximo' },
                { clave: 'rm_estimado', nombre: '1RM estimado' },
              ]}
              formato={(v) => `${numero(v, 1)} kg`}
            />
          ) : (
            <div className="grid h-full place-items-center text-center text-[13px] text-texto-suave">
              Necesitás al menos dos días registrados con este ejercicio<br />para ver una línea de evolución.
            </div>
          )}
        </MarcoGrafico>
      )}
    </div>
  );
}
