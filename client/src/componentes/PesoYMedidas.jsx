import { useState } from 'react';

import { api, fecha, fechaCorta, numero } from '../api.js';
import { useDatos } from '../hooks.js';
import { Lineas, MarcoGrafico, TablaDatos } from './graficos.jsx';
import { Aviso, Campo, Cargando, Modal, Tile } from './ui.jsx';

/**
 * Peso corporal y medidas.
 *
 * El sistema medía kilos levantados; esto mide al socio, que es lo que le
 * importa a quien entrena para bajar de peso o para ganar masa.
 *
 * Sirve igual para el socio (en Progreso) que para el administrador
 * (en la ficha), cambiando solo el id del socio.
 */

const MEDIDAS = [
  ['peso_kg', 'Peso', 'kg', 0.1],
  ['grasa_pct', 'Grasa', '%', 0.1],
  ['cuello_cm', 'Cuello', 'cm', 0.5],
  ['pecho_cm', 'Pecho', 'cm', 0.5],
  ['cintura_cm', 'Cintura', 'cm', 0.5],
  ['cadera_cm', 'Cadera', 'cm', 0.5],
  ['brazo_cm', 'Brazo', 'cm', 0.5],
  ['muslo_cm', 'Muslo', 'cm', 0.5],
];

const COLOR_IMC = {
  BAJO: 'text-estado-aviso',
  NORMAL: 'text-estado-bien',
  SOBREPESO: 'text-estado-aviso',
  OBESIDAD: 'text-estado-critico',
};

const ETIQUETA_IMC = {
  BAJO: 'Bajo peso',
  NORMAL: 'Normal',
  SOBREPESO: 'Sobrepeso',
  OBESIDAD: 'Obesidad',
};

