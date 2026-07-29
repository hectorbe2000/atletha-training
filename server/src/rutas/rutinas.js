import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query, transaccion } from '../db.js';
import { ErrorHttp, invalido, noEncontrado, ruta, validar } from '../http.js';
import { autenticar, soloAdmin, socioAccesible } from '../middleware/auth.js';

export const rutasRutinas = Router();
rutasRutinas.use(autenticar);

const esquemaEjercicio = z.object({
  codigo: z.string().regex(/^[0-9]{4}$/, 'Código de ejercicio inválido.'),
  series: z.coerce.number().int().min(1).max(20).default(3),
  repeticiones: z.string().trim().min(1).max(20).default('10'),
  peso_sugerido: z.coerce.number().nonnegative().nullable().optional(),
  descanso_seg: z.coerce.number().int().min(0).max(600).default(60),
  nota: z.string().trim().max(300).optional().or(z.literal('')),
});

const esquemaDia = z.object({
  etiqueta: z.string().trim().min(1, 'Cada día necesita un nombre.').max(60),
  nota: z.string().trim().max(300).optional().or(z.literal('')),
  ejercicios: z.array(esquemaEjercicio).min(1, 'Cada día necesita al menos un ejercicio.'),
});

const esquemaRutina = z.object({
  socio_id: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(2, 'Poné un nombre a la rutina.').max(100),
  descripcion: z.string().trim().max(500).optional().or(z.literal('')),
  objetivo: z.string().trim().max(80).optional().or(z.literal('')),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional().or(z.literal('')),
  activa: z.boolean().default(true),
  dias: z.array(esquemaDia).min(1, 'La rutina necesita al menos un día.').max(7),
});

/**
 * Puerta de entrada a cualquier modificación de rutinas.
 *
 * El administrador puede con todas. El socio solo con las suyas y solo si se
 * las armó él: la rutina que le dio el profe la ve, la entrena, pero no la
 * puede tocar — si no, el profe no tiene forma de saber qué prescribió.
 */
async function rutinaEditable(req, rutinaId) {
  const rutina = await una(
    'SELECT id, socio_id, origen, nombre FROM rutinas WHERE id = $1',
    [Number(rutinaId)]
  );
  if (!rutina) throw noEncontrado('Rutina');

  if (req.usuario.rol === 'ADMIN') return rutina;

  if (rutina.socio_id !== req.usuario.socioId) {
    throw new ErrorHttp(403, 'Esa rutina no es tuya.');
  }
  if (rutina.origen !== 'SOCIO') {
    throw new ErrorHttp(
      403,
      `"${rutina.nombre}" te la armó el profe: podés entrenarla pero no editarla. Creá una rutina propia si querés cambiarla.`
    );
  }
  return rutina;
}

/** Lo mismo, partiendo de un día. */
async function diaEditable(req, diaId) {
  const dia = await una(
    `SELECT d.id, d.rutina_id, d.etiqueta, r.socio_id, r.origen
       FROM rutina_dias d JOIN rutinas r ON r.id = d.rutina_id
      WHERE d.id = $1`,
    [Number(diaId)]
  );
  if (!dia) throw noEncontrado('Día de rutina');
  await rutinaEditable(req, dia.rutina_id);
  return dia;
}

