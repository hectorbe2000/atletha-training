/**
 * Crea (o actualiza) un usuario administrador.
 *
 *   npm run crear:admin -- --documento 1234567 --nombre Ana --apellido Lopez --password secreta
 *
 * Sin --password genera una aleatoria y la imprime una sola vez.
 */
import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { una, cerrarPool } from '../src/db.js';

function argumento(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const documento = argumento('documento');
const nombre = argumento('nombre', 'Administrador');
const apellido = argumento('apellido', 'del Gimnasio');
const password = argumento('password') ?? randomBytes(6).toString('base64url');

if (!documento || !/^[0-9]{4,15}$/.test(documento)) {
  console.error('Falta --documento (la cédula del admin, solo números).');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

const usuario = await una(
  `INSERT INTO usuarios (documento, password_hash, rol, nombre, apellido, debe_cambiar_password)
   VALUES ($1, $2, 'ADMIN', $3, $4, false)
   ON CONFLICT (documento) DO UPDATE SET
     password_hash = EXCLUDED.password_hash,
     rol           = 'ADMIN',
     nombre        = EXCLUDED.nombre,
     apellido      = EXCLUDED.apellido,
     activo        = true
   RETURNING id, documento, rol, nombre, apellido, (xmax = 0) AS creado`,
  [documento, hash, nombre, apellido]
);

console.log(`\n  ${usuario.creado ? 'Administrador creado' : 'Administrador actualizado'}`);
console.log(`  Cédula (usuario): ${usuario.documento}`);
console.log(`  Contraseña:       ${password}`);
console.log('  Guardala: no se vuelve a mostrar.\n');

await cerrarPool();
