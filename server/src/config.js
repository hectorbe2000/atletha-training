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

const datasetCrudo = process.env.DATASET_DIR ?? '../exercises-dataset-main';
export const DATASET_DIR = path.isAbsolute(datasetCrudo)
  ? datasetCrudo
  : path.resolve(RAIZ_PROYECTO, datasetCrudo);

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

  dataset: {
    raiz: DATASET_DIR,
    json: path.join(DATASET_DIR, 'data', 'exercises.json'),
    imagenes: path.join(DATASET_DIR, 'images'),
    videos: path.join(DATASET_DIR, 'videos'),
  },
};

export function verificarDataset() {
  const faltantes = Object.entries(config.dataset)
    .filter(([, ruta]) => !existsSync(ruta))
    .map(([clave, ruta]) => `${clave}: ${ruta}`);
  if (faltantes.length) {
    throw new Error(
      `No se encuentra el dataset de ejercicios.\n  ${faltantes.join('\n  ')}\n` +
        `Ajustá DATASET_DIR en gym/.env.`
    );
  }
}
