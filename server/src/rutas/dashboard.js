import { Router } from 'express';

import { una, varias, query } from '../db.js';
import { noEncontrado, ruta } from '../http.js';
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
        SELECT socio_id, codigo, nombre_completo, telefono, plan, fecha_fin, dias_restantes,
               dias_desde_aviso
          FROM v_socios_estado
         WHERE activo AND estado = 'POR_VENCER'
         ORDER BY fecha_fin
         LIMIT 20
      `),
      varias(`
        SELECT socio_id, codigo, nombre_completo, telefono, plan, fecha_fin,
               (current_date - fecha_fin) AS dias_vencido, dias_desde_aviso
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

/**
 * Socios que dejaron de venir.
 *
 * Los que estan al dia pero hace rato que no aparecen. Es la lista que de
 * verdad recupera plata: cuando el socio cae en "vencido" ya se fue, y
 * mientras tanto figura AL_DIA y nadie lo mira.
 *
 * No incluye a los que nunca vinieron y recien se anotaron: se les da margen
 * de `dias` desde el alta antes de contarlos como ausentes.
 */
rutasDashboard.get(
  '/ausentes',
  ruta(async (req, res) => {
    const dias = Math.min(120, Math.max(7, Number.parseInt(req.query.dias, 10) || 15));

    res.json(
      await varias(
        `SELECT v.socio_id, v.codigo, v.nombre_completo, v.telefono, v.plan,
                v.fecha_fin, v.dias_restantes, v.estado,
                a.ultima_visita,
                coalesce(current_date - a.ultima_visita, current_date - v.fecha_ingreso)::int
                  AS dias_sin_venir,
                (a.ultima_visita IS NULL) AS nunca_vino,
                CASE WHEN s.ultimo_aviso_ausencia_en IS NOT NULL
                     THEN (current_date - s.ultimo_aviso_ausencia_en::date) END AS dias_desde_aviso
           FROM v_socios_estado v
           JOIN socios s ON s.id = v.socio_id
           LEFT JOIN LATERAL (
             SELECT max(fecha) AS ultima_visita
               FROM asistencias WHERE socio_id = v.socio_id
           ) a ON true
          WHERE v.activo
            AND v.estado IN ('AL_DIA', 'POR_VENCER')
            AND coalesce(a.ultima_visita, v.fecha_ingreso) <= current_date - $1::int
          ORDER BY v.fecha_fin, dias_sin_venir DESC
          LIMIT 50`,
        [dias]
      )
    );
  })
);

/**
 * Cumpleaños de hoy y de los proximos dias.
 *
 * `fecha_nacimiento` ya se cargaba en el alta y no se usaba para nada. El
 * 29 de febrero se saluda el 28 en los años que no son bisiestos.
 */
rutasDashboard.get(
  '/cumpleanos',
  ruta(async (req, res) => {
    // Ojo con `|| 7`: dias=0 es "solo los de hoy" y es un pedido válido.
    const pedido = Number.parseInt(req.query.dias, 10);
    const dias = Math.min(30, Math.max(0, Number.isInteger(pedido) ? pedido : 7));

    // En vez de reconstruir la fecha del próximo cumpleaños con aritmética de
    // años, se recorren los días que vienen y se busca el que coincide en
    // mes y día. Cruza el fin de año solo, sin casos especiales.
    res.json(
      await varias(
        `SELECT v.socio_id, v.codigo, v.nombre_completo, v.telefono, v.estado,
                s.fecha_nacimiento,
                c.dia                                AS proximo,
                (c.dia - current_date)::int          AS faltan,
                (extract(year FROM c.dia) - extract(year FROM s.fecha_nacimiento))::int AS cumple
           FROM v_socios_estado v
           JOIN socios s ON s.id = v.socio_id
           CROSS JOIN LATERAL (
             SELECT d::date AS dia
               FROM generate_series(current_date, current_date + $1::int, interval '1 day') d
              WHERE to_char(d, 'MM-DD') = to_char(s.fecha_nacimiento, 'MM-DD')
                 -- Los del 29 de febrero se saludan el 28 en los años que no
                 -- son bisiestos (febrero de ese año tiene 28 días).
                 OR (to_char(s.fecha_nacimiento, 'MM-DD') = '02-29'
                     AND to_char(d, 'MM-DD') = '02-28'
                     AND extract(day FROM date_trunc('year', d) + interval '2 months - 1 day') = 28)
              ORDER BY d
              LIMIT 1
           ) c
          WHERE v.activo AND s.fecha_nacimiento IS NOT NULL
          ORDER BY c.dia, v.nombre_completo
          LIMIT 30`,
        [dias]
      )
    );
  })
);

/** Deja constancia de que se le escribió por dejar de venir. */
rutasDashboard.post(
  '/ausentes/:socioId/aviso',
  ruta(async (req, res) => {
    const socioId = Number.parseInt(req.params.socioId, 10);
    if (!Number.isInteger(socioId) || socioId <= 0) throw noEncontrado('Socio');

    const socio = await una(
      'UPDATE socios SET ultimo_aviso_ausencia_en = now() WHERE id = $1 RETURNING ultimo_aviso_ausencia_en',
      [socioId]
    );
    if (!socio) throw noEncontrado('Socio');
    res.json({ ok: true, ultimo_aviso_ausencia_en: socio.ultimo_aviso_ausencia_en });
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
