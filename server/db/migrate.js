/**
 * Corredor de migraciones.
 *
 * Aplica en orden alfabetico todo db/migrations/*.sql que todavia no figure
 * en la tabla _migraciones. Cada archivo corre en su propia transaccion, asi
 * que un error deja la base en el ultimo estado consistente.
 *
 *   npm run migrate
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool, cerrarPool } from '../src/db.js';

const DIR_MIGRACIONES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      nombre     text        PRIMARY KEY,
      checksum   text        NOT NULL,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  const archivos = (await readdir(DIR_MIGRACIONES)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT nombre, checksum FROM _migraciones');
  const aplicadas = new Map(rows.map((r) => [r.nombre, r.checksum]));

  let nuevas = 0;

  for (const archivo of archivos) {
    const sql = await readFile(path.join(DIR_MIGRACIONES, archivo), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);

    if (aplicadas.has(archivo)) {
      if (aplicadas.get(archivo) !== checksum) {
        console.warn(
          `  ! ${archivo} cambio despues de aplicarse (checksum distinto). No se vuelve a ejecutar.`
        );
      } else {
        console.log(`  = ${archivo}`);
      }
      continue;
    }

    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query('INSERT INTO _migraciones (nombre, checksum) VALUES ($1, $2)', [
        archivo,
        checksum,
      ]);
      await cliente.query('COMMIT');
      console.log(`  + ${archivo}`);
      nuevas++;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => {});
      console.error(`\n  x ${archivo} fallo:\n    ${error.message}\n`);
      throw error;
    } finally {
      cliente.release();
    }
  }

  console.log(
    nuevas === 0 ? '\nLa base ya estaba al dia.' : `\n${nuevas} migracion(es) aplicada(s).`
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
