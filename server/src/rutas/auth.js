import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { una, query } from '../db.js';
import { ErrorHttp, ruta, validar } from '../http.js';
import { autenticar, firmarToken, marcaDeSesion } from '../middleware/auth.js';

export const rutasAuth = Router();

const mensajeFreno = {
  error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.',
};

/**
 * Freno a la fuerza bruta sobre el login, por equipo que intenta.
 *
 * Solo cuentan los intentos fallidos: la fuerza bruta son fallos, y contar
 * los aciertos solo castiga al que entra bien. Sin esto, el mostrador —que
 * abre sesión varias veces al día— se quedaba afuera solo.
 */
const limitePorIp = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensajeFreno,
});

/**
 * Y otro por cedula.
 *
 * Con uno solo por IP alcanza con cambiar de dispositivo (o de IP en la misma
 * red) para seguir probando contra la misma cuenta. Como la contrasena inicial
 * de un socio es su propia cedula, la cuenta es el recurso que hay que cuidar,
 * no el equipo desde el que se prueba.
 *
 * Los aciertos no gastan intentos: el socio que entra bien todos los dias
 * nunca se topa con esto.
 */
const limitePorDocumento = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => String(req.body?.documento ?? 'sin-documento').toLowerCase(),
  message: mensajeFreno,
});

/**
 * El campo de entrada acepta las dos cosas: la cédula del socio o el nombre
 * de usuario del mostrador. Se distinguen solos porque un nombre de usuario
 * tiene que empezar con letra (ver la migración 013).
 */
const esquemaLogin = z.object({
  documento: z
    .string()
    .trim()
    .min(3, 'Ingresá tu cédula o tu usuario.')
    .max(40)
    .refine(
      (v) => /^[0-9]{4,15}$/.test(v) || /^[A-Za-z][A-Za-z0-9._-]{2,39}$/.test(v),
      'Ingresá tu cédula (solo números) o tu nombre de usuario.'
    ),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});

rutasAuth.post(
  '/login',
  limitePorIp,
  limitePorDocumento,
  ruta(async (req, res) => {
    const { documento, password } = validar(esquemaLogin, req.body);

    const usuario = await una(
      `SELECT u.id, u.documento, u.password_hash, u.rol, u.nombre, u.apellido,
              u.activo, u.debe_cambiar_password, u.tokens_validos_desde,
              u.nombre_usuario, s.id AS socio_id
         FROM usuarios u
         LEFT JOIN socios s ON s.usuario_id = u.id
        WHERE u.documento = $1 OR lower(u.nombre_usuario) = lower($1)`,
      [documento]
    );

    // Mismo mensaje exista o no el usuario: no revelamos qué cédulas están cargadas.
    const generico = new ErrorHttp(401, 'Usuario o contraseña incorrecta.');
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
        sesion: marcaDeSesion(usuario.tokens_validos_desde),
      }),
      usuario: {
        id: usuario.id,
        documento: usuario.documento,
        rol: usuario.rol,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        nombre_usuario: usuario.nombre_usuario,
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
              u.nombre_usuario, u.debe_cambiar_password, s.id AS socio_id
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

    // tokens_validos_desde tumba las sesiones abiertas en otros dispositivos:
    // si alguien estaba usando la cuenta con la contrasena vieja, deja de
    // entrar. Incluye a la sesion actual, asi que se devuelve un token nuevo
    // para no echar de la app a quien acaba de cambiarla.
    const actualizado = await una(
      `UPDATE usuarios
          SET password_hash = $1, debe_cambiar_password = false,
              tokens_validos_desde = now()
        WHERE id = $2
        RETURNING tokens_validos_desde`,
      [await bcrypt.hash(password_nueva, 10), req.usuario.id]
    );

    res.json({
      ok: true,
      mensaje: 'Contraseña actualizada.',
      // Lleva la marca de sesion que se acaba de escribir: es el unico token
      // que sobrevive a la revocacion.
      token: firmarToken({
        usuario_id: req.usuario.id,
        rol: req.usuario.rol,
        socio_id: req.usuario.socioId,
        documento: req.usuario.documento,
        sesion: marcaDeSesion(actualizado.tokens_validos_desde),
      }),
    });
  })
);
