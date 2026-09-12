import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** gym/server */
export const RAIZ_SERVER = path.resolve(aqui, '..');
/** gym/ */
export const RAIZ_PROYECTO = path.resolve(RAIZ_SERVER, '..');

// dotenv/config lee ./.env respecto al cwd; si se arranca desde gym/server
// tambien hay que mirar gym/.env, que es donde vive la configuracion real.
if (!process.env.PGDATABASE) {
  const { config } = await import('dotenv');
  config({ path: path.join(RAIZ_PROYECTO, '.env') });
}

function requerido(clave) {
  const valor = process.env[clave];
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${clave}. Copiá gym/.env.example a gym/.env y completala.`
    );
  }
  return valor;
}

/**
 * Las fotos y los GIF de los ejercicios.
 *
 * Vivían en una carpeta hermana, la del repositorio de donde salió el
 * catálogo. Ahora están adentro del proyecto (`gym/media/`): el sistema no
 * depende de que exista una carpeta al lado, y moverlo de PC es copiar una
 * sola cosa.
 */
const mediaCrudo = process.env.MEDIA_DIR ?? './media';
export const MEDIA_DIR = path.isAbsolute(mediaCrudo)
  ? mediaCrudo
  : path.resolve(RAIZ_PROYECTO, mediaCrudo);

export const config = {
  entorno: process.env.NODE_ENV ?? 'development',
  puerto: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  db: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    database: requerido('PGDATABASE'),
    user: requerido('PGUSER'),
    password: requerido('PGPASSWORD'),
  },

  jwt: {
    secreto: requerido('JWT_SECRET'),
    expira: process.env.JWT_EXPIRES ?? '12h',
  },

  /**
   * Datos que salen impresos en el comprobante de pago. Los que queden
   * vacios simplemente no se imprimen: mejor una linea menos que un
   * "Av. Ejemplo 123" de relleno en algo que ve el socio.
   */
  gimnasio: {
    nombre: process.env.GYM_NOMBRE ?? 'Atletha Training',
    direccion: process.env.GYM_DIRECCION ?? '',
    telefono: process.env.GYM_TELEFONO ?? '',
    // El logo se busca en server/assets/logo.png; si no esta, el
    // comprobante sale igual con el nombre en texto.
    logo: path.join(RAIZ_SERVER, 'assets', 'logo.png'),
  },

  /**
   * Molinete de la entrada. Ver server/src/acceso/index.js.
   * Por defecto simulado: el equipo real todavía no tiene su adaptador.
   */
  molinete: {
    tipo: process.env.MOLINETE ?? 'simulado',
    // Lo que haga falta para hablarle al equipo (puerto, etc.) se agrega acá
    // cuando se conozca el protocolo. Hoy va vacío a propósito.
    opciones: {
      puerto: process.env.MOLINETE_PUERTO ?? null,
    },
  },

  media: {
    raiz: MEDIA_DIR,
    imagenes: path.join(MEDIA_DIR, 'images'),
    videos: path.join(MEDIA_DIR, 'videos'),
    // Solo lo necesita el import del catálogo, no el sistema andando.
    json: path.join(MEDIA_DIR, 'exercises.json'),
  },
};

/**
 * Lo que el sistema necesita para andar: las fotos y los GIF.
 *
 * `exercises.json` queda afuera a propósito. Solo lo usa el import del
 * catálogo, que se corre una vez; exigirlo al arrancar hacía que el servidor
 * se negara a levantar por un archivo que ya no hace falta, con las 1.324
 * fichas cargadas en PostgreSQL.
 */
export function verificarMedia() {
  const faltantes = [
    ['imagenes', config.media.imagenes],
    ['videos', config.media.videos],
  ]
    .filter(([, ruta]) => !existsSync(ruta))
    .map(([clave, ruta]) => `${clave}: ${ruta}`);

  if (faltantes.length) {
    throw new Error(
      `No se encuentran las imágenes de los ejercicios.\n  ${faltantes.join('\n  ')}\n` +
        `Ajustá MEDIA_DIR en gym/.env.`
    );
  }
}

/** El catálogo para importar. Solo lo pide `npm run importar`. */
export function verificarCatalogo() {
  if (!existsSync(config.media.json)) {
    throw new Error(
      `No se encuentra el catálogo para importar.\n  ${config.media.json}\n` +
        `Es el exercises.json del dataset original; solo hace falta para "npm run importar".`
    );
  }
}