/** Devuelve la rutina completa con sus dias y ejercicios. */
async function leerRutina(rutinaId) {
  const rutina = await una(
    `SELECT r.*, u.nombre || ' ' || u.apellido AS socio_nombre, s.codigo AS socio_codigo
       FROM rutinas r
       JOIN socios s   ON s.id = r.socio_id
       JOIN usuarios u ON u.id = s.usuario_id
      WHERE r.id = $1`,
    [rutinaId]
  );
  if (!rutina) return null;

  const dias = await varias(
    `SELECT d.id, d.orden, d.etiqueta, d.nota,
            coalesce(
              json_agg(
                json_build_object(
                  'id',            re.id,
                  'orden',         re.orden,
                  'codigo',        e.codigo,
                  'nombre',        fn_nombre_ejercicio(e.nombre, e.nombre_es),
                  'imagen',        e.imagen,
                  'gif',           e.gif,
                  'equipo',        te.etiqueta,
                  'musculo',       tm.etiqueta,
                  'series',        re.series,
                  'repeticiones',  re.repeticiones,
                  'peso_sugerido', re.peso_sugerido,
                  'descanso_seg',  re.descanso_seg,
                  'nota',          re.nota
                ) ORDER BY re.orden
              ) FILTER (WHERE re.id IS NOT NULL),
              '[]'
            ) AS ejercicios
       FROM rutina_dias d
       LEFT JOIN rutina_ejercicios re ON re.rutina_dia_id = d.id
       LEFT JOIN ejercicios e  ON e.id = re.ejercicio_id
       LEFT JOIN terminos te   ON te.tipo = 'EQUIPO'  AND te.valor = e.equipo
       LEFT JOIN terminos tm   ON tm.tipo = 'MUSCULO' AND tm.valor = e.musculo_objetivo
      WHERE d.rutina_id = $1
      GROUP BY d.id, d.orden, d.etiqueta, d.nota
      ORDER BY d.orden`,
    [rutinaId]
  );

  return { ...rutina, dias };
}

/** Inserta dias y ejercicios de una rutina ya creada. */
async function escribirDias(c, rutinaId, dias) {
  for (const [i, dia] of dias.entries()) {
    const { rows: [filaDia] } = await c.query(
      `INSERT INTO rutina_dias (rutina_id, orden, etiqueta, nota)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [rutinaId, i + 1, dia.etiqueta, dia.nota || null]
    );

    for (const [j, ej] of dia.ejercicios.entries()) {
      const { rows: [ejercicio] } = await c.query('SELECT id FROM ejercicios WHERE codigo = $1', [
        ej.codigo,
      ]);
      if (!ejercicio) {
        throw new ErrorHttp(400, `El ejercicio ${ej.codigo} no existe en el catálogo.`);
      }
      await c.query(
        `INSERT INTO rutina_ejercicios
           (rutina_dia_id, ejercicio_id, orden, series, repeticiones, peso_sugerido, descanso_seg, nota)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          filaDia.id,
          ejercicio.id,
          j + 1,
          ej.series,
          ej.repeticiones,
          ej.peso_sugerido ?? null,
          ej.descanso_seg,
          ej.nota || null,
        ]
      );
    }
  }
}

// --------------------------------------------------------------------
rutasRutinas.get(
  '/',
  ruta(async (req, res) => {
    const socioId =
      req.usuario.rol === 'ADMIN' && req.query.socio_id
        ? Number(req.query.socio_id)
        : req.usuario.socioId;

    if (!socioId) {
      // Admin sin filtro: todas las rutinas activas del gimnasio.
      return res.json(
        await varias(`
          SELECT r.id, r.nombre, r.objetivo, r.dias_por_semana, r.fecha_inicio, r.activa, r.origen,
                 s.codigo AS socio_codigo, u.nombre || ' ' || u.apellido AS socio_nombre,
                 (SELECT count(*)::int FROM rutina_dias d WHERE d.rutina_id = r.id) AS dias
            FROM rutinas r
            JOIN socios s   ON s.id = r.socio_id
            JOIN usuarios u ON u.id = s.usuario_id
           WHERE r.activa
           ORDER BY r.fecha_inicio DESC
           LIMIT 200
        `)
      );
    }

    socioAccesible(req, socioId);
    res.json(
      await varias(
        `SELECT r.id, r.nombre, r.descripcion, r.objetivo, r.dias_por_semana,
                r.fecha_inicio, r.fecha_fin, r.activa, r.origen,
                (SELECT count(*)::int FROM rutina_dias d WHERE d.rutina_id = r.id) AS dias
           FROM rutinas r
          WHERE r.socio_id = $1
          ORDER BY r.activa DESC, r.fecha_inicio DESC`,
        [socioId]
      )
    );
  })
);

