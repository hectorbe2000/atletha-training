import { Router } from 'express';
import { z } from 'zod';

import { una, varias } from '../db.js';
import { noEncontrado, ruta, validar } from '../http.js';
import { autenticar, soloAdmin } from '../middleware/auth.js';

export const rutasPlanes = Router();
rutasPlanes.use(autenticar);

rutasPlanes.get(
  '/',
  ruta(async (req, res) => {
    const incluirInactivos = req.query.todos === 'true' && req.usuario.rol === 'ADMIN';
    res.json(
      await varias(
        `SELECT id, nombre, descripcion, duracion_dias, precio, activo
           FROM planes ${incluirInactivos ? '' : 'WHERE activo'}
          ORDER BY duracion_dias`
      )
    );
  })
);

const esquemaPlan = z.object({
  nombre: z.string().trim().min(2).max(60),
  descripcion: z.string().trim().max(300).optional().or(z.literal('')),
  duracion_dias: z.coerce.number().int().positive('La duración debe ser mayor a cero.'),
  precio: z.coerce.number().nonnegative('El precio no puede ser negativo.'),
  activo: z.boolean().optional(),
});

rutasPlanes.post(
  '/',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaPlan, req.body);
    const plan = await una(
      `INSERT INTO planes (nombre, descripcion, duracion_dias, precio, activo)
       VALUES ($1, $2, $3, $4, coalesce($5, true))
       RETURNING id, nombre, descripcion, duracion_dias, precio, activo`,
      [d.nombre, d.descripcion || null, d.duracion_dias, d.precio, d.activo ?? null]
    );
    res.status(201).json(plan);
  })
);

rutasPlanes.patch(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaPlan.partial(), req.body);
    const entradas = Object.entries(d).filter(([, v]) => v !== undefined);
    if (!entradas.length) throw noEncontrado('Nada para actualizar');

    const sets = entradas.map(([k], i) => `${k} = $${i + 2}`);
    const plan = await una(
      `UPDATE planes SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, nombre, descripcion, duracion_dias, precio, activo`,
      [Number(req.params.id), ...entradas.map(([, v]) => v)]
    );
    if (!plan) throw noEncontrado('Plan');
    res.json(plan);
  })
);
