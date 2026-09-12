import { useState } from 'react';
import { Link } from 'react-router-dom';

import { bajarArchivo, fecha, guaranies, numero, qs } from '../../api.js';
import { BotonWhatsApp, SelloAviso } from '../../componentes/BotonWhatsApp.jsx';
import { BarrasSimples, MarcoGrafico, TablaDatos } from '../../componentes/graficos.jsx';
import { Aviso, Campo, Cargando, InsigniaEstado, Modal, Tile } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';
import { mensajeAusencia, mensajeCumpleanos } from '../../whatsapp.js';

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
        <div className="flex flex-wrap gap-2">
          <DescargarPagos />
          <Link to="/admin/socios" className="btn-primario">+ Nuevo socio</Link>
        </div>
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
        <SociosAusentes />
        <Cumpleanos />
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

/**
 * Planilla de pagos por rango de fechas.
 *
 * Arranca en el primer día del mes en curso, que es el pedido de siempre:
 * "pasame los cobros de este mes".
 */
function DescargarPagos() {
  const [abierto, setAbierto] = useState(false);
  const hoy = new Date();
  const primero = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;

  const [desde, setDesde] = useState(primero);
  const [hasta, setHasta] = useState('');
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  async function bajar(e) {
    e.preventDefault();
    setError('');
    setBajando(true);
    try {
      await bajarArchivo(`/api/pagos/exportar${qs({ desde, hasta })}`, 'pagos.csv');
      setAbierto(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBajando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-secundario">
        Descargar cobros
      </button>

      <Modal abierto={abierto} titulo="Descargar cobros" onCerrar={() => setAbierto(false)}>
        <form onSubmit={bajar} className="space-y-4">
          <p className="text-[13px] text-texto-suave">
            Se baja un archivo que Excel abre con doble clic. Dejá las fechas vacías para
            traer todos los cobros.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde">
              <input type="date" className="campo" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hasta" hint="Vacío = hasta hoy.">
              <input type="date" className="campo" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </div>

          <Aviso tipo="error">{error}</Aviso>

          <div className="flex gap-2">
            <button type="submit" className="btn-primario flex-1" disabled={bajando}>
              {bajando ? 'Preparando…' : 'Descargar'}
            </button>
            <button type="button" onClick={() => setAbierto(false)} className="btn-secundario">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

const OPCIONES_DIAS = [10, 15, 21, 30];

/**
 * Los que están al día pero dejaron de venir.
 *
 * Es la lista que recupera plata: cuando el socio aparece en "vencidos" ya
 * decidió no volver. Acá todavía está pagando y se lo puede traer de vuelta.
 */
function SociosAusentes() {
  const [dias, setDias] = useState(15);
  const { datos, cargando, recargando, refrescar } = useDatos(
    `/api/dashboard/ausentes?dias=${dias}`
  );

  return (
    <section className="tarjeta p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[14.5px] font-semibold tracking-tight">Dejaron de venir</h2>
          <p className="mt-0.5 text-[12px] text-texto-suave">
            Están al día pero hace rato que no aparecen.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-texto-suave">
          <span className="sr-only">Días sin venir</span>
          <select
            className="campo w-auto py-1 text-[12.5px]"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
          >
            {OPCIONES_DIAS.map((d) => (
              <option key={d} value={d}>
                {d}+ días
              </option>
            ))}
          </select>
        </label>
      </header>

      {cargando ? (
        <p className="py-6 text-center text-[13px] text-texto-suave">Buscando…</p>
      ) : datos?.length ? (
        <ul className="space-y-1.5 transition-opacity duration-medio ease-salida" style={{ opacity: recargando ? 0.45 : 1 }}>
          {datos.map((s) => (
            <li
              key={s.socio_id}
              className="flex items-center gap-2 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2.5
                         transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
            >
              <Link to={`/admin/socios/${s.socio_id}`} className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium">{s.nombre_completo}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-texto-suave">
                  <span>
                    {s.nunca_vino
                      ? 'nunca vino'
                      : `sin venir hace ${s.dias_sin_venir} d`}
                    {' · '}
                    {/* Cuánto le queda pagado: es la urgencia real de llamarlo. */}
                    {s.dias_restantes > 0
                      ? `le quedan ${s.dias_restantes} d de plan`
                      : 'el plan se le termina hoy'}
                  </span>
                  <SelloAviso dias={s.dias_desde_aviso} />
                </p>
              </Link>
              <BotonWhatsApp
                socio={s}
                mensaje={mensajeAusencia(s)}
                rutaAviso={`/api/dashboard/ausentes/${s.socio_id}/aviso`}
                onAvisado={refrescar}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-texto-suave">
          Nadie al día lleva {dias} días sin venir. Buena señal.
        </p>
      )}
    </section>
  );
}

/** Cumpleaños de hoy y de los próximos días. */
function Cumpleanos() {
  const { datos, cargando } = useDatos('/api/dashboard/cumpleanos?dias=7');

  return (
    <section className="tarjeta p-4">
      <header className="mb-3">
        <h2 className="text-[14.5px] font-semibold tracking-tight">Cumpleaños</h2>
        <p className="mt-0.5 text-[12px] text-texto-suave">Hoy y los próximos 7 días.</p>
      </header>

      {cargando ? (
        <p className="py-6 text-center text-[13px] text-texto-suave">Buscando…</p>
      ) : datos?.length ? (
        <ul className="space-y-1.5">
          {datos.map((s) => {
            const hoy = s.faltan === 0;
            return (
              <li
                key={s.socio_id}
                className={`flex items-center gap-2 rounded-[9px] border px-3 py-2.5
                            transition-colors duration-rapido ease-salida
                            ${hoy ? 'border-acento/50 bg-acento/[.07]' : 'border-borde bg-superficie-alta hover:border-borde-fuerte'}`}
              >
                <Link to={`/admin/socios/${s.socio_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">
                    {hoy && <span aria-hidden="true">🎉 </span>}
                    {s.nombre_completo}
                  </p>
                  <p className="text-[11.5px] text-texto-suave">
                    {hoy
                      ? `cumple ${s.cumple} hoy`
                      : `cumple ${s.cumple} el ${fecha(s.proximo, { day: 'numeric', month: 'long' })}`}
                  </p>
                </Link>
                {/* El saludo no se registra: no hay riesgo de repetirlo mañana. */}
                <BotonWhatsApp
                  socio={s}
                  mensaje={mensajeCumpleanos(s)}
                  rutaAviso={null}
                  texto="Saludar"
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-texto-suave">
          Nadie cumple años esta semana.
        </p>
      )}
    </section>
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