/**
 * Un dia suelto con sus ejercicios: es lo que abre la pantalla de entrenar.
 * Va antes de '/:id' porque Express resuelve en orden de registro.
 */
rutasRutinas.get(
  '/dia/:diaId',
  ruta(async (req, res) => {
    const dia = await una(
      `SELECT d.id, d.orden, d.etiqueta, d.nota,
              r.id AS rutina_id, r.nombre AS rutina, r.socio_id, r.activa
         FROM rutina_dias d
         JOIN rutinas r ON r.id = d.rutina_id
        WHERE d.id = $1`,
      [Number(req.params.diaId)]
    );
    if (!dia) throw noEncontrado('Día de rutina');
    socioAccesible(req, dia.socio_id);

    const ejercicios = await varias(
      `SELECT re.id, re.orden, re.series, re.repeticiones, re.peso_sugerido,
              re.descanso_seg, re.nota,
              e.codigo, fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre,
              e.imagen, e.gif,
              te.etiqueta AS equipo, tm.etiqueta AS musculo,
              -- Ultimo peso que el socio movio en este ejercicio: es el dato
              -- que necesita para saber con cuanto arrancar hoy.
              (SELECT sr.peso
                 FROM series_registradas sr
                 JOIN sesiones s ON s.id = sr.sesion_id
                WHERE s.socio_id = $2 AND sr.ejercicio_id = e.id AND sr.completada
                ORDER BY s.fecha DESC, sr.numero_serie DESC
                LIMIT 1) AS ultimo_peso
         FROM rutina_ejercicios re
         JOIN ejercicios e ON e.id = re.ejercicio_id
         LEFT JOIN terminos te ON te.tipo = 'EQUIPO'  AND te.valor = e.equipo
         LEFT JOIN terminos tm ON tm.tipo = 'MUSCULO' AND tm.valor = e.musculo_objetivo
        WHERE re.rutina_dia_id = $1
        ORDER BY re.orden`,
      [dia.id, dia.socio_id]
    );

    res.json({ ...dia, ejercicios });
  })
);

rutasRutinas.get(
  '/:id',
  ruta(async (req, res) => {
    const rutina = await leerRutina(Number(req.params.id));
    if (!rutina) throw noEncontrado('Rutina');
    socioAccesible(req, rutina.socio_id);
    res.json(rutina);
  })
);

// --------------------------------------------------------------------
//  Rutina propia del socio, armada desde el catálogo
// --------------------------------------------------------------------

/**
 * Crea una rutina vacía (o con los días indicados). Es el punto de entrada
 * del flujo "vi un ejercicio y lo quiero guardar en algún lado": el socio no
 * tiene que planificar toda la semana antes de agregar el primer ejercicio.
 */
rutasRutinas.post(
  '/propia',
  ruta(async (req, res) => {
    const d = validar(
      z.object({
        nombre: z.string().trim().min(2, 'Poné un nombre a la rutina.').max(100),
        objetivo: z.string().trim().max(80).optional().or(z.literal('')),
        dias: z.array(z.string().trim().min(1).max(60)).min(1).max(7).default(['Día 1']),
        socio_id: z.coerce.number().int().positive().optional(),
      }),
      req.body
    );

    // Un admin puede crear una rutina "propia" en nombre de un socio; un
    // socio solo para sí mismo.
    const socioId =
      req.usuario.rol === 'ADMIN' && d.socio_id ? d.socio_id : req.usuario.socioId;
    if (!socioId) throw new ErrorHttp(400, 'No se pudo determinar el socio.');

    const rutinaId = await transaccion(async (c) => {
      const { rows: [r] } = await c.query(
        `INSERT INTO rutinas (socio_id, nombre, objetivo, dias_por_semana, origen, creado_por)
         VALUES ($1, $2, $3, $4, 'SOCIO', $5) RETURNING id`,
        [socioId, d.nombre, d.objetivo || null, d.dias.length, req.usuario.id]
      );
      for (const [i, etiqueta] of d.dias.entries()) {
        await c.query(
          'INSERT INTO rutina_dias (rutina_id, orden, etiqueta) VALUES ($1, $2, $3)',
          [r.id, i + 1, etiqueta]
        );
      }
      return r.id;
    });

    res.status(201).json(await leerRutina(rutinaId));
  })
);

