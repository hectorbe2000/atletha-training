import { useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/* --------------------------------------------------------------------
   Gráficos del sistema.

   Paleta: slots 1-3 del tema categórico (pasos oscuros), validados con
   scripts/validate_palette.js contra la superficie real #14171c —
   todas las comprobaciones pasan (peor par CVD ΔE 9.4, normal 20.9).
   El lima de la marca NO se usa en datos: es color de acción.

   Cada gráfico trae su vista de tabla: el tooltip nunca es la única
   manera de leer un valor.
   -------------------------------------------------------------------- */

export const SERIE = ['#3987e5', '#d95926', '#199e70'];
const GRILLA = '#2c2c2a';
const EJE = '#383835';
const MUTED = '#898781';

const ejeComun = {
  stroke: EJE,
  tickLine: false,
  axisLine: { stroke: EJE },
  tick: { fill: MUTED, fontSize: 11, fontVariantNumeric: 'tabular-nums' },
};

function Globo({ active, payload, label, formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[9px] border border-borde-fuerte bg-superficie-alta px-3 py-2 shadow-xl">
      <p className="mb-1 text-[11.5px] font-medium text-texto-suave">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-[13px]">
          <span className="h-2 w-2 flex-none rounded-full" style={{ background: p.color }} aria-hidden="true" />
          <span className="text-texto-suave">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">
            {formato ? formato(p.value) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Marco común: título, alternancia gráfico/tabla y el estado de recarga.
 * Al refrescar no se muestra esqueleto — se mantiene el render anterior
 * atenuado para que no salte el layout.
 */
export function MarcoGrafico({ titulo, detalle, recargando, children, tabla, alto = 260 }) {
  const [verTabla, setVerTabla] = useState(false);

  return (
    <section className="tarjeta p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14.5px] font-semibold tracking-tight">{titulo}</h3>
          {detalle && <p className="mt-0.5 text-[12px] text-texto-suave">{detalle}</p>}
        </div>
        {tabla && (
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="btn-fantasma flex-none px-2.5 py-1 text-[12px]"
            aria-pressed={verTabla}
          >
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        )}
      </header>

      <div
        className="transition-opacity duration-medio ease-salida"
        style={{ opacity: recargando ? 0.45 : 1 }}
      >
        {verTabla ? (
          <div className="max-h-[260px] overflow-auto">{tabla}</div>
        ) : (
          <div style={{ height: alto }}>{children}</div>
        )}
      </div>
    </section>
  );
}

export function TablaDatos({ columnas, filas }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 bg-superficie">
        <tr className="border-b border-borde text-left text-texto-suave">
          {columnas.map((c) => (
            <th key={c.clave} className={`py-1.5 pr-3 font-medium ${c.derecha ? 'text-right' : ''}`}>
              {c.titulo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-borde/60 last:border-0">
            {columnas.map((c) => (
              <td key={c.clave} className={`py-1.5 pr-3 ${c.derecha ? 'text-right tabular-nums' : ''}`}>
                {c.formato ? c.formato(f[c.clave], f) : f[c.clave]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Una serie de magnitud en el tiempo. Un color para todas las barras. */
export function BarrasSimples({ datos, x, y, nombre, formato, color = SERIE[0] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} margin={{ top: 6, right: 6, bottom: 0, left: -12 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRILLA} strokeWidth={1} vertical={false} />
        <XAxis dataKey={x} {...ejeComun} />
        <YAxis {...ejeComun} width={52} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,.04)' }}
          content={<Globo formato={formato} />}
        />
        <Bar dataKey={y} name={nombre} fill={color} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dos series comparables en la misma escala. Leyenda obligatoria. */
export function BarrasAgrupadas({ datos, x, series, formato }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={datos} margin={{ top: 6, right: 6, bottom: 0, left: -12 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid stroke={GRILLA} strokeWidth={1} vertical={false} />
        <XAxis dataKey={x} {...ejeComun} />
        <YAxis {...ejeComun} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,.04)' }} content={<Globo formato={formato} />} />
        <Legend
          verticalAlign="top"
          align="left"
          height={28}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: MUTED, paddingBottom: 4 }}
        />
        {series.map((s, i) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            name={s.nombre}
            fill={SERIE[i]}
            radius={[4, 4, 0, 0]}
            maxBarSize={26}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolución de una o dos medidas en la MISMA unidad (nunca dos ejes). */
export function Lineas({ datos, x, series, formato }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={datos} margin={{ top: 6, right: 10, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRILLA} strokeWidth={1} vertical={false} />
        <XAxis dataKey={x} {...ejeComun} />
        <YAxis {...ejeComun} width={48} />
        <Tooltip
          cursor={{ stroke: EJE, strokeWidth: 1 }}
          content={<Globo formato={formato} />}
        />
        {series.length > 1 && (
          <Legend
            verticalAlign="top"
            align="left"
            height={28}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: MUTED, paddingBottom: 4 }}
          />
        )}
        {series.map((s, i) => (
          <Line
            key={s.clave}
            type="monotone"
            dataKey={s.clave}
            name={s.nombre}
            stroke={SERIE[i]}
            strokeWidth={2}
            // Anillo de 2px del color de la superficie en los puntos, para que
            // no se peguen entre sí cuando las series se cruzan.
            dot={{ r: 4, fill: SERIE[i], stroke: '#14171c', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: SERIE[i], stroke: '#14171c', strokeWidth: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
