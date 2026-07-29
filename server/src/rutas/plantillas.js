import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query, transaccion } from '../db.js';
import { ErrorHttp, noEncontrado, ruta, validar } from '../http.js';
import { autenticar, soloAdmin } from '../middleware/auth.js';

export const rutasPlantillas = Router();
rutasPlantillas.use(autenticar, soloAdmin);

const esquemaEjercicio = z.object({
  codigo: z.string().regex(/^[0-9]{4}$/, 'Código de ejercicio inválido.'),
  series: z.coerce.number().int().min(1).max(20).default(3),
  repeticiones: z.string().trim().min(1).max(20).default('10'),
  descanso_seg: z.coerce.number().int().min(0).max(600).default(60),
  nota: z.string().trim().max(300).optional().or(z.literal('')),
});

const esquemaPlantilla = z.object({
  nombre: z.string().trim().min(2, 'Poné un nombre a la plantilla.').max(100),
  descripcion: z.string().trim().max(500).optional().or(z.literal('')),
  objetivo: z.string().trim().max(80).optional().or(z.literal('')),
  nivel: z.enum(['PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO']).optional().or(z.literal('')),
  dias: z
    .array(
      z.object({
        etiqueta: z.string().trim().min(1, 'Cada día necesita un nombre.').max(60),
        nota: z.string().trim().max(300).optional().or(z.literal('')),
        ejercicios: z.array(esquemaEjercicio).min(1, 'Cada día necesita al menos un ejercicio.'),
      })
    )
    .min(1, 'La plantilla necesita al menos un día.')
    .max(7),
});

async function leerPlantilla(id) {
  const plantilla = await una('SELECT * FROM plantillas WHERE id = $1', [id]);
  if (!plantilla) return null;

  const dias = await varias(
    `SELECT d.id, d.orden, d.etiqueta, d.nota,
            coalesce(
              json_agg(
                json_build_object(
                  'id',           pe.id,
                  'orden',        pe.orden,
                  'codigo',       e.codigo,
                  'nombre',       fn_nombre_ejercicio(e.nombre, e.nombre_es),
                  'imagen',       e.imagen,
                  'equipo',       te.etiqueta,
                  'musculo',      tm.etiqueta,
                  'series',       pe.series,
                  'repeticiones', pe.repeticiones,
                  'descanso_seg', pe.descanso_seg,
                  'nota',         pe.nota
                ) ORDER BY pe.orden
              ) FILTER (WHERE pe.id IS NOT NULL),
              '[]'
            ) AS ejercicios
       FROM plantilla_dias d
       LEFT JOIN plantilla_ejercicios pe ON pe.plantilla_dia_id = d.id
       LEFT JOIN ejercicios e  ON e.id = pe.ejercicio_id
       LEFT JOIN terminos te   ON te.tipo = 'EQUIPO'  AND te.valor = e.equipo
       LEFT JOIN terminos tm   ON tm.tipo = 'MUSCULO' AND tm.valor = e.musculo_objetivo
      WHERE d.plantilla_id = $1
      GROUP BY d.id, d.orden, d.etiqueta, d.nota
      ORDER BY d.orden`,
    [id]
  );

  return { ...plantilla, dias };
}

