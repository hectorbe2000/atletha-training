import jwt from 'jsonwebtoken';

import { config } from '../config.js';
import { una } from '../db.js';
import { ErrorHttp } from '../http.js';

/**
 * El token lleva lo minimo para autorizar: id de usuario, rol y — si es
 * socio — su id de socio. El estado que puede cambiar de un momento a otro
 * (si sigue activo, si ya eligio contrasena) se lee de la base en cada
 * request; ver `autenticar`.
 */
export function firmarToken({ usuario_id, rol, socio_id = null, documento, sesion = 0 }) {
  return jwt.sign({ rol, socio_id, documento, sesion }, config.jwt.secreto, {
    subject: String(usuario_id),
    expiresIn: config.jwt.expira,
  });
}

/**
 * La marca de sesion que va dentro del token: `usuarios.tokens_validos_desde`
 * en milisegundos, o 0 si nunca se revoco.
 *
 * Va como dato propio y no se deduce de `iat` porque `iat` viene en segundos
 * enteros: dos revocaciones dentro del mismo segundo —cambiar la contrasena y
 * que el admin la reinicie enseguida— son indistinguibles, y el token que
 * habia que matar sobrevivia. Comparando la marca por igualdad no hay
 * ventana: cualquier cambio en la base invalida todo lo emitido antes.
 */
export function marcaDeSesion(tokensValidosDesde) {
  return tokensValidosDesde ? new Date(tokensValidosDesde).getTime() : 0;
}

/**
 * Un token firmado no alcanza: tambien tiene que seguir siendo valido *ahora*.
 *
 * Sin esta consulta, dar de baja a un socio o reiniciarle la contrasena no lo
 * sacaba del sistema — seguia entrando con el token viejo hasta que expirara.
 * Es un lookup por clave primaria contra un PostgreSQL local; al lado de lo
 * que ya hace cualquier listado, no se nota.
 */
export async function autenticar(req, _res, next) {
  // Este middleware se monta a nivel de /api y ademas dentro de cada router;
  // si ya corrio para esta peticion, no se vuelve a consultar la base.
  if (req.usuario) return next();

  const cabecera = req.headers.authorization ?? '';
  const [esquema, token] = cabecera.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return next(new ErrorHttp(401, 'Falta el token de acceso.'));
  }

  let carga;
  try {
    carga = jwt.verify(token, config.jwt.secreto);
  } catch (error) {
    const expirado = error.name === 'TokenExpiredError';
    return next(
      new ErrorHttp(401, expirado ? 'La sesión expiró, volvé a entrar.' : 'Token inválido.')
    );
  }

  try {
    const usuario = await una(
      `SELECT u.id, u.rol, u.activo, u.debe_cambiar_password, u.tokens_validos_desde,
              u.documento, s.id AS socio_id
         FROM usuarios u
         LEFT JOIN socios s ON s.usuario_id = u.id
        WHERE u.id = $1`,
      [Number(carga.sub)]
    );

    if (!usuario) return next(new ErrorHttp(401, 'La cuenta ya no existe.'));
    if (!usuario.activo) {
      return next(new ErrorHttp(401, 'Tu cuenta está inactiva. Consultá en el mostrador.'));
    }

    // Cambiar o reiniciar la contrasena invalida todo lo emitido antes.
    if ((carga.sesion ?? 0) !== marcaDeSesion(usuario.tokens_validos_desde)) {
      return next(new ErrorHttp(401, 'La sesión ya no es válida, volvé a entrar.'));
    }

    req.usuario = {
      id: usuario.id,
      rol: usuario.rol,
      socioId: usuario.socio_id,
      documento: usuario.documento,
      debeCambiarPassword: usuario.debe_cambiar_password,
    };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Mientras el usuario siga con la contrasena inicial no puede usar el resto
 * del sistema. Antes esto lo decidia solo el frontend (un <Navigate> en
 * App.jsx), asi que el token servia igual para pegarle a la API de costado.
 */
export function passwordAlDia(req, _res, next) {
  if (req.usuario?.debeCambiarPassword) {
    return next(
      new ErrorHttp(
        403,
        'Tenés que elegir tu contraseña antes de usar el sistema.',
        { debe_cambiar_password: true }
      )
    );
  }
  next();
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
  // Sin esto un id no numerico llegaba como NaN hasta la consulta y salia
  // por el 500 generico en vez de decir que el pedido estaba mal.
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorHttp(400, 'El identificador de socio no es válido.');
  }
  if (req.usuario.rol === 'ADMIN') return id;
  if (req.usuario.socioId === id) return id;
  throw new ErrorHttp(403, 'No podés ver los datos de otro socio.');
}
