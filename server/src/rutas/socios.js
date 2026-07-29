import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query, transaccion } from '../db.js';
import { ErrorHttp, noEncontrado, paginacion, ruta, validar } from '../http.js';
import { autenticar, soloAdmin, socioAccesible } from '../middleware/auth.js';

export const rutasSocios = Router();
rutasSocios.use(autenticar);

const cedula = z
  .string()
  .trim()
  .regex(/^[0-9]{4,15}$/, 'La cédula debe tener solo números (4 a 15 dígitos).');

const esquemaAlta = z.object({
  documento: cedula,
  nombre: z.string().trim().min(2, 'Ingresá el nombre.').max(80),
  apellido: z.string().trim().min(2, 'Ingresá el apellido.').max(80),
  email: z.string().trim().email('Email inválido.').max(120).optional().or(z.literal('')),
  telefono: z.string().trim().max(30).optional().or(z.literal('')),
  fecha_nacimiento: z.string().date('Fecha inválida.').optional().or(z.literal('')),
  sexo: z.enum(['M', 'F', 'OTRO']).optional().or(z.literal('')),
  direccion: z.string().trim().max(300).optional().or(z.literal('')),
  contacto_emergencia: z.string().trim().max(120).optional().or(z.literal('')),
  telefono_emergencia: z.string().trim().max(30).optional().or(z.literal('')),
  observaciones_medicas: z.string().trim().max(1000).optional().or(z.literal('')),
  objetivo: z.string().trim().max(120).optional().or(z.literal('')),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.').optional(),
  // Membresia inicial opcional, en el mismo alta.
  plan_id: z.coerce.number().int().positive().optional(),
  fecha_inicio: z.string().date('Fecha inválida.').optional(),
  monto: z.coerce.number().nonnegative().optional(),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO']).optional(),
});

const vacioANull = (v) => (v === '' || v === undefined ? null : v);

// --------------------------------------------------------------------
//  Mostrador: ingreso por cedula
//
//  Es la pantalla que esta abierta todo el dia. Una sola llamada resuelve
//  buscar al socio, decir si puede pasar y dejar registrada la asistencia.
// --------------------------------------------------------------------
rutasSocios.post(
  '/ingreso',
  soloAdmin,
  ruta(async (req, res) => {
    const { documento, forzar } = validar(
      z.object({ documento: cedula, forzar: z.boolean().default(false) }),
      req.body
    );

    await query('SELECT fn_actualizar_membresias_vencidas()');

    const socio = await una('SELECT * FROM v_socios_estado WHERE documento = $1', [documento]);

    if (!socio) {
      throw new ErrorHttp(404, `No hay ningún socio con la cédula ${documento}.`);
    }
    if (!socio.activo) {
      return res.json({
        socio,
        permitido: false,
        registrado: false,
        motivo: 'INACTIVO',
        mensaje: 'La cuenta de este socio está dada de baja.',
      });
    }

    const alDia = socio.estado === 'AL_DIA' || socio.estado === 'POR_VENCER';

    // Vencido o sin plan: no se registra solo. El admin decide si lo deja
    // pasar igual, y ese "igual" queda como una acción explícita.
    if (!alDia && !forzar) {
      return res.json({
        socio,
        permitido: false,
        registrado: false,
        motivo: socio.estado,
        mensaje:
          socio.estado === 'VENCIDO'
            ? `La membresía venció hace ${Math.abs(socio.dias_restantes)} días.`
            : 'Este socio no tiene ninguna membresía cargada.',
      });
    }

    const registro = await una(
      `INSERT INTO asistencias (socio_id, registrado_por) VALUES ($1, $2)
       ON CONFLICT (socio_id, fecha) DO NOTHING
       RETURNING hora_entrada`,
      [socio.socio_id, req.usuario.id]
    );

    res.json({
      socio,
      permitido: true,
      registrado: Boolean(registro),
      forzado: !alDia,
      motivo: alDia ? socio.estado : `${socio.estado}_FORZADO`,
      mensaje: registro
        ? '¡Adelante!'
        : 'Ya tenía la entrada de hoy registrada.',
    });
  })
);

