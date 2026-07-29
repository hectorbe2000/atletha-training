/**
 * Carga datos de demostración para recorrer el sistema con contenido real:
 * socios en distintos estados de membresía, pagos, rutinas, entrenamientos
 * registrados y asistencias.
 *
 *   node scripts/datos-demo.js            carga
 *   node scripts/datos-demo.js --borrar   elimina todo lo que cargó
 *
 * Todos los socios de demo tienen cédula que arranca con 88, así que se
 * borran sin tocar los datos reales del gimnasio.
 */
import bcrypt from 'bcryptjs';

import { cerrarPool, transaccion, una, varias, query } from '../src/db.js';

const PREFIJO = '88';

const SOCIOS = [
  { doc: '8800001', nombre: 'Rocío',   apellido: 'Benítez',  sexo: 'F', tel: '0981 111 001', plan: 'Mensual',    desde: -10,  objetivo: 'Hipertrofia' },
  { doc: '8800002', nombre: 'Marcos',  apellido: 'Duarte',   sexo: 'M', tel: '0981 111 002', plan: 'Trimestral', desde: -40,  objetivo: 'Fuerza' },
  { doc: '8800003', nombre: 'Lucía',   apellido: 'Ayala',    sexo: 'F', tel: '0981 111 003', plan: 'Mensual',    desde: -26,  objetivo: 'Bajar de peso' },
  { doc: '8800004', nombre: 'Diego',   apellido: 'Ramírez',  sexo: 'M', tel: '0981 111 004', plan: 'Mensual',    desde: -45,  objetivo: 'Volumen' },
  { doc: '8800005', nombre: 'Sofía',   apellido: 'Cabrera',  sexo: 'F', tel: '0981 111 005', plan: 'Anual',      desde: -120, objetivo: 'Salud general' },
  { doc: '8800006', nombre: 'Javier',  apellido: 'Ortiz',    sexo: 'M', tel: '0981 111 006', plan: 'Semestral',  desde: -70,  objetivo: 'Rendimiento' },
  { doc: '8800007', nombre: 'Camila',  apellido: 'Vera',     sexo: 'F', tel: '0981 111 007', plan: null,         desde: -3,   objetivo: 'Tonificar' },
  { doc: '8800008', nombre: 'Andrés',  apellido: 'Giménez',  sexo: 'M', tel: '0981 111 008', plan: 'Mensual',    desde: -60,  objetivo: 'Hipertrofia' },
];

const RUTINA = {
  nombre: 'Full body 3 días',
  objetivo: 'Hipertrofia',
  descripcion: 'Calentá 10 minutos antes de cada sesión. Dejá 1 día de descanso entre días.',
  dias: [
    {
      etiqueta: 'Día A · Empuje',
      ejercicios: [
        ['0025', 4, '8-10', 90],
        ['0334', 3, '12-15', 60],
        ['1760', 3, '10', 75],
      ],
    },
    {
      etiqueta: 'Día B · Tirón',
      ejercicios: [
        ['0652', 4, 'máx', 90],
        ['0007', 3, '10-12', 60],
        ['0294', 3, '12', 45],
      ],
    },
    {
      etiqueta: 'Día C · Piernas',
      ejercicios: [
        ['0043', 4, '8', 120],
        ['0032', 3, '6-8', 150],
      ],
    },
  ],
};

const dia = (n) => `current_date + ${n}`;
// Pseudoaleatorio con semilla: los datos de demo salen iguales en cada corrida.
let semilla = 20260727;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));

async function borrar() {
  const { rowCount } = await query(`DELETE FROM usuarios WHERE documento LIKE '${PREFIJO}%'`);
  console.log(`\n  ${rowCount} socio(s) de demostración eliminados.\n`);
}

