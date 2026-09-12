import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query, transaccion } from '../db.js';
import { ErrorHttp, noEncontrado, paginacion, ruta, validar } from '../http.js';
import { decidirAcceso, MOTIVOS } from '../acceso/decision.js';
import { numeroComprobante } from '../comprobante.js';
import { armarPlanilla, nombreConFecha, responderPlanilla } from '../planilla.js';
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
  // Obligatoria y la elige el administrador. Antes, si no venia, la inicial
  // era la propia cedula: un dato que esta a la vista en el mostrador y que
  // cualquiera puede adivinar, asi que la cuenta quedaba abierta hasta que el
  // socio entraba por primera vez.
  password: z
    .string()
    .min(6, 'Poné una contraseña de al menos 6 caracteres y decísela al socio.'),
  // Membresia inicial opcional, en el mismo alta.
  plan_id: z.coerce.number().int().positive().optional(),
  fecha_inicio: z.string().date('Fecha inválida.').optional(),
  monto: z.coerce.number().nonnegative().optional(),
  metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO']).optional(),
});

const vacioANull = (v) => (v === '' || v === undefined ? null : v);

/**
 * Anota el intento en la bitácora de la puerta.
 *
 * Los ingresos del mostrador van a la misma tabla que los del molinete, para
 * que "quién entró y por dónde" se responda mirando un solo lado. Que falle
 * el registro no puede frenar al socio en la puerta: se avisa y se sigue.
 */