/** Últimos ingresos del día, para que el mostrador vea lo que va pasando. */
rutasSocios.get(
  '/ingresos-hoy',
  soloAdmin,
  ruta(async (_req, res) => {
    res.json(
      await varias(`
        SELECT a.id, a.hora_entrada, v.socio_id, v.codigo, v.nombre_completo,
               v.documento, v.plan, v.estado, v.dias_restantes
          FROM asistencias a
          JOIN v_socios_estado v ON v.socio_id = a.socio_id
         WHERE a.fecha = current_date
         ORDER BY a.hora_entrada DESC
         LIMIT 25
      `)
    );
  })
);

// --------------------------------------------------------------------
//  Listado con estado de membresia
// --------------------------------------------------------------------
rutasSocios.get(
  '/',
  soloAdmin,
  ruta(async (req, res) => {
    const { pagina, limite, offset } = paginacion(req.query, 20);
    const buscar = (req.query.buscar ?? '').trim();
    const estado = req.query.estado;

    await query('SELECT fn_actualizar_membresias_vencidas()');

    const condiciones = [];
    const params = [];
    const p = (v) => `$${params.push(v)}`;

    if (buscar) {
      const t = p(`%${buscar}%`);
      condiciones.push(
        `(f_unaccent(lower(nombre_completo)) LIKE f_unaccent(lower(${t}))
          OR documento LIKE ${t}
          OR codigo ILIKE ${t})`
      );
    }
    if (['AL_DIA', 'POR_VENCER', 'VENCIDO', 'SIN_MEMBRESIA'].includes(estado)) {
      condiciones.push(`estado = ${p(estado)}`);
    }
    if (req.query.inactivos !== 'true') condiciones.push('activo');

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const filas = await varias(
      `SELECT *, (count(*) OVER ())::int AS total
         FROM v_socios_estado
         ${where}
        ORDER BY
          CASE estado WHEN 'VENCIDO' THEN 1 WHEN 'POR_VENCER' THEN 2
                      WHEN 'SIN_MEMBRESIA' THEN 3 ELSE 4 END,
          apellido, nombre
        LIMIT ${p(limite)} OFFSET ${p(offset)}`,
      params
    );

    const total = filas[0]?.total ?? 0;
    res.json({
      total,
      pagina,
      limite,
      paginas: Math.ceil(total / limite),
      datos: filas.map(({ total: _t, ...r }) => r),
    });
  })
);

