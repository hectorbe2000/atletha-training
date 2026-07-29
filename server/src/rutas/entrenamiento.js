import { Router } from 'express';
import { z } from 'zod';

import { una, varias } from '../db.js';
import { ErrorHttp, noEncontrado, ruta, validar } from '../http.js';
import { autenticar, socioAccesible } from '../middleware/auth.js';

export const rutasEntrenamiento = Router();
rutasEntrenamiento.use(autenticar);

/** Resuelve sobre qué socio se opera: el propio, o el pedido si sos admin. */
function socioObjetivo(req) {
  const pedido = req.query.socio_id ?? req.body?.socio_id;
  if (pedido) return socioAccesible(req, pedido);
  if (!req.usuario.socioId) {
    throw new ErrorHttp(400, 'Indicá el socio (socio_id) para consultar su entrenamiento.');
  }
  return req.usuario.socioId;
}

// --------------------------------------------------------------------
//  Sesiones
// --------------------------------------------------------------------
rutasEntrenamiento.post(
  '/sesiones',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const { rutina_dia_id } = validar(
      z.object({
        socio_id: z.coerce.number().int().positive().optional(),
        rutina_dia_id: z.coerce.number().int().positive().nullable().optional(),
      }),
      req.body ?? {}
    );

    if (rutina_dia_id) {
      const dia = await una(
        `SELECT d.id FROM rutina_dias d JOIN rutinas r ON r.id = d.rutina_id
          WHERE d.id = $1 AND r.socio_id = $2`,
        [rutina_dia_id, socioId]
      );
      if (!dia) throw new ErrorHttp(400, 'Ese día de rutina no pertenece al socio.');
    }

    // Si ya hay una sesión abierta hoy, se reutiliza en vez de duplicar.
    const abierta = await una(
      `SELECT id, fecha, inicio, rutina_dia_id FROM sesiones
        WHERE socio_id = $1 AND NOT finalizada AND fecha = current_date
        ORDER BY inicio DESC LIMIT 1`,
      [socioId]
    );
    if (abierta) return res.json({ ...abierta, reutilizada: true });

    const sesion = await una(
      `INSERT INTO sesiones (socio_id, rutina_dia_id) VALUES ($1, $2)
       RETURNING id, fecha, inicio, rutina_dia_id`,
      [socioId, rutina_dia_id ?? null]
    );
    res.status(201).json({ ...sesion, reutilizada: false });
  })
);

rutasEntrenamiento.get(
  '/sesiones',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const limite = Math.min(200, Math.max(1, Number.parseInt(req.query.limite, 10) || 30));

    res.json(
      await varias(
        `SELECT s.id, s.fecha, s.inicio, s.fin, s.finalizada, s.notas,
                d.etiqueta AS dia_rutina, r.nombre AS rutina,
                v.ejercicios, v.series_completadas, v.repeticiones, v.volumen_kg,
                CASE WHEN s.fin IS NOT NULL
                     THEN round(extract(epoch FROM (s.fin - s.inicio)) / 60)::int END AS duracion_min
           FROM sesiones s
           LEFT JOIN rutina_dias d ON d.id = s.rutina_dia_id
           LEFT JOIN rutinas r     ON r.id = d.rutina_id
           LEFT JOIN v_volumen_sesion v ON v.sesion_id = s.id
          WHERE s.socio_id = $1
          ORDER BY s.fecha DESC, s.inicio DESC
          LIMIT $2`,
        [socioId, limite]
      )
    );
  })
);

rutasEntrenamiento.get(
  '/sesiones/:id',
  ruta(async (req, res) => {
    const sesion = await una(
      `SELECT s.*, d.etiqueta AS dia_rutina, r.nombre AS rutina
         FROM sesiones s
         LEFT JOIN rutina_dias d ON d.id = s.rutina_dia_id
         LEFT JOIN rutinas r     ON r.id = d.rutina_id
        WHERE s.id = $1`,
      [Number(req.params.id)]
    );
    if (!sesion) throw noEncontrado('Sesión');
    socioAccesible(req, sesion.socio_id);

    const series = await varias(
      `SELECT sr.id, sr.numero_serie, sr.repeticiones, sr.peso, sr.rpe, sr.completada,
              e.codigo, fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre, e.imagen
         FROM series_registradas sr
         JOIN ejercicios e ON e.id = sr.ejercicio_id
        WHERE sr.sesion_id = $1
        ORDER BY e.codigo, sr.numero_serie`,
      [sesion.id]
    );

    res.json({ ...sesion, series });
  })
);

