/** Consultas al catalogo de ejercicios compartidas por rutinas y plantillas. */

import { ErrorHttp } from './http.js';

/**
 * Resuelve codigos del catalogo ('0025') a ids, en una sola consulta.
 *
 * Buscarlos de a uno dentro del bucle que arma una rutina son 56 idas y
 * vueltas para 7 dias con 8 ejercicios, todas dentro de la transaccion.
 *
 * Recibe el cliente de la transaccion, no el pool: tiene que ver lo mismo que
 * el resto de la escritura.
 */
export async function idsDeEjercicios(c, codigos) {
  const unicos = [...new Set(codigos)];
  const { rows } = await c.query(
    'SELECT id, codigo FROM ejercicios WHERE codigo = ANY($1::text[])',
    [unicos]
  );
  const porCodigo = new Map(rows.map((r) => [r.codigo, r.id]));

  const faltante = unicos.find((codigo) => !porCodigo.has(codigo));
  if (faltante) throw new ErrorHttp(400, `El ejercicio ${faltante} no existe en el catálogo.`);

  return porCodigo;
}