// --------------------------------------------------------------------
//  Alta de socio (usuario + socio + membresia inicial opcional)
// --------------------------------------------------------------------
rutasSocios.post(
  '/',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaAlta, req.body);

    const yaExiste = await una('SELECT id FROM usuarios WHERE documento = $1', [d.documento]);
    if (yaExiste) {
      throw new ErrorHttp(409, `Ya hay un usuario cargado con la cédula ${d.documento}.`);
    }

    // Sin contraseña explícita, la inicial es la propia cédula y se obliga a cambiarla.
    const passwordInicial = d.password ?? d.documento;
    const hash = await bcrypt.hash(passwordInicial, 10);

    const resultado = await transaccion(async (c) => {
      const { rows: [usuario] } = await c.query(
        `INSERT INTO usuarios (documento, password_hash, rol, nombre, apellido, email, telefono,
                               debe_cambiar_password)
         VALUES ($1, $2, 'SOCIO', $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          d.documento,
          hash,
          d.nombre,
          d.apellido,
          vacioANull(d.email),
          vacioANull(d.telefono),
          !d.password,
        ]
      );

      const { rows: [socio] } = await c.query(
        `INSERT INTO socios (usuario_id, fecha_nacimiento, sexo, direccion, contacto_emergencia,
                             telefono_emergencia, observaciones_medicas, objetivo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, codigo`,
        [
          usuario.id,
          vacioANull(d.fecha_nacimiento),
          vacioANull(d.sexo),
          vacioANull(d.direccion),
          vacioANull(d.contacto_emergencia),
          vacioANull(d.telefono_emergencia),
          vacioANull(d.observaciones_medicas),
          vacioANull(d.objetivo),
        ]
      );

      let membresia = null;
      if (d.plan_id) {
        membresia = await crearMembresia(c, {
          socioId: socio.id,
          planId: d.plan_id,
          fechaInicio: d.fecha_inicio,
          monto: d.monto,
          metodo: d.metodo ?? 'EFECTIVO',
          registradoPor: req.usuario.id,
        });
      }

      return { socio_id: socio.id, codigo: socio.codigo, usuario_id: usuario.id, membresia };
    });

    res.status(201).json({
      ...resultado,
      password_inicial: d.password ? undefined : passwordInicial,
      mensaje: d.password
        ? 'Socio creado.'
        : `Socio creado. Contraseña inicial: su cédula (${passwordInicial}). Se le pedirá cambiarla al entrar.`,
    });
  })
);

/**
 * Crea una membresia y su pago. El periodo arranca el dia indicado, o al dia
 * siguiente del vencimiento vigente para que las renovaciones se encadenen
 * sin regalar ni perder dias.
 */
async function crearMembresia(c, { socioId, planId, fechaInicio, monto, metodo, comprobante, observacion, registradoPor }) {
  const { rows: [plan] } = await c.query(
    'SELECT id, nombre, duracion_dias, precio FROM planes WHERE id = $1 AND activo',
    [planId]
  );
  if (!plan) throw new ErrorHttp(400, 'El plan indicado no existe o está inactivo.');

  // Fecha de inicio: la indicada; si no, el dia siguiente al vencimiento aun
  // vigente (asi la renovacion no pisa ni regala dias); si no, hoy.
  const { rows: [membresia] } = await c.query(
    `WITH inicio AS (
       SELECT coalesce(
                $2::date,
                (SELECT max(m.fecha_fin) + 1
                   FROM membresias m
                  WHERE m.socio_id = $1
                    AND m.estado <> 'CANCELADA'
                    AND m.fecha_fin >= current_date),
                current_date
              ) AS d
     )
     INSERT INTO membresias
       (socio_id, plan_id, fecha_inicio, fecha_fin, precio, registrado_por, observacion)
     SELECT $1, $3, i.d, i.d + ($4::int - 1), $5, $6, $7
       FROM inicio i
     RETURNING id, fecha_inicio, fecha_fin, precio, estado`,
    [
      socioId,
      fechaInicio ?? null,
      plan.id,
      plan.duracion_dias,
      monto ?? plan.precio,
      registradoPor,
      observacion ?? null,
    ]
  );

  const importe = monto ?? plan.precio;
  if (importe > 0) {
    await c.query(
      `INSERT INTO pagos (socio_id, membresia_id, monto, metodo, comprobante, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [socioId, membresia.id, importe, metodo ?? 'EFECTIVO', comprobante ?? null, registradoPor]
    );
  }

  return { ...membresia, plan: plan.nombre };
}

// --------------------------------------------------------------------
//  Ficha de un socio
// --------------------------------------------------------------------
rutasSocios.get(
  '/:id',
  ruta(async (req, res) => {
    const socioId = socioAccesible(req, req.params.id);

    const socio = await una(
      `SELECT v.*, s.fecha_nacimiento, s.sexo, s.direccion, s.contacto_emergencia,
              s.telefono_emergencia, s.observaciones_medicas, u.debe_cambiar_password,
              u.ultimo_acceso
         FROM v_socios_estado v
         JOIN socios s   ON s.id = v.socio_id
         JOIN usuarios u ON u.id = v.usuario_id
        WHERE v.socio_id = $1`,
      [socioId]
    );
    if (!socio) throw noEncontrado('Socio');

    const [membresias, pagos, rutinas, asistencias] = await Promise.all([
      varias(
        `SELECT m.id, p.nombre AS plan, m.fecha_inicio, m.fecha_fin, m.precio, m.estado, m.observacion
           FROM membresias m JOIN planes p ON p.id = m.plan_id
          WHERE m.socio_id = $1 ORDER BY m.fecha_inicio DESC LIMIT 24`,
        [socioId]
      ),
      varias(
        `SELECT id, monto, metodo, fecha_pago, comprobante, observacion
           FROM pagos WHERE socio_id = $1 ORDER BY fecha_pago DESC LIMIT 24`,
        [socioId]
      ),
      varias(
        `SELECT id, nombre, objetivo, dias_por_semana, fecha_inicio, activa
           FROM rutinas WHERE socio_id = $1 ORDER BY activa DESC, fecha_inicio DESC`,
        [socioId]
      ),
      una(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE fecha >= date_trunc('month', current_date))::int AS este_mes,
                max(fecha) AS ultima
           FROM asistencias WHERE socio_id = $1`,
        [socioId]
      ),
    ]);

    res.json({ socio, membresias, pagos, rutinas, asistencias });
  })
);

// --------------------------------------------------------------------
//  Edicion de datos
// --------------------------------------------------------------------
const esquemaEdicion = esquemaAlta
  .omit({ password: true, plan_id: true, fecha_inicio: true, monto: true, metodo: true })
  .partial()
  .extend({
    activo: z.boolean().optional(),
    // La altura vive en socios porque es un dato de la persona; se puede
    // corregir desde la ficha igual que el resto.
    altura_cm: z.coerce.number().int().min(80).max(260).nullable().optional()
      .or(z.literal('').transform(() => null)),
  });

rutasSocios.patch(
  '/:id',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaEdicion, req.body);
    const socioId = Number(req.params.id);

    const socio = await una('SELECT usuario_id FROM socios WHERE id = $1', [socioId]);
    if (!socio) throw noEncontrado('Socio');

    // Corregir la cédula es legítimo: un error de tipeo en el alta deja al
    // socio sin poder entrar. Pero no puede pisar la de otro.
    if (d.documento) {
      const ocupada = await una(
        'SELECT id FROM usuarios WHERE documento = $1 AND id <> $2',
        [d.documento, socio.usuario_id]
      );
      if (ocupada) {
        throw new ErrorHttp(409, `La cédula ${d.documento} ya está usada por otro usuario.`);
      }
    }

    await transaccion(async (c) => {
      const campoUsuario = {
        documento: d.documento,
        nombre: d.nombre,
        apellido: d.apellido,
        email: d.email,
        telefono: d.telefono,
        activo: d.activo,
      };
      const campoSocio = {
        fecha_nacimiento: d.fecha_nacimiento,
        sexo: d.sexo,
        direccion: d.direccion,
        contacto_emergencia: d.contacto_emergencia,
        telefono_emergencia: d.telefono_emergencia,
        observaciones_medicas: d.observaciones_medicas,
        objetivo: d.objetivo,
        altura_cm: d.altura_cm,
      };

      for (const [tabla, id, campos] of [
        ['usuarios', socio.usuario_id, campoUsuario],
        ['socios', socioId, campoSocio],
      ]) {
        const entradas = Object.entries(campos).filter(([, v]) => v !== undefined);
        if (!entradas.length) continue;
        const sets = entradas.map(([k], i) => `${k} = $${i + 2}`);
        await c.query(
          `UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = $1`,
          [id, ...entradas.map(([, v]) => (typeof v === 'boolean' ? v : vacioANull(v)))]
        );
      }
    });

    const actualizado = await una('SELECT * FROM v_socios_estado WHERE socio_id = $1', [socioId]);
    res.json(actualizado);
  })
);

// --------------------------------------------------------------------
//  Renovacion / cobro
// --------------------------------------------------------------------
const esquemaRenovacion = z.object({
  plan_id: z.coerce.number().int().positive(),
  fecha_inicio: z.string().date('Fecha inválida.').optional(),
  monto: z.coerce.number().nonnegative().optional(),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO']).default('EFECTIVO'),
  comprobante: z.string().trim().max(40).optional().or(z.literal('')),
  observacion: z.string().trim().max(300).optional().or(z.literal('')),
});

rutasSocios.post(
  '/:id/renovar',
  soloAdmin,
  ruta(async (req, res) => {
    const d = validar(esquemaRenovacion, req.body);
    const socioId = Number(req.params.id);

    const socio = await una('SELECT id FROM socios WHERE id = $1', [socioId]);
    if (!socio) throw noEncontrado('Socio');

    try {
      const membresia = await transaccion((c) =>
        crearMembresia(c, {
          socioId,
          planId: d.plan_id,
          fechaInicio: d.fecha_inicio,
          monto: d.monto,
          metodo: d.metodo,
          comprobante: vacioANull(d.comprobante),
          observacion: vacioANull(d.observacion),
          registradoPor: req.usuario.id,
        })
      );
      const estado = await una('SELECT * FROM v_socios_estado WHERE socio_id = $1', [socioId]);
      res.status(201).json({ membresia, socio: estado });
    } catch (error) {
      if (error.constraint === 'ex_membresias_sin_solape') {
        throw new ErrorHttp(
          409,
          'El período que intentás cargar se superpone con una membresía existente. Revisá la fecha de inicio.'
        );
      }
      throw error;
    }
  })
);

rutasSocios.post(
  '/:id/cancelar-membresia/:membresiaId',
  soloAdmin,
  ruta(async (req, res) => {
    const actualizada = await una(
      `UPDATE membresias SET estado = 'CANCELADA'
        WHERE id = $1 AND socio_id = $2 RETURNING id, estado`,
      [Number(req.params.membresiaId), Number(req.params.id)]
    );
    if (!actualizada) throw noEncontrado('Membresía');
    res.json(actualizada);
  })
);

// --------------------------------------------------------------------
//  Reseteo de contrasena por el admin
// --------------------------------------------------------------------
rutasSocios.post(
  '/:id/reset-password',
  soloAdmin,
  ruta(async (req, res) => {
    const socio = await una(
      'SELECT s.usuario_id, u.documento FROM socios s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = $1',
      [Number(req.params.id)]
    );
    if (!socio) throw noEncontrado('Socio');

    const nueva = (req.body?.password ?? socio.documento).toString();
    if (nueva.length < 4) throw new ErrorHttp(400, 'La contraseña es demasiado corta.');

    await query(
      'UPDATE usuarios SET password_hash = $1, debe_cambiar_password = true WHERE id = $2',
      [await bcrypt.hash(nueva, 10), socio.usuario_id]
    );

    res.json({
      ok: true,
      password_inicial: nueva,
      mensaje: `Contraseña reiniciada a "${nueva}". El socio deberá cambiarla al entrar.`,
    });
  })
);

/**
 * Deja constancia de que se le avisó del vencimiento.
 *
 * El mensaje sale por WhatsApp desde el navegador (wa.me), así que el
 * servidor no manda nada: solo anota cuándo se lo contactó, para que la
 * lista de "por vencer" no vuelva a proponer al mismo mañana.
 */
rutasSocios.post(
  '/:id/aviso',
  soloAdmin,
  ruta(async (req, res) => {
    const socio = await una(
      'UPDATE socios SET ultimo_aviso_en = now() WHERE id = $1 RETURNING ultimo_aviso_en',
      [Number(req.params.id)]
    );
    if (!socio) throw noEncontrado('Socio');
    res.json({ ok: true, ultimo_aviso_en: socio.ultimo_aviso_en });
  })
);

// --------------------------------------------------------------------
//  Asistencia
// --------------------------------------------------------------------
rutasSocios.post(
  '/:id/asistencia',
  soloAdmin,
  ruta(async (req, res) => {
    const socioId = Number(req.params.id);
    const registro = await una(
      `INSERT INTO asistencias (socio_id, registrado_por) VALUES ($1, $2)
       ON CONFLICT (socio_id, fecha) DO NOTHING
       RETURNING id, fecha, hora_entrada`,
      [socioId, req.usuario.id]
    );
    if (!registro) {
      return res.json({ ok: true, duplicado: true, mensaje: 'La asistencia de hoy ya estaba registrada.' });
    }
    res.status(201).json({ ok: true, duplicado: false, ...registro });
  })
);