const esquemaSerie = z.object({
  codigo: z.string().regex(/^[0-9]{4}$/, 'Código de ejercicio inválido.'),
  numero_serie: z.coerce.number().int().min(1).max(50),
  repeticiones: z.coerce.number().int().min(0).max(999).nullable().optional(),
  peso: z.coerce.number().min(0).max(9999).nullable().optional(),
  rpe: z.coerce.number().int().min(1).max(10).nullable().optional(),
  completada: z.boolean().default(true),
});

/** Registra (o corrige) una serie. Reenviar la misma serie la actualiza. */
rutasEntrenamiento.post(
  '/sesiones/:id/series',
  ruta(async (req, res) => {
    const d = validar(esquemaSerie, req.body);

    const sesion = await una('SELECT id, socio_id, finalizada FROM sesiones WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!sesion) throw noEncontrado('Sesión');
    socioAccesible(req, sesion.socio_id);
    if (sesion.finalizada) throw new ErrorHttp(409, 'La sesión ya está cerrada.');

    const ejercicio = await una('SELECT id FROM ejercicios WHERE codigo = $1', [d.codigo]);
    if (!ejercicio) throw noEncontrado('Ejercicio');

    const serie = await una(
      `INSERT INTO series_registradas
         (sesion_id, ejercicio_id, numero_serie, repeticiones, peso, rpe, completada)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sesion_id, ejercicio_id, numero_serie) DO UPDATE SET
         repeticiones = EXCLUDED.repeticiones,
         peso         = EXCLUDED.peso,
         rpe          = EXCLUDED.rpe,
         completada   = EXCLUDED.completada
       RETURNING id, numero_serie, repeticiones, peso, rpe, completada`,
      [
        sesion.id,
        ejercicio.id,
        d.numero_serie,
        d.repeticiones ?? null,
        d.peso ?? null,
        d.rpe ?? null,
        d.completada,
      ]
    );

    res.status(201).json({ ...serie, codigo: d.codigo });
  })
);

rutasEntrenamiento.delete(
  '/sesiones/:id/series/:serieId',
  ruta(async (req, res) => {
    const sesion = await una('SELECT id, socio_id FROM sesiones WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!sesion) throw noEncontrado('Sesión');
    socioAccesible(req, sesion.socio_id);

    const borrada = await una(
      'DELETE FROM series_registradas WHERE id = $1 AND sesion_id = $2 RETURNING id',
      [Number(req.params.serieId), sesion.id]
    );
    if (!borrada) throw noEncontrado('Serie');
    res.json({ ok: true });
  })
);

rutasEntrenamiento.patch(
  '/sesiones/:id/finalizar',
  ruta(async (req, res) => {
    const sesion = await una('SELECT id, socio_id FROM sesiones WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!sesion) throw noEncontrado('Sesión');
    socioAccesible(req, sesion.socio_id);

    const notas = typeof req.body?.notas === 'string' ? req.body.notas.slice(0, 1000) : null;
    const cerrada = await una(
      `UPDATE sesiones SET finalizada = true, fin = now(), notas = coalesce($2, notas)
        WHERE id = $1
        RETURNING id, fecha, inicio, fin, finalizada, notas`,
      [sesion.id, notas]
    );
    const volumen = await una('SELECT * FROM v_volumen_sesion WHERE sesion_id = $1', [sesion.id]);
    res.json({ ...cerrada, ...volumen });
  })
);

// --------------------------------------------------------------------
//  Progreso
// --------------------------------------------------------------------
rutasEntrenamiento.get(
  '/progreso/resumen',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);

    const [totales, esteMes, racha, records] = await Promise.all([
      una(
        `SELECT count(*)::int AS sesiones,
                coalesce(sum(v.volumen_kg), 0)::numeric(14,2) AS volumen_total,
                coalesce(sum(v.series_completadas), 0)::int   AS series
           FROM sesiones s JOIN v_volumen_sesion v ON v.sesion_id = s.id
          WHERE s.socio_id = $1 AND s.finalizada`,
        [socioId]
      ),
      una(
        `SELECT count(*)::int AS sesiones,
                coalesce(sum(v.volumen_kg), 0)::numeric(14,2) AS volumen
           FROM sesiones s JOIN v_volumen_sesion v ON v.sesion_id = s.id
          WHERE s.socio_id = $1 AND s.finalizada
            AND s.fecha >= date_trunc('month', current_date)`,
        [socioId]
      ),
      una(
        // Semanas consecutivas con al menos un entrenamiento, contadas hacia
        // atras desde la ultima semana entrenada (gaps and islands).
        `WITH semanas AS (
           SELECT DISTINCT date_trunc('week', fecha)::date AS semana
             FROM sesiones WHERE socio_id = $1 AND finalizada
         ), ordenadas AS (
           SELECT semana,
                  (row_number() OVER (ORDER BY semana DESC) - 1)::int AS pos,
                  ((max(semana) OVER () - semana) / 7)::int           AS atras
             FROM semanas
         )
         SELECT coalesce(
                  (SELECT min(pos) FROM ordenadas WHERE atras <> pos),
                  (SELECT count(*) FROM ordenadas)
                )::int AS semanas_seguidas,
                (SELECT max(semana) FROM semanas) AS ultima_semana`,
        [socioId]
      ),
      varias(
        // Mejor marca por ejercicio: 1RM estimado con la formula de Epley.
        `SELECT e.codigo,
                fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre,
                max(sr.peso)::numeric(6,2) AS peso_max,
                max((sr.peso * (1 + sr.repeticiones / 30.0)))::numeric(6,2) AS rm_estimado,
                count(*)::int AS series
           FROM series_registradas sr
           JOIN sesiones s   ON s.id = sr.sesion_id
           JOIN ejercicios e ON e.id = sr.ejercicio_id
          WHERE s.socio_id = $1 AND sr.completada AND sr.peso > 0 AND sr.repeticiones > 0
          GROUP BY e.codigo, e.nombre, e.nombre_es
          ORDER BY rm_estimado DESC NULLS LAST
          LIMIT 10`,
        [socioId]
      ),
    ]);

    res.json({ totales, este_mes: esteMes, racha_semanas: racha?.semanas_seguidas ?? 0, records });
  })
);

