import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { una, query } from '../db.js';
import { ErrorHttp, ruta, validar } from '../http.js';
import { autenticar, firmarToken } from '../middleware/auth.js';

export const rutasAuth = Router();

// Freno a la fuerza bruta sobre el login por cedula.
const limiteLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
});

const esquemaLogin = z.object({
  documento: z
    .string()
    .trim()
    .regex(/^[0-9]{4,15}$/, 'La cédula debe tener solo números (4 a 15 dígitos).'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});

rutasAuth.post(
  '/login',
  limiteLogin,
  ruta(async (req, res) => {
    const { documento, password } = validar(esquemaLogin, req.body);

    const usuario = await una(
      `SELECT u.id, u.documento, u.password_hash, u.rol, u.nombre, u.apellido,
              u.activo, u.debe_cambiar_password, s.id AS socio_id
         FROM usuarios u
         LEFT JOIN socios s ON s.usuario_id = u.id
        WHERE u.documento = $1`,
      [documento]
    );

    // Mismo mensaje exista o no el usuario: no revelamos qué cédulas están cargadas.
    const generico = new ErrorHttp(401, 'Cédula o contraseña incorrecta.');
    if (!usuario) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin');
      throw generico;
    }
    if (!(await bcrypt.compare(password, usuario.password_hash))) throw generico;
    if (!usuario.activo) {
      throw new ErrorHttp(403, 'Tu cuenta está inactiva. Consultá en el mostrador.');
    }

    await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [usuario.id]);

    // Aprovecha el login para poner al día los vencimientos.
    await query('SELECT fn_actualizar_membresias_vencidas()');

    res.json({
      token: firmarToken({
        usuario_id: usuario.id,
        rol: usuario.rol,
        socio_id: usuario.socio_id,
        documento: usuario.documento,
      }),
      usuario: {
        id: usuario.id,
        documento: usuario.documento,
        rol: usuario.rol,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        socio_id: usuario.socio_id,
        debe_cambiar_password: usuario.debe_cambiar_password,
      },
    });
  })
);

rutasAuth.get(
  '/yo',
  autenticar,
  ruta(async (req, res) => {
    const usuario = await una(
      `SELECT u.id, u.documento, u.rol, u.nombre, u.apellido, u.email, u.telefono,
              u.debe_cambiar_password, s.id AS socio_id
         FROM usuarios u
         LEFT JOIN socios s ON s.usuario_id = u.id
        WHERE u.id = $1 AND u.activo`,
      [req.usuario.id]
    );
    if (!usuario) throw new ErrorHttp(401, 'La cuenta ya no está activa.');

    let membresia = null;
    if (usuario.socio_id) {
      membresia = await una(
        `SELECT plan, fecha_inicio, fecha_fin, dias_restantes, estado, codigo
           FROM v_socios_estado WHERE socio_id = $1`,
        [usuario.socio_id]
      );
    }

    res.json({ usuario, membresia });
  })
);

const esquemaCambio = z.object({
  password_actual: z.string().min(1, 'Ingresá tu contraseña actual.'),
  password_nueva: z.string().min(6, 'La contraseña nueva debe tener al menos 6 caracteres.'),
});

rutasAuth.post(
  '/cambiar-password',
  autenticar,
  ruta(async (req, res) => {
    const { password_actual, password_nueva } = validar(esquemaCambio, req.body);

    const usuario = await una('SELECT password_hash FROM usuarios WHERE id = $1', [
      req.usuario.id,
    ]);
    if (!usuario || !(await bcrypt.compare(password_actual, usuario.password_hash))) {
      throw new ErrorHttp(400, 'La contraseña actual no es correcta.');
    }
    if (password_actual === password_nueva) {
      throw new ErrorHttp(400, 'La contraseña nueva tiene que ser distinta de la actual.');
    }

    await query(
      'UPDATE usuarios SET password_hash = $1, debe_cambiar_password = false WHERE id = $2',
      [await bcrypt.hash(password_nueva, 10), req.usuario.id]
    );

    res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  })
);
