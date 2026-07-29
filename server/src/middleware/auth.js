import jwt from 'jsonwebtoken';

import { config } from '../config.js';
import { ErrorHttp } from '../http.js';

/**
 * El token lleva lo minimo para autorizar sin volver a la base en cada
 * request: id de usuario, rol y — si es socio — su id de socio.
 */
export function firmarToken({ usuario_id, rol, socio_id = null, documento }) {
  return jwt.sign({ rol, socio_id, documento }, config.jwt.secreto, {
    subject: String(usuario_id),
    expiresIn: config.jwt.expira,
  });
}

export function autenticar(req, _res, next) {
  const cabecera = req.headers.authorization ?? '';
  const [esquema, token] = cabecera.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(new ErrorHttp(401, 'Falta el token de acceso.'));
  }

  try {
    const carga = jwt.verify(token, config.jwt.secreto);
    req.usuario = {
      id: Number(carga.sub),
      rol: carga.rol,
      socioId: carga.socio_id,
      documento: carga.documento,
    };
    next();
  } catch (error) {
    const expirado = error.name === 'TokenExpiredError';
    next(
      new ErrorHttp(401, expirado ? 'La sesión expiró, volvé a entrar.' : 'Token inválido.')
    );
  }
}

export function soloAdmin(req, _res, next) {
  if (req.usuario?.rol !== 'ADMIN') {
    return next(new ErrorHttp(403, 'Esta sección es solo para administradores.'));
  }
  next();
}

export function soloSocio(req, _res, next) {
  if (req.usuario?.rol !== 'SOCIO' || !req.usuario.socioId) {
    return next(new ErrorHttp(403, 'Esta sección es solo para socios.'));
  }
  next();
}

/**
 * Permite acceder al recurso de un socio si sos ese socio o si sos admin.
 * Devuelve el id de socio efectivo.
 */
export function socioAccesible(req, socioIdSolicitado) {
  const id = Number(socioIdSolicitado);
  if (req.usuario.rol === 'ADMIN') return id;
  if (req.usuario.socioId === id) return id;
  throw new ErrorHttp(403, 'No podés ver los datos de otro socio.');
}
