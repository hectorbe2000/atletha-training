/**
 * Carga data/exercises.json del dataset a PostgreSQL.
 *
 * - Inserta/actualiza los 1324 ejercicios (clave: codigo de 4 digitos).
 * - Inserta las instrucciones en los 10 idiomas del dataset.
 * - Verifica que la imagen y el GIF de cada ejercicio existan en disco y
 *   avisa de los que falten, sin abortar la carga.
 *
 *   npm run import:ejercicios
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { config, verificarDataset } from '../src/config.js';
import { pool, cerrarPool, transaccion } from '../src/db.js';

const LOTE = 200;

/** Inserta en lotes usando un unico INSERT multi-fila por lote. */
async function insertarEnLotes(cliente, sqlBase, columnas, filas, sufijo = '') {
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const valores = [];
    const marcadores = lote.map((fila, f) => {
      const base = f * columnas;
      valores.push(...fila);
      return `(${Array.from({ length: columnas }, (_, c) => `$${base + c + 1}`).join(', ')})`;
    });
    await cliente.query(`${sqlBase} VALUES ${marcadores.join(', ')} ${sufijo}`, valores);
  }
}

async function main() {
  verificarDataset();

  console.log(`Leyendo ${config.dataset.json} ...`);
  const crudo = await readFile(config.dataset.json, 'utf8');
  const ejercicios = JSON.parse(crudo);
  console.log(`  ${ejercicios.length} ejercicios en el archivo.`);

  // --- Validacion de media -------------------------------------------------
  const sinImagen = [];
  const sinGif = [];
  for (const e of ejercicios) {
    if (!existsSync(path.join(config.dataset.raiz, e.image))) sinImagen.push(e.id);
    if (!existsSync(path.join(config.dataset.raiz, e.gif_url))) sinGif.push(e.id);
  }
  if (sinImagen.length || sinGif.length) {
    console.warn(`  ! ${sinImagen.length} sin imagen, ${sinGif.length} sin GIF.`);
    if (sinImagen.length) console.warn(`    imagenes: ${sinImagen.slice(0, 10).join(', ')}...`);
    if (sinGif.length) console.warn(`    gifs:     ${sinGif.slice(0, 10).join(', ')}...`);
  } else {
    console.log('  Media verificada: todas las imagenes y GIFs existen en disco.');
  }

  // --- Carga ---------------------------------------------------------------
  const resumen = await transaccion(async (cliente) => {
    const filasEjercicio = ejercicios.map((e) => [
      e.id,
      e.name,
      e.category,
      e.body_part,
      e.equipment,
      e.muscle_group,
      e.target,
      e.secondary_muscles ?? [],
      e.media_id ?? null,
      e.image,
      e.gif_url,
      e.attribution ?? null,
    ]);

    await insertarEnLotes(
      cliente,
      `INSERT INTO ejercicios
         (codigo, nombre, categoria, body_part, equipo, grupo_muscular,
          musculo_objetivo, musculos_secundarios, media_id, imagen, gif, atribucion)`,
      12,
      filasEjercicio,
      `ON CONFLICT (codigo) DO UPDATE SET
         nombre               = EXCLUDED.nombre,
         categoria            = EXCLUDED.categoria,
         body_part            = EXCLUDED.body_part,
         equipo               = EXCLUDED.equipo,
         grupo_muscular       = EXCLUDED.grupo_muscular,
         musculo_objetivo     = EXCLUDED.musculo_objetivo,
         musculos_secundarios = EXCLUDED.musculos_secundarios,
         media_id             = EXCLUDED.media_id,
         imagen               = EXCLUDED.imagen,
         gif                  = EXCLUDED.gif,
         atribucion           = EXCLUDED.atribucion`
    );

    // codigo -> id, para las instrucciones
    const { rows } = await cliente.query('SELECT id, codigo FROM ejercicios');
    const idPorCodigo = new Map(rows.map((r) => [r.codigo, r.id]));

    const filasInstruccion = [];
    for (const e of ejercicios) {
      const ejercicioId = idPorCodigo.get(e.id);
      if (!ejercicioId) continue;
      for (const [idioma, texto] of Object.entries(e.instructions ?? {})) {
        if (idioma.length !== 2) continue;
        filasInstruccion.push([
          ejercicioId,
          idioma,
          texto,
          e.instruction_steps?.[idioma] ?? [],
        ]);
      }
    }

    await insertarEnLotes(
      cliente,
      'INSERT INTO ejercicio_instrucciones (ejercicio_id, idioma, texto, pasos)',
      4,
      filasInstruccion,
      `ON CONFLICT (ejercicio_id, idioma) DO UPDATE SET
         texto = EXCLUDED.texto,
         pasos = EXCLUDED.pasos`
    );

    return { ejercicios: filasEjercicio.length, instrucciones: filasInstruccion.length };
  });

  console.log(
    `\nCargados ${resumen.ejercicios} ejercicios y ${resumen.instrucciones} instrucciones.`
  );

  // --- Coherencia con los catalogos de traduccion --------------------------
  const { rows: huerfanos } = await pool.query(`
    SELECT 'BODY_PART' AS tipo, e.body_part AS valor FROM ejercicios e
      LEFT JOIN terminos t ON t.tipo = 'BODY_PART' AND t.valor = e.body_part
      WHERE t.valor IS NULL
    UNION
    SELECT 'EQUIPO', e.equipo FROM ejercicios e
      LEFT JOIN terminos t ON t.tipo = 'EQUIPO' AND t.valor = e.equipo
      WHERE t.valor IS NULL
    UNION
    SELECT 'MUSCULO', e.musculo_objetivo FROM ejercicios e
      LEFT JOIN terminos t ON t.tipo = 'MUSCULO' AND t.valor = e.musculo_objetivo
      WHERE t.valor IS NULL
    UNION
    SELECT 'MUSCULO', e.grupo_muscular FROM ejercicios e
      LEFT JOIN terminos t ON t.tipo = 'MUSCULO' AND t.valor = e.grupo_muscular
      WHERE t.valor IS NULL
  `);

  if (huerfanos.length) {
    console.warn('\n! Valores del dataset sin etiqueta en espanol (agregar a 002_catalogos.sql):');
    for (const h of huerfanos) console.warn(`    ${h.tipo}: ${h.valor}`);
  } else {
    console.log('Todos los valores del dataset tienen etiqueta en espanol.');
  }
}

main()
  .catch((error) => {
    console.error('\nFallo la carga:', error.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
