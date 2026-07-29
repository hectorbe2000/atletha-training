import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, fecha, fechaHora, guaranies } from '../../api.js';
import { BotonWhatsApp } from '../../componentes/BotonWhatsApp.jsx';
import { EditarSocio } from '../../componentes/EditarSocio.jsx';
import { FotoSocio } from '../../componentes/FotoSocio.jsx';
import { PesoYMedidas } from '../../componentes/PesoYMedidas.jsx';
import { Aviso, Campo, Cargando, InsigniaEstado, Modal, Tile } from '../../componentes/ui.jsx';
import { useDatos } from '../../hooks.js';

export function SocioFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { datos, error, cargando, refrescar } = useDatos(`/api/socios/${id}`);

  const [abrirCobro, setAbrirCobro] = useState(false);
  const [abrirEdicion, setAbrirEdicion] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');

  if (cargando) return <Cargando texto="Cargando la ficha…" />;
  if (error) return <Aviso tipo="error">{error.message}</Aviso>;
  if (!datos) return null;

  const { socio, membresias, pagos, rutinas, asistencias } = datos;

  async function registrarAsistencia() {
    setErrorAccion(''); setMensaje('');
    try {
      const r = await api.post(`/api/socios/${id}/asistencia`);
      setMensaje(r.duplicado ? r.mensaje : 'Asistencia registrada.');
      refrescar();
    } catch (e) {
      setErrorAccion(e.message);
    }
  }

  async function reiniciarPassword() {
    setErrorAccion(''); setMensaje('');
    try {
      const r = await api.post(`/api/socios/${id}/reset-password`);
      setMensaje(r.mensaje);
    } catch (e) {
      setErrorAccion(e.message);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navegar(-1)} className="btn-fantasma -ml-2 px-2 text-[13px]">
        ← Volver
      </button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <FotoSocio socio={socio} tam={72} editable onCambio={refrescar} className="flex-col items-start" />
          <div>
          <h1 className="text-2xl font-semibold tracking-tight">{socio.nombre_completo}</h1>
          <p className="mt-1 text-[13px] text-texto-suave">
            {socio.codigo} · CI {socio.documento}
            {socio.telefono ? ` · ${socio.telefono}` : ''}
            {socio.email ? ` · ${socio.email}` : ''}
          </p>
          <p className="mt-0.5 text-[12.5px] text-texto-tenue">
            Socio desde {fecha(socio.fecha_ingreso)}
            {socio.ultimo_acceso ? ` · último ingreso al sistema ${fechaHora(socio.ultimo_acceso)}` : ' · nunca entró al sistema'}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {socio.estado !== 'AL_DIA' && (
            <BotonWhatsApp socio={socio} onAvisado={refrescar} texto="Avisar por WhatsApp" />
          )}
          <button type="button" onClick={() => setAbrirEdicion(true)} className="btn-secundario">
            Editar datos
          </button>
          <button type="button" onClick={registrarAsistencia} className="btn-secundario">
            Registrar asistencia
          </button>
          <button type="button" onClick={() => setAbrirCobro(true)} className="btn-primario">
            Cobrar / renovar
          </button>
        </div>
      </header>

      {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
      {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
      {!socio.activo && (
        <Aviso tipo="error">
          Este socio está dado de baja: no aparece en el listado, no puede entrar al sistema
          ni pasar por el mostrador. Reactivalo desde “Editar datos”.
        </Aviso>
      )}

      {/* Estado actual */}
      <section className="tarjeta p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11.5px] uppercase tracking-wide text-texto-tenue">Membresía actual</p>
            <p className="mt-1 text-lg font-semibold">{socio.plan ?? 'Sin plan'}</p>
            {socio.fecha_fin && (
              <p className="mt-0.5 text-[13px] text-texto-suave">
                {fecha(socio.fecha_inicio)} → {fecha(socio.fecha_fin)}
              </p>
            )}
          </div>
          <InsigniaEstado estado={socio.estado} dias={socio.dias_restantes} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile etiqueta="Asistencias" valor={asistencias?.total ?? 0} detalle={`${asistencias?.este_mes ?? 0} este mes`} />
        <Tile etiqueta="Última vez" valor={asistencias?.ultima ? fecha(asistencias.ultima, { day: '2-digit', month: '2-digit' }) : '—'} />
        <Tile etiqueta="Pagos" valor={pagos?.length ?? 0} />
        <Tile etiqueta="Rutinas" valor={rutinas?.filter((r) => r.activa).length ?? 0} detalle="activas" />
      </div>

      {socio.observaciones_medicas && (
        <section className="tarjeta border-estado-aviso/40 p-4">
          <p className="mb-1 flex items-center gap-2 text-[12.5px] font-semibold text-estado-aviso">
            <span aria-hidden="true">▲</span> Observaciones médicas
          </p>
          <p className="text-[13.5px] leading-relaxed text-texto-suave">{socio.observaciones_medicas}</p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rutinas */}
        <section className="tarjeta p-4">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[14.5px] font-semibold">Rutinas</h2>
            <Link to={`/admin/rutinas/nueva?socio=${id}`} className="text-[13px] text-acento hover:underline">
              + Armar rutina
            </Link>
          </header>
          {rutinas?.length ? (
            <ul className="space-y-1.5">
              {rutinas.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/admin/rutinas/${r.id}`}
                    className="flex items-center gap-3 rounded-[9px] border border-borde bg-superficie-alta px-3 py-2.5
                               transition-colors duration-rapido ease-salida hover:border-borde-fuerte"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{r.nombre}</p>
                      <p className="text-[11.5px] text-texto-suave">
                        {r.objetivo ? `${r.objetivo} · ` : ''}{r.dias_por_semana} días · desde {fecha(r.fecha_inicio)}
                      </p>
                    </div>
                    {!r.activa && (
                      <span className="flex-none rounded-full border border-borde px-2 py-0.5 text-[11px] text-texto-tenue">
                        archivada
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-center text-[13px] text-texto-suave">Todavía no tiene rutinas.</p>
          )}
        </section>

        {/* Historial de pagos */}
        <section className="tarjeta p-4">
          <h2 className="mb-3 text-[14.5px] font-semibold">Últimos pagos</h2>
          {pagos?.length ? (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-borde text-left text-texto-suave">
                  <th className="py-1.5 font-medium">Fecha</th>
                  <th className="py-1.5 font-medium">Método</th>
                  <th className="py-1.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-borde/60 last:border-0">
                    <td className="py-1.5">{fecha(p.fecha_pago)}</td>
                    <td className="py-1.5 text-texto-suave">{p.metodo[0] + p.metodo.slice(1).toLowerCase()}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{guaranies(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-5 text-center text-[13px] text-texto-suave">No hay pagos registrados.</p>
          )}
        </section>
      </div>

      {/* Peso y medidas */}
      <section className="tarjeta p-4">
        <PesoYMedidas socioId={id} titulo="Peso y medidas del socio" compacto />
      </section>

      {/* Historial de membresías */}
      <section className="tarjeta p-4">
        <h2 className="mb-3 text-[14.5px] font-semibold">Historial de membresías</h2>
        {membresias?.length ? (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-borde text-left text-texto-suave">
                <th className="py-1.5 font-medium">Plan</th>
                <th className="py-1.5 font-medium">Desde</th>
                <th className="py-1.5 font-medium">Hasta</th>
                <th className="py-1.5 font-medium">Estado</th>
                <th className="py-1.5 text-right font-medium">Precio</th>
              </tr>
            </thead>
            <tbody>
              {membresias.map((m) => (
                <tr key={m.id} className="border-b border-borde/60 last:border-0">
                  <td className="py-1.5">{m.plan}</td>
                  <td className="py-1.5 text-texto-suave">{fecha(m.fecha_inicio)}</td>
                  <td className="py-1.5 text-texto-suave">{fecha(m.fecha_fin)}</td>
                  <td className="py-1.5 text-texto-suave">{m.estado[0] + m.estado.slice(1).toLowerCase()}</td>
                  <td className="py-1.5 text-right tabular-nums">{guaranies(m.precio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-5 text-center text-[13px] text-texto-suave">Sin membresías cargadas.</p>
        )}
      </section>

      <section className="tarjeta p-4">
        <h2 className="mb-1 text-[14.5px] font-semibold">Acceso del socio</h2>
        <p className="mb-3 text-[12.5px] text-texto-suave">
          Si se olvidó la contraseña, se la reiniciás a su cédula y el sistema le pide cambiarla al entrar.
        </p>
        <button type="button" onClick={reiniciarPassword} className="btn-secundario">
          Reiniciar contraseña
        </button>
      </section>

      <EditarSocio
        abierto={abrirEdicion}
        socio={socio}
        onCerrar={() => setAbrirEdicion(false)}
        onGuardado={() => { setAbrirEdicion(false); setMensaje('Datos actualizados.'); refrescar(); }}
      />

      <ModalCobro
        abierto={abrirCobro}
        socioId={id}
        estadoActual={socio}
        onCerrar={() => setAbrirCobro(false)}
        onCobrado={() => { setAbrirCobro(false); setMensaje('Cobro registrado y membresía renovada.'); refrescar(); }}
      />
    </div>
  );
}

function ModalCobro({ abierto, socioId, estadoActual, onCerrar, onCobrado }) {
  const { datos: planes } = useDatos('/api/planes', { activo: abierto });

  const [planId, setPlanId] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [monto, setMonto] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [comprobante, setComprobante] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const plan = planes?.find((p) => String(p.id) === String(planId));
  const vigente = estadoActual?.estado === 'AL_DIA' || estadoActual?.estado === 'POR_VENCER';

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api.post(`/api/socios/${socioId}/renovar`, {
        plan_id: Number(planId),
        metodo,
        ...(monto !== '' ? { monto: Number(monto) } : {}),
        ...(fechaInicio ? { fecha_inicio: fechaInicio } : {}),
        ...(comprobante ? { comprobante } : {}),
      });
      setPlanId(''); setMonto(''); setFechaInicio(''); setComprobante('');
      setEnviando(false);
      onCobrado();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Cobrar y renovar" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        {vigente && (
          <Aviso tipo="info">
            La membresía actual vence el {fecha(estadoActual.fecha_fin)}. El período nuevo va a arrancar
            el día siguiente, así no se pierden días.
          </Aviso>
        )}

        <Campo etiqueta="Plan" requerido>
          <select className="campo" value={planId} onChange={(e) => setPlanId(e.target.value)} required autoFocus>
            <option value="">Elegí un plan…</option>
            {planes?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.duracion_dias} días — {guaranies(p.precio)}
              </option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Método de pago">
            <select className="campo" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO'].map((m) => (
                <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Monto cobrado" hint={plan ? `Precio del plan: ${guaranies(plan.precio)}` : 'Dejalo vacío para usar el precio del plan.'}>
            <input
              type="number"
              className="campo tabular-nums"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder={plan ? String(plan.precio) : ''}
              min="0"
            />
          </Campo>
          <Campo etiqueta="Inicio del período" hint="Vacío = encadenar al vencimiento actual.">
            <input type="date" className="campo" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </Campo>
          <Campo etiqueta="Comprobante">
            <input className="campo" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="N.º de recibo" maxLength={40} />
          </Campo>
        </div>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando || !planId}>
            {enviando ? 'Registrando…' : 'Registrar cobro'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