async function registrarAcceso({ socioId, permitido, motivo, registradoPor, forzado = false }) {
  try {
    await query(
      `INSERT INTO accesos (socio_id, permitido, motivo, origen, forzado, registrado_por)
       VALUES ($1, $2, $3, 'MOSTRADOR', $4, $5)`,
      [socioId, permitido, motivo, forzado, registradoPor]
    );
  } catch (error) {
    console.error('[acceso] no se pudo registrar el ingreso del mostrador:', error.message);
  }
}

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

    // La misma regla que usa el molinete. Ver server/src/acceso/decision.js:
    // tener dos copias garantizaba que tarde o temprano una dijera que sí y
    // la otra que no para el mismo socio.
    const decision = decidirAcceso(socio);

    // Un socio dado de baja no pasa ni forzando: si se lo quiere dejar
    // entrar, primero hay que reactivarlo desde la ficha.
    const forzable = decision.motivo !== MOTIVOS.INACTIVO;

    if (!decision.permitido && !(forzar && forzable)) {
      await registrarAcceso({
        socioId: socio.socio_id,
        permitido: false,
        motivo: decision.motivo,
        registradoPor: req.usuario.id,
      });
      return res.json({
        socio,
        permitido: false,
        registrado: false,
        motivo: decision.motivo,
        mensaje:
          decision.motivo === MOTIVOS.INACTIVO
            ? 'La cuenta de este socio está dada de baja.'
            : decision.mensaje,
      });
    }

    const registro = await una(
      `INSERT INTO asistencias (socio_id, registrado_por) VALUES ($1, $2)
       ON CONFLICT (socio_id, fecha) DO NOTHING
       RETURNING hora_entrada`,
      [socio.socio_id, req.usuario.id]
    );

    const forzado = !decision.permitido;
    await registrarAcceso({
      socioId: socio.socio_id,
      permitido: true,
      motivo: forzado ? `${decision.motivo}_FORZADO` : decision.motivo,
      registradoPor: req.usuario.id,
      forzado,
    });

    res.json({
      socio,
      permitido: true,
      registrado: Boolean(registro),
      forzado,
      motivo: forzado ? `${decision.motivo}_FORZADO` : decision.motivo,
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
    // El último pago viaja con cada socio para poder ofrecer el comprobante
    // desde el listado: si el mostrador se olvidó de bajarlo al cobrar, no
    // tiene que entrar a la ficha a buscarlo.
    const filas = await varias(
      `SELECT v.*, (count(*) OVER ())::int AS total,
              p.id AS ultimo_pago_id
         FROM v_socios_estado v
         LEFT JOIN LATERAL (
           SELECT id FROM pagos
            WHERE socio_id = v.socio_id
            ORDER BY fecha_pago DESC, id DESC
            LIMIT 1
         ) p ON true
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
//  Planilla de socios
//
//  Va antes de '/:id' porque Express resuelve en orden de registro: si no,
//  "exportar" se tomaría como el id de un socio.
// --------------------------------------------------------------------
const COLUMNAS_SOCIOS = [
  { clave: 'codigo', titulo: 'Código' },
  { clave: 'documento', titulo: 'Cédula' },
  { clave: 'apellido', titulo: 'Apellido' },
  { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'telefono', titulo: 'Teléfono' },
  { clave: 'email', titulo: 'Email' },
  { clave: 'fecha_nacimiento', titulo: 'Nacimiento' },
  { clave: 'sexo', titulo: 'Sexo' },
  { clave: 'fecha_ingreso', titulo: 'Socio desde' },
  { clave: 'plan', titulo: 'Plan' },
  { clave: 'fecha_inicio', titulo: 'Inicio' },
  { clave: 'fecha_fin', titulo: 'Vence' },
  { clave: 'dias_restantes', titulo: 'Días restantes' },
  { clave: 'estado', titulo: 'Estado' },
  { clave: 'activo', titulo: 'Activo', formato: (v) => (v ? 'Sí' : 'No') },
  { clave: 'ultima_asistencia', titulo: 'Última asistencia' },
  { clave: 'asistencias_mes', titulo: 'Asistencias del mes' },
  { clave: 'objetivo', titulo: 'Objetivo' },
];

rutasSocios.get(
  '/exportar',
  soloAdmin,
  ruta(async (req, res) => {
    await query('SELECT fn_actualizar_membresias_vencidas()');

    // Por defecto solo los activos, igual que el listado de la pantalla.
    const incluirInactivos = req.query.inactivos === 'true';

    const filas = await varias(
      `SELECT v.codigo, v.documento, v.apellido, v.nombre, v.telefono, v.email,
              s.fecha_nacimiento, s.sexo, v.fecha_ingreso,
              v.plan, v.fecha_inicio, v.fecha_fin, v.dias_restantes, v.estado, v.activo,
              s.objetivo,
              a.ultima AS ultima_asistencia,
              coalesce(a.este_mes, 0) AS asistencias_mes
         FROM v_socios_estado v
         JOIN socios s ON s.id = v.socio_id
         LEFT JOIN LATERAL (
           SELECT max(fecha) AS ultima,
                  count(*) FILTER (WHERE fecha >= date_trunc('month', current_date))::int AS este_mes
             FROM asistencias WHERE socio_id = v.socio_id
         ) a ON true
        ${incluirInactivos ? '' : 'WHERE v.activo'}
        ORDER BY v.apellido, v.nombre`
    );

    responderPlanilla(res, nombreConFecha('socios'), armarPlanilla(COLUMNAS_SOCIOS, filas));
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

    const hash = await bcrypt.hash(d.password, 10);

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
          // La contraseña la puso el administrador y el socio se la queda: no
          // se le exige cambiarla, la cambia cuando quiera desde su perfil.
          false,
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

    // La contraseña no se devuelve: la escribió el administrador hace dos
    // segundos y no tiene por qué quedar dando vueltas en la respuesta.
    res.status(201).json({
      ...resultado,
      mensaje: 'Socio creado. Entra con su cédula y la contraseña que le pusiste.',
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

  // El id del pago vuelve con la membresía para poder ofrecer el comprobante
  // apenas se termina de cobrar, que es cuando el socio lo está esperando.
  const importe = monto ?? plan.precio;
  let pagoId = null;
  if (importe > 0) {
    const { rows: [pago] } = await c.query(
      `INSERT INTO pagos (socio_id, membresia_id, monto, metodo, comprobante, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [socioId, membresia.id, importe, metodo ?? 'EFECTIVO', comprobante ?? null, registradoPor]
    );
    pagoId = pago.id;
  }

  return {
    ...membresia,
    plan: plan.nombre,
    pago_id: pagoId,
    // El número que ve el socio, para poder mostrarlo apenas se cobra.
    comprobante_nro: pagoId ? numeroComprobante(pagoId) : null,
  };
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
        `SELECT id, lpad(id::text, 7, '0') AS comprobante_nro,
                monto, metodo, fecha_pago, comprobante, observacion
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
    const socio = await una('SELECT usuario_id FROM socios WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!socio) throw noEncontrado('Socio');

    // Tambien la elige el administrador: antes, sin cuerpo, volvia a quedar
    // la cedula y el problema del alta se repetia en cada reinicio.
    const { password: nueva } = validar(
      z.object({
        password: z
          .string()
          .min(6, 'Poné una contraseña de al menos 6 caracteres y decísela al socio.'),
      }),
      req.body
    );

    // Reiniciar la contrasena tiene que sacar al que estuviera usando la
    // cuenta: si el socio pide el reseteo porque alguien mas entraba con su
    // cedula, dejarle la sesion abierta al otro no arregla nada.
    await query(
      `UPDATE usuarios
          SET password_hash = $1, debe_cambiar_password = false,
              tokens_validos_desde = now()
        WHERE id = $2`,
      [await bcrypt.hash(nueva, 10), socio.usuario_id]
    );

    res.json({
      ok: true,
      mensaje: 'Contraseña reiniciada. Decísela al socio; las sesiones abiertas se cerraron.',
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