/** Agrega un día al final de una rutina. */
rutasRutinas.post(
  '/:id/dias',
  ruta(async (req, res) => {
    await rutinaEditable(req, req.params.id);
    const { etiqueta } = validar(
      z.object({ etiqueta: z.string().trim().min(1, 'Poné un nombre al día.').max(60) }),
      req.body
    );

    const dia = await una(
      `INSERT INTO rutina_dias (rutina_id, orden, etiqueta)
       VALUES ($1, (SELECT coalesce(max(orden), 0) + 1 FROM rutina_dias WHERE rutina_id = $1), $2)
       RETURNING id, orden, etiqueta`,
      [Number(req.params.id), etiqueta]
    );
    await query(
      'UPDATE rutinas SET dias_por_semana = (SELECT count(*) FROM rutina_dias WHERE rutina_id = $1) WHERE id = $1',
      [Number(req.params.id)]
    );
    res.status(201).json(dia);
  })
);

rutasRutinas.delete(
  '/dias/:diaId',
  ruta(async (req, res) => {
    const dia = await diaEditable(req, req.params.diaId);
    await query('DELETE FROM rutina_dias WHERE id = $1', [dia.id]);
    await query(
      'UPDATE rutinas SET dias_por_semana = (SELECT count(*) FROM rutina_dias WHERE rutina_id = $1) WHERE id = $1',
      [dia.rutina_id]
    );
    res.json({ ok: true });
  })
);

/** Suma un ejercicio al final de un día. Es lo que dispara el catálogo. */
rutasRutinas.post(
  '/dias/:diaId/ejercicios',
  ruta(async (req, res) => {
    const dia = await diaEditable(req, req.params.diaId);
    const e = validar(esquemaEjercicio, req.body);

    const ejercicio = await una('SELECT id FROM ejercicios WHERE codigo = $1', [e.codigo]);
    if (!ejercicio) throw noEncontrado('Ejercicio');

    const repetido = await una(
      'SELECT id FROM rutina_ejercicios WHERE rutina_dia_id = $1 AND ejercicio_id = $2',
      [dia.id, ejercicio.id]
    );
    if (repetido) {
      throw new ErrorHttp(409, `Ese ejercicio ya está en "${dia.etiqueta}".`);
    }

    const fila = await una(
      `INSERT INTO rutina_ejercicios
         (rutina_dia_id, ejercicio_id, orden, series, repeticiones, peso_sugerido, descanso_seg, nota)
       VALUES ($1, $2,
               (SELECT coalesce(max(orden), 0) + 1 FROM rutina_ejercicios WHERE rutina_dia_id = $1),
               $3, $4, $5, $6, $7)
       RETURNING id, orden, series, repeticiones, peso_sugerido, descanso_seg, nota`,
      [
        dia.id, ejercicio.id, e.series, e.repeticiones,
        e.peso_sugerido ?? null, e.descanso_seg, e.nota || null,
      ]
    );

    res.status(201).json({ ...fila, codigo: e.codigo, dia: dia.etiqueta });
  })
);

rutasRutinas.patch(
  '/ejercicios/:filaId',
  ruta(async (req, res) => {
    const fila = await una(
      'SELECT rutina_dia_id FROM rutina_ejercicios WHERE id = $1',
      [Number(req.params.filaId)]
    );
    if (!fila) throw noEncontrado('Ejercicio de la rutina');
    await diaEditable(req, fila.rutina_dia_id);

    const d = validar(esquemaEjercicio.partial().omit({ codigo: true }), req.body);
    const entradas = Object.entries(d).filter(([, v]) => v !== undefined);
    if (!entradas.length) throw invalido('No mandaste nada para cambiar.');

    const sets = entradas.map(([k], i) => `${k} = $${i + 2}`);
    const actualizado = await una(
      `UPDATE rutina_ejercicios SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, series, repeticiones, peso_sugerido, descanso_seg, nota`,
      [Number(req.params.filaId), ...entradas.map(([, v]) => (v === '' ? null : v))]
    );
    res.json(actualizado);
  })
);