async function escribirDias(c, plantillaId, dias) {
  for (const [i, dia] of dias.entries()) {
    const { rows: [fila] } = await c.query(
      'INSERT INTO plantilla_dias (plantilla_id, orden, etiqueta, nota) VALUES ($1,$2,$3,$4) RETURNING id',
      [plantillaId, i + 1, dia.etiqueta, dia.nota || null]
    );
    for (const [j, ej] of dia.ejercicios.entries()) {
      const { rows: [ejercicio] } = await c.query('SELECT id FROM ejercicios WHERE codigo = $1', [
        ej.codigo,
      ]);
      if (!ejercicio) throw new ErrorHttp(400, `El ejercicio ${ej.codigo} no existe.`);
      await c.query(
        `INSERT INTO plantilla_ejercicios
           (plantilla_dia_id, ejercicio_id, orden, series, repeticiones, descanso_seg, nota)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [fila.id, ejercicio.id, j + 1, ej.series, ej.repeticiones, ej.descanso_seg, ej.nota || null]
      );
    }
  }
}

// --------------------------------------------------------------------
rutasPlantillas.get(
  '/',
  ruta(async (req, res) => {
    const todas = req.query.todas === 'true';
    res.json(
      await varias(`
        SELECT p.id, p.nombre, p.descripcion, p.objetivo, p.nivel, p.activa,
               (SELECT count(*)::int FROM plantilla_dias d WHERE d.plantilla_id = p.id) AS dias,
               (SELECT count(*)::int
                  FROM plantilla_ejercicios pe
                  JOIN plantilla_dias d ON d.id = pe.plantilla_dia_id
                 WHERE d.plantilla_id = p.id) AS ejercicios
          FROM plantillas p
         ${todas ? '' : 'WHERE p.activa'}
         ORDER BY p.activa DESC, p.nombre
      `)
    );
  })
);

rutasPlantillas.get(
  '/:id',
  ruta(async (req, res) => {
    const plantilla = await leerPlantilla(Number(req.params.id));
    if (!plantilla) throw noEncontrado('Plantilla');
    res.json(plantilla);
  })
);

rutasPlantillas.post(
  '/',
  ruta(async (req, res) => {
    const d = validar(esquemaPlantilla, req.body);
    const id = await transaccion(async (c) => {
      const { rows: [p] } = await c.query(
        `INSERT INTO plantillas (nombre, descripcion, objetivo, nivel, creado_por)
         VALUES ($1,$2,$3,nullif($4,''),$5) RETURNING id`,
        [d.nombre, d.descripcion || null, d.objetivo || null, d.nivel || '', req.usuario.id]
      );
      await escribirDias(c, p.id, d.dias);
      return p.id;
    });
    res.status(201).json(await leerPlantilla(id));
  })
);

rutasPlantillas.put(
  '/:id',
  ruta(async (req, res) => {
    const id = Number(req.params.id);
    const d = validar(esquemaPlantilla, req.body);
    const existe = await una('SELECT id FROM plantillas WHERE id = $1', [id]);
    if (!existe) throw noEncontrado('Plantilla');

    await transaccion(async (c) => {
      await c.query(
        `UPDATE plantillas SET nombre=$2, descripcion=$3, objetivo=$4, nivel=nullif($5,'')
          WHERE id=$1`,
        [id, d.nombre, d.descripcion || null, d.objetivo || null, d.nivel || '']
      );
      // Las rutinas ya asignadas son copias independientes: rehacer la
      // plantilla no las toca.
      await c.query('DELETE FROM plantilla_dias WHERE plantilla_id = $1', [id]);
      await escribirDias(c, id, d.dias);
    });

    res.json(await leerPlantilla(id));
  })
);

rutasPlantillas.patch(
  '/:id/activa',
  ruta(async (req, res) => {
    const { activa } = validar(z.object({ activa: z.boolean() }), req.body);
    const p = await una('UPDATE plantillas SET activa=$2 WHERE id=$1 RETURNING id, nombre, activa', [
      Number(req.params.id),
      activa,
    ]);
    if (!p) throw noEncontrado('Plantilla');
    res.json(p);
  })
);

rutasPlantillas.delete(
  '/:id',
  ruta(async (req, res) => {
    const p = await una('DELETE FROM plantillas WHERE id=$1 RETURNING id', [Number(req.params.id)]);
    if (!p) throw noEncontrado('Plantilla');
    res.json({ ok: true });
  })
);

/**
 * Copia la plantilla a una rutina nueva del socio. Desde ese momento son
 * independientes: ajustar la rutina no altera la plantilla, y viceversa.
 */
rutasPlantillas.post(
  '/:id/asignar',
  ruta(async (req, res) => {
    const { socio_id, nombre } = validar(
      z.object({
        socio_id: z.coerce.number().int().positive(),
        nombre: z.string().trim().max(100).optional().or(z.literal('')),
      }),
      req.body
    );

    const { rows } = await query('SELECT fn_asignar_plantilla($1,$2,$3,nullif($4,\'\')) AS rutina_id', [
      Number(req.params.id),
      socio_id,
      req.usuario.id,
      nombre ?? '',
    ]);

    res.status(201).json({ rutina_id: rows[0].rutina_id });
  })
);
