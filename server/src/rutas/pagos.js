import { Router } from 'express';
import { z } from 'zod';

import { armarComprobante, numeroComprobante } from '../comprobante.js';
import { una, varias } from '../db.js';
import { noEncontrado, ruta, validar } from '../http.js';
import { soloAdmin } from '../middleware/auth.js';
import { armarPlanilla, nombreConFecha, responderPlanilla } from '../planilla.js';

export const rutasPagos = Router();
rutasPagos.use(soloAdmin);

// --------------------------------------------------------------------
//  Planilla de pagos
//
//  Va antes de '/:id/comprobante' por el orden de resolución de Express.
// --------------------------------------------------------------------
const COLUMNAS_PAGOS = [
  { clave: 'comprobante_nro', titulo: 'Comprobante' },
  { clave: 'fecha', titulo: 'Fecha' },
  { clave: 'hora', titulo: 'Hora' },
  { clave: 'codigo', titulo: 'Socio' },
  { clave: 'documento', titulo: 'Cédula' },
  { clave: 'socio_nombre', titulo: 'Nombre' },
  { clave: 'plan', titulo: 'Plan' },
  { clave: 'fecha_inicio', titulo: 'Desde' },
  { clave: 'fecha_fin', titulo: 'Hasta' },
  // Sin separador de miles y con coma decimal: así Excel lo toma como número
  // y se puede sumar la columna, que es para lo que se baja esto.
  { clave: 'monto', titulo: 'Monto', formato: (v) => String(v ?? 0).replace('.', ',') },
  { clave: 'metodo', titulo: 'Método' },
  { clave: 'referencia', titulo: 'Referencia' },
  { clave: 'cobrado_por', titulo: 'Cobrado por' },
  { clave: 'observacion', titulo: 'Observación' },
];

const rangoFechas = z.object({
  desde: z.string().date('Fecha inválida.').optional().or(z.literal('')),
  hasta: z.string().date('Fecha inválida.').optional().or(z.literal('')),
});

rutasPagos.get(
  '/exportar',
  ruta(async (req, res) => {
    const { desde, hasta } = validar(rangoFechas, req.query);

    const condiciones = [];
    const params = [];
    const p = (v) => `$${params.push(v)}`;
    if (desde) condiciones.push(`p.fecha_pago >= ${p(desde)}::date`);
    // `< hasta + 1` y no `<=`: fecha_pago es timestamptz, y un <= dejaría
    // afuera todo lo cobrado después de la medianoche del último día.
    if (hasta) condiciones.push(`p.fecha_pago < ${p(hasta)}::date + 1`);

    const filas = await varias(
      `SELECT lpad(p.id::text, 7, '0')                AS comprobante_nro,
              to_char(p.fecha_pago, 'YYYY-MM-DD')     AS fecha,
              to_char(p.fecha_pago, 'HH24:MI')        AS hora,
              s.codigo, u.documento,
              u.apellido || ', ' || u.nombre          AS socio_nombre,
              pl.nombre                               AS plan,
              m.fecha_inicio, m.fecha_fin,
              p.monto, p.metodo,
              p.comprobante                           AS referencia,
              cobrador.nombre || ' ' || cobrador.apellido AS cobrado_por,
              p.observacion
         FROM pagos p
         JOIN socios s   ON s.id = p.socio_id
         JOIN usuarios u ON u.id = s.usuario_id
         LEFT JOIN membresias m ON m.id = p.membresia_id
         LEFT JOIN planes pl    ON pl.id = m.plan_id
         LEFT JOIN usuarios cobrador ON cobrador.id = p.registrado_por
        ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
        ORDER BY p.fecha_pago DESC`,
      params
    );

    // Con rango, el nombre lleva el rango; sin rango, la fecha de hoy. Poner
    // las dos cosas daba "pagos-2026-08-01_2026-08-13-2026-08-13.csv".
    const nombre =
      desde || hasta
        ? `pagos-${desde || 'inicio'}_a_${hasta || 'hoy'}.csv`
        : nombreConFecha('pagos');

    responderPlanilla(res, nombre, armarPlanilla(COLUMNAS_PAGOS, filas));
  })
);

/**
 * Comprobante de pago en PDF.
 *
 * Va como `attachment`: el mostrador lo baja y desde ahí lo imprime o lo
 * adjunta al WhatsApp. Abrirlo en una pestaña desde la app no era confiable
 * —el bloqueador de emergentes se la comía— y bajado sirve para las dos cosas.
 */
rutasPagos.get(
  '/:id/comprobante',
  ruta(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw noEncontrado('Pago');

    const pago = await una(
      `SELECT p.id, p.monto, p.metodo, p.fecha_pago, p.comprobante, p.observacion,
              m.fecha_inicio, m.fecha_fin,
              pl.nombre AS plan,
              s.codigo AS socio_codigo,
              u.documento,
              u.nombre || ' ' || u.apellido AS socio_nombre,
              cobrador.nombre || ' ' || cobrador.apellido AS cobrado_por
         FROM pagos p
         JOIN socios s        ON s.id = p.socio_id
         JOIN usuarios u      ON u.id = s.usuario_id
         LEFT JOIN membresias m ON m.id = p.membresia_id
         LEFT JOIN planes pl    ON pl.id = m.plan_id
         LEFT JOIN usuarios cobrador ON cobrador.id = p.registrado_por
        WHERE p.id = $1`,
      [id]
    );
    if (!pago) throw noEncontrado('Pago');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="comprobante-${numeroComprobante(pago.id)}.pdf"`
    );
    // Un comprobante no cambia nunca, pero tampoco conviene que quede en
    // caches intermedias: lleva el nombre y la cédula del socio.
    res.setHeader('Cache-Control', 'private, no-store');

    armarComprobante(res, pago);
  })
);
