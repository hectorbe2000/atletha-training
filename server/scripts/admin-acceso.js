/**
 * Nombre de usuario y contraseña de una cuenta de administrador.
 *
 *   node scripts/admin-acceso.js --documento 1234567 --usuario Atletha
 *   node scripts/admin-acceso.js --usuario Atletha --password nueva-clave
 *
 * Se puede identificar la cuenta por --documento o por el --usuario que ya
 * tenga. Cambiar la contraseña cierra las sesiones abiertas de esa cuenta.
 */
import bcrypt from 'bcryptjs';

import { una, query, cerrarPool } from '../src/db.js';

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const documento = arg('documento');
const usuario = arg('usuario');
const password = arg('password');

async function main() {
  if (!documento && !usuario) {
    console.error(
      '\n  Indicá a quién: --documento 1234567  o  --usuario Atletha\n' +
        '  Y qué cambiarle: --usuario <nuevo>  y/o  --password <nueva>\n'
    );
    process.exitCode = 1;
    return;
  }

  const cuenta = await una(
    `SELECT id, documento, nombre, apellido, rol, nombre_usuario
       FROM usuarios
      WHERE ($1::text IS NOT NULL AND documento = $1)
         OR ($2::text IS NOT NULL AND lower(nombre_usuario) = lower($2))`,
    [documento, usuario]
  );

  if (!cuenta) {
    console.error(`\n  No hay ninguna cuenta con ${documento ? `cédula ${documento}` : `usuario ${usuario}`}.\n`);
    process.exitCode = 1;
    return;
  }

  if (cuenta.rol !== 'ADMIN') {
    console.error(
      `\n  ${cuenta.nombre} ${cuenta.apellido} no es administrador.\n` +
        '  El nombre de usuario es para el mostrador; los socios entran con su cédula.\n'
    );
    process.exitCode = 1;
    return;
  }

  const cambios = [];
  const valores = [cuenta.id];

  // Solo se toma como "nuevo usuario" si no fue el criterio de búsqueda.
  if (usuario && !documento) {
    // Se buscó por usuario: no hay nada nuevo que poner salvo la contraseña.
  } else if (usuario) {
    cambios.push(`nombre_usuario = $${valores.push(usuario)}`);
  }

  if (password) {
    if (password.length < 8) {
      console.error('\n  La contraseña del mostrador debería tener al menos 8 caracteres.\n');
      process.exitCode = 1;
      return;
    }
    cambios.push(`password_hash = $${valores.push(await bcrypt.hash(password, 10))}`);
    cambios.push('debe_cambiar_password = false');
    // Cerrar lo que estuviera abierto con la contraseña vieja.
    cambios.push('tokens_validos_desde = now()');
  }

  if (!cambios.length) {
    console.log('\n  No indicaste qué cambiar (--usuario o --password).\n');
    return;
  }

  await query(`UPDATE usuarios SET ${cambios.join(', ')} WHERE id = $1`, valores);

  const final = await una('SELECT documento, nombre_usuario FROM usuarios WHERE id = $1', [
    cuenta.id,
  ]);

  console.log(`\n  Cuenta de ${cuenta.nombre} ${cuenta.apellido} actualizada.`);
  console.log(`      Usuario:  ${final.nombre_usuario ?? '(sin nombre de usuario)'}`);
  console.log(`      Cédula:   ${final.documento}  (sigue sirviendo para entrar)`);
  if (password) {
    console.log('      Contraseña cambiada. Las sesiones abiertas se cerraron.');
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
