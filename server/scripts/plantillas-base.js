/**
 * Carga tres plantillas de rutina para arrancar.
 *
 *   node scripts/plantillas-base.js
 *   node scripts/plantillas-base.js --borrar
 *
 * No va en una migración a propósito: referencia códigos de ejercicio, y en
 * una instalación nueva las migraciones corren ANTES de importar el dataset.
 * Correlo después de `npm run importar`.
 */
import { cerrarPool, transaccion, una, query } from '../src/db.js';

const PLANTILLAS = [
  {
    nombre: 'Full body principiante',
    objetivo: 'Adaptación',
    nivel: 'PRINCIPIANTE',
    descripcion: 'Tres días alternados. Calentá 10 minutos antes y dejá un día de descanso entre sesiones.',
    dias: [
      { etiqueta: 'Día A', ejercicios: [['0043', 3, '10', 90], ['0025', 3, '10', 90], ['0007', 3, '12', 60]] },
      { etiqueta: 'Día B', ejercicios: [['1760', 3, '12', 75], ['0334', 3, '12-15', 60], ['0294', 3, '12', 45]] },
      { etiqueta: 'Día C', ejercicios: [['0032', 3, '8-10', 120], ['0652', 3, 'máx', 90], ['0025', 3, '10', 90]] },
    ],
  },
  {
    nombre: 'Torso - Pierna',
    objetivo: 'Hipertrofia',
    nivel: 'INTERMEDIO',
    descripcion: 'Cuatro días: dos de torso y dos de pierna. Subí el peso cuando completes todas las series.',
    dias: [
      { etiqueta: 'Torso 1', ejercicios: [['0025', 4, '8-10', 120], ['0007', 4, '10-12', 90], ['0334', 3, '12-15', 60]] },
      { etiqueta: 'Pierna 1', ejercicios: [['0043', 4, '8-10', 150], ['1760', 3, '12', 90]] },
      { etiqueta: 'Torso 2', ejercicios: [['0652', 4, 'máx', 120], ['0294', 3, '10-12', 60], ['0334', 3, '15', 45]] },
      { etiqueta: 'Pierna 2', ejercicios: [['0032', 4, '6-8', 180], ['1760', 3, '10', 90]] },
    ],
  },
  {
    nombre: 'Empuje - Tirón - Pierna',
    objetivo: 'Fuerza e hipertrofia',
    nivel: 'AVANZADO',
    descripcion: 'El clásico push-pull-legs. Seis días o tres, según cuánto entrenes por semana.',
    dias: [
      { etiqueta: 'Empuje', ejercicios: [['0025', 4, '6-8', 150], ['0334', 4, '12', 60], ['0043', 3, '10', 90]] },
      { etiqueta: 'Tirón', ejercicios: [['0652', 4, 'máx', 120], ['0007', 4, '10', 90], ['0294', 3, '10-12', 60]] },
      { etiqueta: 'Pierna', ejercicios: [['0043', 5, '5', 180], ['0032', 3, '6', 180], ['1760', 3, '12', 90]] },
    ],
  },
];

async function borrar() {
  const { rowCount } = await query(
    'DELETE FROM plantillas WHERE nombre = ANY($1)',
    [PLANTILLAS.map((p) => p.nombre)]
  );
  console.log(`\n  ${rowCount} plantilla(s) base eliminada(s).\n`);
}

async function cargar() {
  const admin = await una("SELECT id FROM usuarios WHERE rol = 'ADMIN' ORDER BY id LIMIT 1");
  if (!admin) {
    console.log('\n  Primero creá un administrador: npm run crear:admin -- --documento <cedula>\n');
    return;
  }

  const cuantos = await una('SELECT count(*)::int AS n FROM ejercicios');
  if (!cuantos.n) {
    console.log('\n  El catálogo está vacío. Corré primero: npm run importar\n');
    return;
  }

  let creadas = 0;
  let omitidas = 0;

  for (const p of PLANTILLAS) {
    const existe = await una('SELECT id FROM plantillas WHERE nombre = $1', [p.nombre]);
    if (existe) {
      omitidas++;
      continue;
    }

    await transaccion(async (c) => {
      const { rows: [pl] } = await c.query(
        `INSERT INTO plantillas (nombre, descripcion, objetivo, nivel, creado_por)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [p.nombre, p.descripcion, p.objetivo, p.nivel, admin.id]
      );

      for (const [i, dia] of p.dias.entries()) {
        const { rows: [d] } = await c.query(
          'INSERT INTO plantilla_dias (plantilla_id, orden, etiqueta) VALUES ($1,$2,$3) RETURNING id',
          [pl.id, i + 1, dia.etiqueta]
        );
        for (const [j, [codigo, series, reps, pausa]] of dia.ejercicios.entries()) {
          const { rowCount } = await c.query(
            `INSERT INTO plantilla_ejercicios
               (plantilla_dia_id, ejercicio_id, orden, series, repeticiones, descanso_seg)
             SELECT $1, e.id, $3, $4, $5, $6 FROM ejercicios e WHERE e.codigo = $2`,
            [d.id, codigo, j + 1, series, reps, pausa]
          );
          if (!rowCount) throw new Error(`El ejercicio ${codigo} no está en el catálogo.`);
        }
      }
    });

    console.log(`  + ${p.nombre} (${p.dias.length} días)`);
    creadas++;
  }

  console.log(
    `\n  ${creadas} plantilla(s) creada(s)${omitidas ? `, ${omitidas} ya existían` : ''}.\n` +
      '  Asignalas desde el panel: Plantillas -> Asignar.\n'
  );
}

const accion = process.argv.includes('--borrar') ? borrar : cargar;
accion()
  .catch((e) => {
    console.error('\nError:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
