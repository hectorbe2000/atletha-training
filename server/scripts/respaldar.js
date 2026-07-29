/**
 * Respaldo de la base del gimnasio.
 *
 *   node scripts/respaldar.js                  copia a gym/respaldos/
 *   node scripts/respaldar.js --destino D:\    copia a otra unidad (pendrive)
 *   node scripts/respaldar.js --conservar 60   cuántas copias dejar (por defecto 30)
 *   node scripts/respaldar.js --listar         muestra las copias existentes
 *
 * Usa pg_dump en formato comprimido (-Fc), que se restaura con pg_restore y
 * ocupa mucho menos que un .sql plano.
 *
 * IMPORTANTE: un respaldo en el mismo disco no te salva de que se rompa el
 * disco. Apuntá --destino a un pendrive, a otra máquina de la red o a una
 * carpeta sincronizada en la nube.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { config, RAIZ_PROYECTO } from '../src/config.js';

const arg = (nombre, porDefecto = null) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : porDefecto;
};

const DESTINO = path.resolve(arg('destino', path.join(RAIZ_PROYECTO, 'respaldos')));
const CONSERVAR = Number(arg('conservar', 30));
const PREFIJO = `respaldo-${config.db.database}-`;

/**
 * pg_dump no suele estar en el PATH en Windows. Se busca en las rutas
 * habituales de instalación antes de rendirse.
 */
function buscarPgDump() {
  const enPath = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const candidatos = [];
  for (const version of ['17', '16', '15', '14', '13']) {
    candidatos.push(`C:\\Program Files\\PostgreSQL\\${version}\\bin\\pg_dump.exe`);
    candidatos.push(`/usr/lib/postgresql/${version}/bin/pg_dump`);
  }
  candidatos.push('/usr/bin/pg_dump', '/usr/local/bin/pg_dump');

  return candidatos.find((c) => existsSync(c)) ?? enPath;
}

function marcaDeTiempo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const tamano = (bytes) => {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

function copias() {
  if (!existsSync(DESTINO)) return [];
  return readdirSync(DESTINO)
    .filter((f) => f.startsWith(PREFIJO) && f.endsWith('.dump'))
    .map((f) => ({ nombre: f, ruta: path.join(DESTINO, f), ...statSync(path.join(DESTINO, f)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function listar() {
  const c = copias();
  if (!c.length) {
    console.log(`\n  No hay respaldos en ${DESTINO}\n`);
    return;
  }
  console.log(`\n  ${c.length} respaldo(s) en ${DESTINO}:\n`);
  for (const f of c) {
    console.log(`    ${f.nombre}   ${tamano(f.size).padStart(9)}   ${f.mtime.toLocaleString('es-PY')}`);
  }
  console.log('');
}

function rotar() {
  const sobran = copias().slice(CONSERVAR);
  for (const f of sobran) {
    unlinkSync(f.ruta);
    console.log(`  - ${f.nombre} (rotado)`);
  }
  return sobran.length;
}

async function respaldar() {
  mkdirSync(DESTINO, { recursive: true });

  const pgDump = buscarPgDump();
  const archivo = path.join(DESTINO, `${PREFIJO}${marcaDeTiempo()}.dump`);

  console.log(`\n  Respaldando ${config.db.database} -> ${archivo}`);

  const codigo = await new Promise((resolver) => {
    const proceso = spawn(
      pgDump,
      [
        '--host', config.db.host,
        '--port', String(config.db.port),
        '--username', config.db.user,
        '--dbname', config.db.database,
        '--format', 'custom',
        '--compress', '6',
        '--no-owner',
        '--no-privileges',
        '--file', archivo,
      ],
      {
        // La contraseña va por variable de entorno: nunca en la línea de
        // comandos, donde quedaría visible en el listado de procesos.
        env: { ...process.env, PGPASSWORD: config.db.password },
        stdio: ['ignore', 'inherit', 'inherit'],
      }
    );
    proceso.on('error', (e) => {
      console.error(`\n  No se pudo ejecutar pg_dump (${pgDump}): ${e.message}`);
      console.error('  Instalá PostgreSQL client o ajustá la ruta en buscarPgDump().\n');
      resolver(127);
    });
    proceso.on('close', resolver);
  });

  if (codigo !== 0) {
    console.error(`\n  FALLÓ el respaldo (pg_dump salió con código ${codigo}).\n`);
    process.exitCode = 1;
    return;
  }

  const info = statSync(archivo);
  if (info.size < 1024) {
    console.error('\n  El archivo generado es sospechosamente chico. Revisalo antes de confiar en él.\n');
    process.exitCode = 1;
    return;
  }

  console.log(`  Listo: ${tamano(info.size)}`);
  const rotados = rotar();
  const total = copias().length;
  console.log(
    `  ${total} respaldo(s) guardado(s)${rotados ? `, ${rotados} rotado(s)` : ''} (se conservan ${CONSERVAR}).`
  );
  console.log(`\n  Restaurar:  pg_restore -U ${config.db.user} -d ${config.db.database} --clean --if-exists "${archivo}"\n`);
}

const accion = process.argv.includes('--listar') ? listar : respaldar;
await accion();
