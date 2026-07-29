import pg from 'pg';
import { config } from './config.js';

// Los numeric de PostgreSQL llegan como string para no perder precision.
// En este sistema los montos caben de sobra en un double, y el frontend
// espera numeros, asi que se convierten aca una sola vez.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// int8 (count) -> number
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));
// date -> 'YYYY-MM-DD' sin desplazamiento por zona horaria
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  ...config.db,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'gym-api',
});

pool.on('error', (err) => {
  console.error('[db] error en cliente inactivo del pool:', err.message);
});

/** Consulta suelta usando el pool. */
export function query(texto, params) {
  return pool.query(texto, params);
}

/** Primera fila o null. */
export async function una(texto, params) {
  const { rows } = await pool.query(texto, params);
  return rows[0] ?? null;
}

/** Todas las filas. */
export async function varias(texto, params) {
  const { rows } = await pool.query(texto, params);
  return rows;
}

/**
 * Ejecuta fn dentro de una transaccion. Siempre libera la conexion:
 * sin el finally quedan sesiones colgadas manteniendo locks.
 */
export async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      /* la conexion ya estaba rota */
    }
    throw error;
  } finally {
    cliente.release();
  }
}

export async function cerrarPool() {
  await pool.end();
}