async function cargar() {
  const yaHay = await una(`SELECT count(*)::int AS n FROM usuarios WHERE documento LIKE '${PREFIJO}%'`);
  if (yaHay.n > 0) {
    console.log(`\n  Ya hay ${yaHay.n} socios de demo cargados. Corré con --borrar primero.\n`);
    return;
  }

  const admin = await una("SELECT id FROM usuarios WHERE rol = 'ADMIN' ORDER BY id LIMIT 1");
  if (!admin) {
    console.log('\n  Primero creá un administrador: npm run crear:admin -- --documento <cedula>\n');
    return;
  }

  const planes = Object.fromEntries((await varias('SELECT id, nombre, duracion_dias, precio FROM planes')).map((p) => [p.nombre, p]));
  const hash = await bcrypt.hash('demo1234', 10);

  await transaccion(async (c) => {
    for (const s of SOCIOS) {
      const { rows: [u] } = await c.query(
        `INSERT INTO usuarios (documento, password_hash, rol, nombre, apellido, telefono, debe_cambiar_password)
         VALUES ($1, $2, 'SOCIO', $3, $4, $5, false) RETURNING id`,
        [s.doc, hash, s.nombre, s.apellido, s.tel]
      );
      const { rows: [socio] } = await c.query(
        `INSERT INTO socios (usuario_id, sexo, objetivo, fecha_ingreso)
         VALUES ($1, $2, $3, ${dia(s.desde)}) RETURNING id, codigo`,
        [u.id, s.sexo, s.objetivo]
      );
      s.socioId = socio.id;

      if (s.plan) {
        const plan = planes[s.plan];
        const inicio = s.desde;
        const fin = inicio + plan.duracion_dias - 1;
        const { rows: [mem] } = await c.query(
          `INSERT INTO membresias (socio_id, plan_id, fecha_inicio, fecha_fin, precio, registrado_por, estado)
           VALUES ($1, $2, ${dia(inicio)}, ${dia(fin)}, $3, $4,
                   CASE WHEN ${dia(fin)} < current_date THEN 'VENCIDA'::estado_membresia ELSE 'VIGENTE'::estado_membresia END)
           RETURNING id`,
          [socio.id, plan.id, plan.precio, admin.id]
        );
        await c.query(
          `INSERT INTO pagos (socio_id, membresia_id, monto, metodo, fecha_pago, registrado_por)
           VALUES ($1, $2, $3, $4, ${dia(inicio)}, $5)`,
          [socio.id, mem.id, plan.precio, azar() > 0.6 ? 'TRANSFERENCIA' : 'EFECTIVO', admin.id]
        );
      }
    }

    // --- Rutina para los tres primeros socios ---------------------------
    const conRutina = SOCIOS.slice(0, 3);
    for (const s of conRutina) {
      const { rows: [r] } = await c.query(
        `INSERT INTO rutinas (socio_id, nombre, descripcion, objetivo, dias_por_semana, fecha_inicio, creado_por)
         VALUES ($1, $2, $3, $4, $5, ${dia(Math.max(s.desde, -60))}, $6) RETURNING id`,
        [s.socioId, RUTINA.nombre, RUTINA.descripcion, RUTINA.objetivo, RUTINA.dias.length, admin.id]
      );
      s.dias = [];

      for (const [i, d] of RUTINA.dias.entries()) {
        const { rows: [fd] } = await c.query(
          'INSERT INTO rutina_dias (rutina_id, orden, etiqueta) VALUES ($1, $2, $3) RETURNING id',
          [r.id, i + 1, d.etiqueta]
        );
        s.dias.push({ id: fd.id, ejercicios: d.ejercicios });

        for (const [j, [codigo, series, reps, pausa]] of d.ejercicios.entries()) {
          await c.query(
            `INSERT INTO rutina_ejercicios (rutina_dia_id, ejercicio_id, orden, series, repeticiones, descanso_seg)
             VALUES ($1, (SELECT id FROM ejercicios WHERE codigo = $2), $3, $4, $5, $6)`,
            [fd.id, codigo, j + 1, series, reps, pausa]
          );
        }
      }
    }

    // --- Entrenamientos de las últimas 10 semanas ------------------------
    // El peso sube de a poco para que los gráficos de progreso muestren algo.
    for (const s of conRutina) {
      let sesion = 0;
      for (let sem = 9; sem >= 0; sem--) {
        for (const [n, d] of s.dias.entries()) {
          const diasAtras = sem * 7 + n * 2;
          if (diasAtras > Math.abs(s.desde)) continue;
          sesion++;

          const { rows: [ses] } = await c.query(
            `INSERT INTO sesiones (socio_id, rutina_dia_id, fecha, inicio, fin, finalizada)
             VALUES ($1, $2, ${dia(-diasAtras)}, now() - ($3 || ' days')::interval,
                     now() - ($3 || ' days')::interval + interval '55 minutes', true)
             RETURNING id`,
            [s.socioId, d.id, diasAtras]
          );

          for (const [codigo, series] of d.ejercicios) {
            const base = 20 + (codigo.charCodeAt(3) % 5) * 5;
            for (let k = 1; k <= series; k++) {
              const progreso = (9 - sem) * 1.25; // sube ~1,25 kg por semana
              await c.query(
                `INSERT INTO series_registradas (sesion_id, ejercicio_id, numero_serie, repeticiones, peso, rpe)
                 VALUES ($1, (SELECT id FROM ejercicios WHERE codigo = $2), $3, $4, $5, $6)`,
                [ses.id, codigo, k, entre(8, 12), Math.round((base + progreso + k * 2.5) * 2) / 2, entre(6, 9)]
              );
            }
          }

          await c.query(
            `INSERT INTO asistencias (socio_id, fecha, hora_entrada, registrado_por)
             VALUES ($1, ${dia(-diasAtras)}, now() - ($2 || ' days')::interval, $3)
             ON CONFLICT DO NOTHING`,
            [s.socioId, diasAtras, admin.id]
          );
        }
      }
      console.log(`  ${s.nombre} ${s.apellido}: rutina + ${sesion} entrenamientos`);
    }

    // Asistencias sueltas del resto, para el gráfico del panel.
    for (const s of SOCIOS.slice(3)) {
      for (let k = 0; k < 14; k++) {
        if (azar() > 0.45) continue;
        await c.query(
          `INSERT INTO asistencias (socio_id, fecha, registrado_por)
           VALUES ($1, ${dia(-k)}, $2) ON CONFLICT DO NOTHING`,
          [s.socioId, admin.id]
        );
      }
    }
  });

  const estados = await varias(`
    SELECT estado, count(*)::int AS n FROM v_socios_estado
     WHERE documento LIKE '${PREFIJO}%' GROUP BY estado ORDER BY estado
  `);

  console.log('\n  Socios de demostración cargados:');
  for (const e of estados) console.log(`    ${e.estado.padEnd(14)} ${e.n}`);
  console.log('\n  Todos entran con su cédula y la contraseña: demo1234');
  console.log('  Por ejemplo: 8800001 / demo1234\n');
}

const accion = process.argv.includes('--borrar') ? borrar : cargar;
accion()
  .catch((e) => {
    console.error('\nError:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
