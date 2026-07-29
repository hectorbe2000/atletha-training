import { Router } from 'express';

import { una, varias, query } from '../db.js';
import { ruta } from '../http.js';
import { autenticar, soloAdmin } from '../middleware/auth.js';

export const rutasDashboard = Router();
rutasDashboard.use(autenticar, soloAdmin);

/** Numeros del dia para la pantalla de inicio del administrador. */
rutasDashboard.get(
  '/',
  ruta(async (_req, res) => {
    await query('SELECT fn_actualizar_membresias_vencidas()');

    const [socios, cobranza, asistenciaHoy, porVencer, vencidos, ingresosMes] = await Promise.all([
      una(`
        SELECT count(*)::int                                              AS total,
               count(*) FILTER (WHERE estado = 'AL_DIA')::int             AS al_dia,
               count(*) FILTER (WHERE estado = 'POR_VENCER')::int         AS por_vencer,
               count(*) FILTER (WHERE estado = 'VENCIDO')::int            AS vencidos,
               count(*) FILTER (WHERE estado = 'SIN_MEMBRESIA')::int      AS sin_membresia
          FROM v_socios_estado WHERE activo
      `),
      una(`
        SELECT coalesce(sum(monto), 0)::numeric(14,2) AS hoy,
               count(*)::int                          AS cobros
          FROM pagos WHERE fecha_pago::date = current_date
      `),
      una(`SELECT count(*)::int AS total FROM asistencias WHERE fecha = current_date`),
      varias(`
        SELECT socio_id, codigo, nombre_completo, telefono, plan, fecha_fin, dias_restantes
          FROM v_socios_estado
         WHERE activo AND estado = 'POR_VENCER'
         ORDER BY fecha_fin
         LIMIT 20
      `),
      varias(`
        SELECT socio_id, codigo, nombre_completo, telefono, plan, fecha_fin,
               (current_date - fecha_fin) AS dias_vencido
          FROM v_socios_estado
         WHERE activo AND estado = 'VENCIDO'
         ORDER BY fecha_fin DESC
         LIMIT 20
      `),
      varias(`
        SELECT to_char(mes, 'YYYY-MM')            AS mes,
               coalesce(sum(p.monto), 0)::numeric(14,2) AS total,
               count(p.id)::int                   AS cobros
          FROM generate_series(
                 date_trunc('month', current_date) - interval '11 months',
                 date_trunc('month', current_date),
                 interval '1 month'
               ) AS mes
          LEFT JOIN pagos p
            ON date_trunc('month', p.fecha_pago) = mes
         GROUP BY mes
         ORDER BY mes
      `),
    ]);

    res.json({ socios, cobranza, asistencia_hoy: asistenciaHoy.total, por_vencer: porVencer, vencidos, ingresos_mes: ingresosMes });
  })
);

/** Asistencia diaria de los ultimos N dias, para el grafico del panel. */
rutasDashboard.get(
  '/asistencia',
  ruta(async (req, res) => {
    const dias = Math.min(180, Math.max(7, Number.parseInt(req.query.dias, 10) || 30));
    res.json(
      await varias(
        `SELECT d::date AS fecha, count(a.id)::int AS total
           FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') AS d
           LEFT JOIN asistencias a ON a.fecha = d::date
          GROUP BY d ORDER BY d`,
        [dias]
      )
    );
  })
);

/** Ejercicios mas registrados por los socios: sirve para decidir compras de equipamiento. */
rutasDashboard.get(
  '/ejercicios-populares',
  ruta(async (_req, res) => {
    res.json(
      await varias(`
        SELECT e.codigo,
               fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre,
               t.etiqueta                                 AS equipo,
               count(DISTINCT sr.sesion_id)::int          AS sesiones,
               count(*)::int                              AS series
          FROM series_registradas sr
          JOIN ejercicios e ON e.id = sr.ejercicio_id
          LEFT JOIN terminos t ON t.tipo = 'EQUIPO' AND t.valor = e.equipo
          JOIN sesiones s ON s.id = sr.sesion_id
         WHERE s.fecha >= current_date - 90
         GROUP BY e.codigo, e.nombre, e.nombre_es, t.etiqueta
         ORDER BY series DESC
         LIMIT 15
      `)
    );
  })
);
