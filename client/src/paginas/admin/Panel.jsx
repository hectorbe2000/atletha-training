import { Link } from 'react-router-dom';

import { fecha, guaranies, numero } from '../../api.js';
import { BotonWhatsApp, SelloAviso } from '../../componentes/BotonWhatsApp.jsx';
import { BarrasSimples, MarcoGrafico, TablaDatos } from '../../componentes/graficos.jsx';
import { Cargando, InsigniaEstado, Tile } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m) => {
  const [a, mes] = m.split('-');
  return `${MESES[Number(mes) - 1]} ${a.slice(2)}`;
};

export function Panel() {
  const { datos, cargando, refrescar } = useDatos('/api/dashboard');
  const { datos: asistencia, recargando: recAsis } = useDatos('/api/dashboard/asistencia?dias=30');

  if (cargando) return <Cargando texto="Cargando el panel…" />;
  if (!datos) return null;

  const { socios, cobranza, asistencia_hoy: hoy, por_vencer: porVencer, vencidos, ingresos_mes } = datos;

  const datosIngresos = (ingresos_mes ?? []).map((m) => ({ ...m, etiqueta: etiquetaMes(m.mes) }));
  const datosAsistencia = (asistencia ?? []).map((d) => ({
    ...d,
    etiqueta: fecha(d.fecha, { day: '2-digit', month: '2-digit' }),
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <Link to="/admin/socios" className="btn-primario">+ Nuevo socio</Link>
      </header>

      {/* Los números del día */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          etiqueta="Cobrado hoy"
          valor={guaranies(cobranza.hoy)}
          detalle={`${numero(cobranza.cobros)} ${cobranza.cobros === 1 ? 'cobro' : 'cobros'}`}
          acento
        />
        <Tile etiqueta="Entraron hoy" valor={numero(hoy)} detalle="asistencias registradas" />
        <Tile
          etiqueta="Socios activos"
          valor={numero(socios.total)}
          detalle={`${numero(socios.al_dia)} al día`}
        />
        <Tile
          etiqueta="Requieren atención"
          valor={numero(socios.vencidos + socios.por_vencer)}
          detalle={`${numero(socios.vencidos)} vencidos · ${numero(socios.por_vencer)} por vencer`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MarcoGrafico
          titulo="Ingresos por mes"
          detalle="Últimos 12 meses de cobros registrados."
          tabla={
            <TablaDatos
              columnas={[
                { clave: 'mes', titulo: 'Mes', formato: etiquetaMes },
                { clave: 'cobros', titulo: 'Cobros', derecha: true },
                { clave: 'total', titulo: 'Total', derecha: true, formato: (v) => guaranies(v) },
              ]}
              filas={ingresos_mes ?? []}
            />
          }
        >
          <BarrasSimples
            datos={datosIngresos}
            x="etiqueta"
            y="total"
            nombre="Ingresos"
            formato={(v) => guaranies(v)}
          />
        </MarcoGrafico>

        <MarcoGrafico
          titulo="Asistencia diaria"
          detalle="Personas que entraron cada día, últimos 30 días."
          recargando={recAsis}
          tabla={
            <TablaDatos
              columnas={[
                { clave: 'fecha', titulo: 'Día', formato: (v) => fecha(v) },
                { clave: 'total', titulo: 'Asistencias', derecha: true },
              ]}
              filas={asistencia ?? []}
            />
          }
        >
          <BarrasSimples datos={datosAsistencia} x="etiqueta" y="total" nombre="Asistencias" />
        </MarcoGrafico>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaSocios
          titulo="Vencidos"
          detalle="Ordenados por el vencimiento más reciente."
          socios={vencidos}
          vacio="No hay socios con la membresía vencida."
          extra={(s) => `Venció el ${fecha(s.fecha_fin)} · hace ${s.dias_vencido} d`}
          estado="VENCIDO"
          onAvisado={refrescar}
        />
        <ListaSocios
          titulo="Por vencer esta semana"
          detalle="Buen momento para avisarles."
          socios={porVencer}
          vacio="Nadie vence en los próximos 7 días."
          extra={(s) => `Vence el ${fecha(s.fecha_fin)} · en ${s.dias_restantes} d`}
          estado="POR_VENCER"
          onAvisado={refrescar}
        />
      </div>
    </div>
  );
}

function ListaSocios({ titulo, detalle, socios, vacio, extra, estado, onAvisado }) {
  return (
    <section className="tarjeta p-4">
      <header className="mb-3">
        <h2 className="text-[14.5px] font-semibold tracking-tight">{titulo}</h2>
        <p className="mt-0.5 text-[12px] text-texto-suave">{detalle}</p>
      </header>

      {socios?.length ? (
        <ul className="space-y-1.5">
          {socios.map((s) => (
            <li
              key={s.socio_id}
              className="flex items-center gap-2 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2.5
                         transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
            >
              <Link to={`/admin/socios/${s.socio_id}`} className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{s.nombre_completo}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-texto-suave">
                  <span>{s.codigo} · {s.plan ?? 'sin plan'} · {extra(s)}</span>
                  <SelloAviso dias={s.dias_desde_aviso} />
                </p>
              </Link>
              <InsigniaEstado estado={estado} />
              <BotonWhatsApp socio={{ ...s, estado }} onAvisado={onAvisado} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-texto-suave">{vacio}</p>
      )}
    </section>
  );
}