rutasRutinas.delete(
  '/ejercicios/:filaId',
  ruta(async (req, res) => {
    const fila = await una(
      'SELECT rutina_dia_id FROM rutina_ejercicios WHERE id = $1',
      [Number(req.params.filaId)]
    );
    if (!fila) throw noEncontrado('Ejercicio de la rutina');
    await diaEditable(req, fila.rutina_dia_id);

    await query('DELETE FROM rutina_ejercicios WHERE id = $1', [Number(req.params.filaId)]);
    res.json({ ok: true });
  })
);

// --------------------------------------------------------------------
//  Rutina completa asignada por el administrador
// --------------------------------------------------------------------
rutasRutinas.post(
  '/',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaRutina, req.body);

    const socio = await una('SELECT id FROM socios WHERE id = $1', [d.socio_id]);
    if (!socio) throw noEncontrado('Socio');

    const rutinaId = await transaccion(async (c) => {
      const { rows: [rutina] } = await c.query(
        `INSERT INTO rutinas (socio_id, nombre, descripcion, objetivo, dias_por_semana,
                              fecha_inicio, fecha_fin, activa, creado_por)
         VALUES ($1, $2, $3, $4, $5, coalesce($6::date, current_date), $7, $8, $9)
         RETURNING id`,
        [
          d.socio_id,
          d.nombre,
          d.descripcion || null,
          d.objetivo || null,
          d.dias.length,
          d.fecha_inicio ?? null,
          d.fecha_fin || null,
          d.activa,
          req.usuario.id,
        ]
      );
      await escribirDias(c, rutina.id, d.dias);
      return rutina.id;
    });

    res.status(201).json(await leerRutina(rutinaId));
  })
);

/** Reemplaza la rutina completa (cabecera + dias + ejercicios). */
rutasRutinas.put(
  '/:id',
  ruta(async (req, res) => {
    const rutinaId = Number(req.params.id);
    await rutinaEditable(req, rutinaId);
    const d = validar(esquemaRutina, req.body);

    await transaccion(async (c) => {
      await c.query(
        `UPDATE rutinas
            SET socio_id = $2, nombre = $3, descripcion = $4, objetivo = $5,
                dias_por_semana = $6, fecha_inicio = coalesce($7::date, fecha_inicio),
                fecha_fin = $8, activa = $9
          WHERE id = $1`,
        [
          rutinaId,
          d.socio_id,
          d.nombre,
          d.descripcion || null,
          d.objetivo || null,
          d.dias.length,
          d.fecha_inicio ?? null,
          d.fecha_fin || null,
          d.activa,
        ]
      );
      // Las sesiones ya registradas apuntan a rutina_dias con ON DELETE SET NULL,
      // asi que el historial del socio no se pierde al rearmar la rutina.
      await c.query('DELETE FROM rutina_dias WHERE rutina_id = $1', [rutinaId]);
      await escribirDias(c, rutinaId, d.dias);
    });

    res.json(await leerRutina(rutinaId));
  })
);

rutasRutinas.patch(
  '/:id/activa',
  ruta(async (req, res) => {
    await rutinaEditable(req, req.params.id);
    const { activa } = validar(z.object({ activa: z.boolean() }), req.body);
    const rutina = await una(
      'UPDATE rutinas SET activa = $2 WHERE id = $1 RETURNING id, nombre, activa',
      [Number(req.params.id), activa]
    );
    if (!rutina) throw noEncontrado('Rutina');
    res.json(rutina);
  })
);

rutasRutinas.delete(
  '/:id',
  ruta(async (req, res) => {
    await rutinaEditable(req, req.params.id);
    await query('DELETE FROM rutinas WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  })
);
