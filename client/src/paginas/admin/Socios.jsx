import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, bajarArchivo, fecha, guaranies, qs } from '../../api.js';
import { BotonComprobante } from '../../componentes/BotonComprobante.jsx';
import { BotonWhatsApp, SelloAviso } from '../../componentes/BotonWhatsApp.jsx';
import { FotoSocio } from '../../componentes/FotoSocio.jsx';
import { Aviso, Campo, Cargando, InsigniaEstado, Modal, Vacio } from '../../componentes/ui.jsx';
import { useDatos, useRetraso } from '../../hooks.js';

const ESTADOS = [
  ['', 'Todos los estados'],
  ['VENCIDO', 'Vencidos'],
  ['POR_VENCER', 'Por vencer'],
  ['AL_DIA', 'Al día'],
  ['SIN_MEMBRESIA', 'Sin membresía'],
];

export function Socios() {
  const [buscar, setBuscar] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const [abrirAlta, setAbrirAlta] = useState(false);

  const busquedaRetrasada = useRetraso(buscar, 300);
  const ruta = useMemo(
    () => `/api/socios${qs({ buscar: busquedaRetrasada, estado, pagina, limite: 20 })}`,
    [busquedaRetrasada, estado, pagina]
  );

  const { datos, error, cargando, recargando, refrescar } = useDatos(ruta);

  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState('');

  /**
   * Baja la planilla completa, no la página que se está viendo: quien la pide
   * la quiere para el contador o para su propio control, no para revisar 20
   * filas que ya tiene en pantalla.
   */
  async function descargarPlanilla() {
    setErrorDescarga('');
    setDescargando(true);
    try {
      await bajarArchivo('/api/socios/exportar', 'socios.csv');
    } catch (e) {
      setErrorDescarga(e.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Socios</h1>
          <p className="mt-0.5 text-[13px] tabular-nums text-texto-suave">
            {datos ? `${datos.total} socios` : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={descargarPlanilla}
            disabled={descargando}
            className="btn-secundario"
            title="Baja la lista completa en un archivo que Excel abre directo"
          >
            {descargando ? 'Preparando…' : 'Descargar Excel'}
          </button>
          <button type="button" onClick={() => setAbrirAlta(true)} className="btn-primario">
            + Nuevo socio
          </button>
        </div>
      </header>

      {errorDescarga && <Aviso tipo="error" className="mb-3">{errorDescarga}</Aviso>}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="search"
          className="campo min-w-[14rem] flex-1"
          placeholder="Buscar por nombre, cédula o código…"
          value={buscar}
          onChange={(e) => { setBuscar(e.target.value); setPagina(1); }}
          aria-label="Buscar socios"
        />
        <select
          className="campo w-auto flex-none"
          value={estado}
          onChange={(e) => { setEstado(e.target.value); setPagina(1); }}
          aria-label="Filtrar por estado"
        >
          {ESTADOS.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      </div>

      {error && <Aviso tipo="error">{error.message}</Aviso>}

      {cargando ? (
        <Cargando texto="Cargando socios…" />
      ) : datos?.datos?.length ? (
        <>
          <ul className="space-y-2 transition-opacity duration-medio ease-salida" style={{ opacity: recargando ? 0.45 : 1 }}>
            {datos.datos.map((s) => (
              <li key={s.socio_id} className="tarjeta flex flex-wrap items-center gap-3 p-3 transition-colors duration-rapido ease-salida hover:border-borde-fuerte">
                <Link to={`/admin/socios/${s.socio_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <FotoSocio socio={s} tam={40} />
                  <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold">{s.nombre_completo}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-texto-suave">
                    <span>
                      {s.codigo} · CI {s.documento}
                      {s.telefono ? ` · ${s.telefono}` : ''}
                    </span>
                    <SelloAviso dias={s.dias_desde_aviso} />
                  </p>
                  </div>
                </Link>
                <div className="hidden text-right sm:block">
                  <p className="text-[13px]">{s.plan ?? 'Sin plan'}</p>
                  <p className="text-[11.5px] text-texto-tenue">
                    {s.fecha_fin ? `hasta ${fecha(s.fecha_fin)}` : '—'}
                  </p>
                </div>
                <InsigniaEstado estado={s.estado} dias={s.dias_restantes} />
                {/* El comprobante del último cobro, sin entrar a la ficha:
                    si al cobrar se olvidaron de bajarlo, está acá. */}
                {s.ultimo_pago_id && (
                  <BotonComprobante
                    pagoId={s.ultimo_pago_id}
                    titulo="Bajar el comprobante del último pago"
                  />
                )}
                {s.estado !== 'AL_DIA' && <BotonWhatsApp socio={s} onAvisado={refrescar} />}
              </li>
            ))}
          </ul>

          {datos.paginas > 1 && (
            <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Paginación">
              <button className="btn-secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <span className="text-[13px] tabular-nums text-texto-suave">{pagina} / {datos.paginas}</span>
              <button className="btn-secundario" disabled={pagina >= datos.paginas} onClick={() => setPagina((p) => p + 1)}>
                Siguiente
              </button>
            </nav>
          )}
        </>
      ) : (
        <Vacio
          titulo="No hay socios que coincidan"
          detalle={buscar || estado ? 'Probá con otro filtro.' : 'Todavía no cargaste ningún socio.'}
          accion={<button type="button" onClick={() => setAbrirAlta(true)} className="btn-primario">+ Nuevo socio</button>}
        />
      )}

      <AltaSocio
        abierto={abrirAlta}
        onCerrar={() => setAbrirAlta(false)}
        onCreado={() => { setAbrirAlta(false); refrescar(); }}
      />
    </div>
  );
}

function AltaSocio({ abierto, onCerrar, onCreado }) {
  const { datos: planes } = useDatos('/api/planes', { activo: abierto });

  const [form, setForm] = useState({
    documento: '', password: '', nombre: '', apellido: '', telefono: '', email: '',
    fecha_nacimiento: '', sexo: '', objetivo: '', observaciones_medicas: '',
    plan_id: '', metodo: 'EFECTIVO', monto: '',
  });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [creado, setCreado] = useState(null);
  const [verPassword, setVerPassword] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const planElegido = planes?.find((p) => String(p.id) === String(form.plan_id));

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setErrores({});
    setEnviando(true);
    try {
      const cuerpo = { ...form };
      if (!cuerpo.plan_id) {
        delete cuerpo.plan_id; delete cuerpo.metodo; delete cuerpo.monto;
      }
      if (cuerpo.monto === '') delete cuerpo.monto;
      const r = await api.post('/api/socios', cuerpo);
      setCreado(r);
    } catch (err) {
      setError(err.message);
      setErrores(err.porCampo?.() ?? {});
      setEnviando(false);
    }
  }

  function cerrarTodo() {
    setCreado(null);
    setForm({
      documento: '', nombre: '', apellido: '', telefono: '', email: '',
      fecha_nacimiento: '', sexo: '', objetivo: '', observaciones_medicas: '',
      plan_id: '', metodo: 'EFECTIVO', monto: '',
    });
    setEnviando(false);
    setVerPassword(false);
    onCreado();
  }

  if (creado) {
    return (
      <Modal abierto titulo="Socio creado" onCerrar={cerrarTodo}>
        <div className="space-y-4">
          <Aviso tipo="ok">{creado.mensaje}</Aviso>
          <div className="tarjeta bg-superficie-alta p-3.5">
            <p className="text-[12px] text-texto-tenue">Código de socio</p>
            <p className="text-lg font-semibold">{creado.codigo}</p>
            <p className="mt-3 text-[12px] text-texto-suave">
              Entra con su cédula y la contraseña que le pusiste. Si se la olvida, se la
              reiniciás desde la ficha.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/admin/socios/${creado.socio_id}`} className="btn-primario flex-1" onClick={cerrarTodo}>
              Ver ficha
            </Link>
            <button type="button" onClick={cerrarTodo} className="btn-secundario flex-1">
              Cargar otro
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal abierto={abierto} titulo="Nuevo socio" onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Cédula" error={errores.documento} requerido hint="Es su usuario para entrar.">
            <input
              className="campo tabular-nums"
              value={form.documento}
              onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value.replace(/\D/g, '') }))}
              inputMode="numeric"
              maxLength={15}
              required
              autoFocus
            />
          </Campo>
          <Campo
            etiqueta="Contraseña"
            error={errores.password}
            requerido
            hint="La elegís vos y se la decís al socio. Mínimo 6 caracteres."
          >
            <input
              className="campo"
              type={verPassword ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              minLength={6}
              required
            />
            {/* Se puede mostrar: el administrador la está dictando en el
                mostrador y necesita leer lo que escribió. */}
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              className="btn-fantasma mt-1 -ml-2 px-2 text-[12px]"
            >
              {verPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </Campo>
          <Campo etiqueta="Teléfono" error={errores.telefono}>
            <input className="campo" value={form.telefono} onChange={set('telefono')} placeholder="0981 123 456" />
          </Campo>
          <Campo etiqueta="Nombre" error={errores.nombre} requerido>
            <input className="campo" value={form.nombre} onChange={set('nombre')} required />
          </Campo>
          <Campo etiqueta="Apellido" error={errores.apellido} requerido>
            <input className="campo" value={form.apellido} onChange={set('apellido')} required />
          </Campo>
          <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
            <input type="date" className="campo" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')} />
          </Campo>
          <Campo etiqueta="Sexo">
            <select className="campo" value={form.sexo} onChange={set('sexo')}>
              <option value="">Sin especificar</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="OTRO">Otro</option>
            </select>
          </Campo>
          <Campo etiqueta="Email" error={errores.email}>
            <input type="email" className="campo" value={form.email} onChange={set('email')} />
          </Campo>
          <Campo etiqueta="Objetivo">
            <input className="campo" value={form.objetivo} onChange={set('objetivo')} placeholder="Bajar de peso, hipertrofia…" />
          </Campo>
        </div>

        <Campo etiqueta="Observaciones médicas" hint="Lesiones, condiciones a tener en cuenta.">
          <textarea className="campo min-h-[70px]" value={form.observaciones_medicas} onChange={set('observaciones_medicas')} />
        </Campo>

        <fieldset className="rounded-xl2 border border-borde p-3.5">
          <legend className="px-1.5 text-[12.5px] font-medium text-texto-suave">
            Primera membresía (opcional)
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo etiqueta="Plan">
              <select className="campo" value={form.plan_id} onChange={set('plan_id')}>
                <option value="">No cobrar ahora</option>
                {planes?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {guaranies(p.precio)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Método">
              <select className="campo" value={form.metodo} onChange={set('metodo')} disabled={!form.plan_id}>
                {['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO'].map((m) => (
                  <option key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Monto" hint={planElegido ? `Sugerido: ${guaranies(planElegido.precio)}` : undefined}>
              <input
                type="number"
                className="campo tabular-nums"
                value={form.monto}
                onChange={set('monto')}
                disabled={!form.plan_id}
                placeholder={planElegido ? String(planElegido.precio) : ''}
                min="0"
              />
            </Campo>
          </div>
        </fieldset>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Crear socio'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