export function PesoYMedidas({ socioId = 'mi', titulo = 'Peso y medidas', compacto = false }) {
  const { datos, cargando, recargando, refrescar } = useDatos(`/api/mediciones/${socioId}`);
  const [registrando, setRegistrando] = useState(false);

  if (cargando) return <Cargando texto="Cargando mediciones…" />;

  const { resumen, historial = [], socio } = datos ?? {};
  const hay = historial.length > 0;

  // El gráfico va del más viejo al más nuevo; la API devuelve al revés.
  const serie = [...historial]
    .filter((m) => m.peso_kg != null)
    .reverse()
    .map((m) => ({ ...m, etiqueta: fechaCorta(m.fecha), peso_kg: Number(m.peso_kg) }));

  const bajando = resumen?.variacion_total < 0;
  const subiendo = resumen?.variacion_total > 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <button type="button" onClick={() => setRegistrando(true)} className="btn-primario px-3 py-1.5 text-[13px]">
          + Registrar
        </button>
      </header>

      {!hay ? (
        <div className="tarjeta px-6 py-10 text-center">
          <p className="text-[15px] font-semibold">Todavía no hay mediciones</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-texto-suave">
            Registrá el peso de hoy y a partir de la segunda medición vas a ver la evolución.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              etiqueta="Peso actual"
              valor={resumen.peso_actual != null ? `${numero(resumen.peso_actual, 1)} kg` : '—'}
              detalle={resumen.ultima_fecha ? fecha(resumen.ultima_fecha) : null}
            />
            <Tile
              etiqueta="Desde el inicio"
              valor={
                resumen.variacion_total != null
                  ? `${resumen.variacion_total > 0 ? '+' : ''}${numero(resumen.variacion_total, 1)} kg`
                  : '—'
              }
              detalle={resumen.desde ? `desde ${fecha(resumen.desde)}` : null}
              acento={bajando || subiendo}
            />
            <Tile
              etiqueta="IMC"
              valor={resumen.imc != null ? numero(resumen.imc, 1) : '—'}
              detalle={
                resumen.categoria_imc ? (
                  <span className={COLOR_IMC[resumen.categoria_imc]}>
                    {ETIQUETA_IMC[resumen.categoria_imc]}
                  </span>
                ) : (
                  'Cargá la altura'
                )
              }
            />
            <Tile etiqueta="Mediciones" valor={numero(resumen.mediciones)} />
          </div>

          {serie.length > 1 ? (
            <MarcoGrafico
              titulo="Evolución del peso"
              detalle={`En kilos. ${socio?.altura_cm ? `Altura registrada: ${socio.altura_cm} cm.` : 'Cargá la altura para ver el IMC.'}`}
              recargando={recargando}
              alto={compacto ? 200 : 240}
              tabla={
                <TablaDatos
                  columnas={[
                    { clave: 'fecha', titulo: 'Fecha', formato: (v) => fecha(v) },
                    { clave: 'peso_kg', titulo: 'Peso (kg)', derecha: true, formato: (v) => numero(v, 1) },
                    {
                      clave: 'variacion_kg',
                      titulo: 'Cambio',
                      derecha: true,
                      formato: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${numero(v, 1)}`),
                    },
                    { clave: 'imc', titulo: 'IMC', derecha: true, formato: (v) => (v == null ? '—' : numero(v, 1)) },
                  ]}
                  filas={historial}
                />
              }
            >
              <Lineas
                datos={serie}
                x="etiqueta"
                series={[{ clave: 'peso_kg', nombre: 'Peso' }]}
                formato={(v) => `${numero(v, 1)} kg`}
              />
            </MarcoGrafico>
          ) : (
            <Aviso tipo="info">
              Con una sola medición no hay evolución que mostrar. Registrá la próxima y aparece el gráfico.
            </Aviso>
          )}

          <section className="tarjeta p-4">
            <h3 className="mb-3 text-[14.5px] font-semibold tracking-tight">Historial completo</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-borde text-left text-texto-suave">
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                    {MEDIDAS.map(([clave, etiqueta, unidad]) => (
                      <th key={clave} className="py-1.5 pr-3 text-right font-medium">
                        {etiqueta}
                        <span className="text-texto-tenue"> {unidad}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map((m) => (
                    <tr key={m.id} className="border-b border-borde/60 last:border-0">
                      <td className="whitespace-nowrap py-1.5 pr-3">{fecha(m.fecha)}</td>
                      {MEDIDAS.map(([clave]) => (
                        <td key={clave} className="py-1.5 pr-3 text-right tabular-nums">
                          {m[clave] == null ? (
                            <span className="text-texto-tenue">—</span>
                          ) : (
                            numero(m[clave], 1)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <RegistrarMedicion
        abierto={registrando}
        socioId={socioId}
        alturaActual={socio?.altura_cm}
        ultima={historial[0]}
        onCerrar={() => setRegistrando(false)}
        onGuardado={() => { setRegistrando(false); refrescar(); }}
      />
    </div>
  );
}

function RegistrarMedicion({ abierto, socioId, alturaActual, ultima, onCerrar, onGuardado }) {
  const [valores, setValores] = useState({});
  const [altura, setAltura] = useState(alturaActual ?? '');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const set = (k) => (e) => setValores((v) => ({ ...v, [k]: e.target.value }));

  async function enviar(e) {
    e.preventDefault();
    setError('');

    const cargados = Object.fromEntries(
      Object.entries(valores).filter(([, v]) => v !== '' && v != null)
    );
    if (!Object.keys(cargados).length) {
      setError('Cargá al menos el peso o una medida.');
      return;
    }

    setEnviando(true);
    try {
      // La altura es del socio, no de la medición: va por su propia ruta.
      if (altura && Number(altura) !== alturaActual) {
        await api.patch(`/api/mediciones/${socioId}/altura`, { altura_cm: Number(altura) });
      }
      await api.post(`/api/mediciones/${socioId}`, { ...cargados, notas });
      setValores({});
      setNotas('');
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} titulo="Registrar medición" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <p className="text-[13px] text-texto-suave">
          Cargá solo lo que midas hoy; lo que dejes vacío no se toca. Si ya hay una medición
          de hoy, se actualiza.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {MEDIDAS.map(([clave, etiqueta, unidad, paso]) => (
            <Campo
              key={clave}
              etiqueta={`${etiqueta} (${unidad})`}
              hint={ultima?.[clave] != null ? `Última: ${numero(ultima[clave], 1)}` : undefined}
            >
              <input
                type="number"
                step={paso}
                min="0"
                className="campo tabular-nums"
                value={valores[clave] ?? ''}
                onChange={set(clave)}
                placeholder={ultima?.[clave] != null ? String(ultima[clave]) : ''}
                autoFocus={clave === 'peso_kg'}
              />
            </Campo>
          ))}
        </div>

        <Campo
          etiqueta="Altura (cm)"
          hint="Se guarda una sola vez y sirve para calcular el IMC."
        >
          <input
            type="number"
            min="80"
            max="260"
            className="campo tabular-nums"
            value={altura}
            onChange={(e) => setAltura(e.target.value)}
            placeholder="175"
          />
        </Campo>

        <Campo etiqueta="Notas">
          <input
            className="campo"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="En ayunas, después de entrenar…"
          />
        </Campo>

        <Aviso tipo="error">{error}</Aviso>

        <div className="flex gap-2">
          <button type="submit" className="btn-primario flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar medición'}
          </button>
          <button type="button" onClick={onCerrar} className="btn-secundario">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}