rutasEntrenamiento.get(
  '/progreso/volumen',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const semanas = Math.min(52, Math.max(4, Number.parseInt(req.query.semanas, 10) || 12));

    res.json(
      await varias(
        `SELECT to_char(sem, 'YYYY-MM-DD')                     AS semana,
                coalesce(sum(v.volumen_kg), 0)::numeric(14,2)  AS volumen_kg,
                count(DISTINCT s.id)::int                      AS sesiones,
                coalesce(sum(v.series_completadas), 0)::int    AS series
           FROM generate_series(
                  date_trunc('week', current_date) - ($2::int - 1) * interval '1 week',
                  date_trunc('week', current_date),
                  interval '1 week'
                ) AS sem
           LEFT JOIN sesiones s
             ON s.socio_id = $1 AND s.finalizada
            AND date_trunc('week', s.fecha) = sem
           LEFT JOIN v_volumen_sesion v ON v.sesion_id = s.id
          GROUP BY sem ORDER BY sem`,
        [socioId, semanas]
      )
    );
  })
);

rutasEntrenamiento.get(
  '/progreso/asistencia',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const meses = Math.min(24, Math.max(3, Number.parseInt(req.query.meses, 10) || 6));

    res.json(
      await varias(
        `SELECT to_char(m, 'YYYY-MM')                                 AS mes,
                count(DISTINCT a.fecha)::int                          AS asistencias,
                count(DISTINCT s.fecha) FILTER (WHERE s.finalizada)::int AS entrenamientos
           FROM generate_series(
                  date_trunc('month', current_date) - ($2::int - 1) * interval '1 month',
                  date_trunc('month', current_date),
                  interval '1 month'
                ) AS m
           LEFT JOIN asistencias a
             ON a.socio_id = $1 AND date_trunc('month', a.fecha) = m
           LEFT JOIN sesiones s
             ON s.socio_id = $1 AND date_trunc('month', s.fecha) = m
          GROUP BY m ORDER BY m`,
        [socioId, meses]
      )
    );
  })
);

/** Evolucion de un ejercicio puntual: peso maximo y 1RM estimado por fecha. */
rutasEntrenamiento.get(
  '/progreso/ejercicio/:codigo',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);

    const ejercicio = await una(
      `SELECT id, codigo, fn_nombre_ejercicio(nombre, nombre_es) AS nombre
         FROM ejercicios WHERE codigo = $1`,
      [req.params.codigo]
    );
    if (!ejercicio) throw noEncontrado('Ejercicio');

    const puntos = await varias(
      `SELECT s.fecha,
              max(sr.peso)::numeric(6,2)                              AS peso_max,
              max(sr.peso * (1 + sr.repeticiones / 30.0))::numeric(6,2) AS rm_estimado,
              sum(sr.repeticiones * sr.peso)::numeric(12,2)           AS volumen_kg,
              count(*)::int                                            AS series
         FROM series_registradas sr
         JOIN sesiones s ON s.id = sr.sesion_id
        WHERE s.socio_id = $1 AND sr.ejercicio_id = $2 AND sr.completada
        GROUP BY s.fecha
        ORDER BY s.fecha`,
      [socioId, ejercicio.id]
    );

    res.json({ ejercicio, puntos });
  })
);
