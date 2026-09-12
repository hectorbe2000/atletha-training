import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { detenerAcceso, iniciarAcceso } from './acceso/index.js';
import { config, RAIZ_PROYECTO, verificarMedia } from './config.js';
import { pool } from './db.js';
import { ErrorHttp } from './http.js';
import { autenticar, passwordAlDia } from './middleware/auth.js';
import { rutasAcceso } from './rutas/acceso.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasDashboard } from './rutas/dashboard.js';
import { rutasEjercicios } from './rutas/ejercicios.js';
import { CARPETA_FOTOS, rutasFotos } from './rutas/fotos.js';
import { rutasEntrenamiento } from './rutas/entrenamiento.js';
import { rutasMediciones } from './rutas/mediciones.js';
import { rutasPagos } from './rutas/pagos.js';
import { rutasPlanes } from './rutas/planes.js';
import { rutasPlantillas } from './rutas/plantillas.js';
import { rutasRutinas } from './rutas/rutinas.js';
import { rutasSocios } from './rutas/socios.js';

/**
 * Node 16 arranca el servidor igual, pero sin `fetch` global: el aviso de
 * puerto ocupado deja de funcionar sin decir nada y cualquier script que use
 * fetch revienta. Mejor fallar acá, con un mensaje claro, que degradarse en
 * silencio. (Con nvm el symlink se puede dar vuelta solo tras un reinicio.)
 */
const MAYOR = Number(process.versions.node.split('.')[0]);
if (MAYOR < 18) {
  console.error(
    `\n  Este sistema necesita Node 18 o superior y estás usando ${process.version}.\n` +
      '  Cambiá de versión y volvé a arrancar:\n\n' +
      '      nvm use 20.19.0\n'
  );
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');

// Nada de `trust proxy`: Express escucha directo en la LAN, sin nginx delante.
// Con trust proxy activado, req.ip sale del header X-Forwarded-For y cualquiera
// conectado al WiFi puede mandar uno distinto en cada intento, con lo cual el
// freno a la fuerza bruta del login (rutas/auth.js) no frena nada.
// Si algun dia se pone un proxy real adelante, hay que volver a activarlo.
app.set('trust proxy', false);

app.use(
  helmet({
    // Las imagenes y GIFs se piden desde el frontend, que en LAN corre en
    // otro puerto/host: sin esto el navegador las bloquea.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);
app.use(cors({ origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.entorno === 'production' ? 'combined' : 'dev'));

// --------------------------------------------------------------------
//  Media del dataset (1324 imagenes + 1324 GIFs) servida como estatico
// --------------------------------------------------------------------
const cacheMedia = { maxAge: '30d', immutable: true, fallthrough: false };
app.use('/media/images', express.static(config.media.imagenes, cacheMedia));
app.use('/media/videos', express.static(config.media.videos, cacheMedia));

// Fotos de los socios. Sin cache larga: al reemplazarla el nombre cambia,
// pero si alguien la borra y vuelve a subir conviene que se note enseguida.
app.use('/uploads/socios', express.static(CARPETA_FOTOS, { maxAge: '1h', fallthrough: false }));

// --------------------------------------------------------------------
//  API
// --------------------------------------------------------------------
app.get('/api/salud', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT now() AS hora');
    res.json({ ok: true, base: config.db.database, hora: rows[0].hora });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.use('/api/auth', rutasAuth);

// De acá para abajo todo exige sesión, y exige que el usuario ya haya elegido
// su contraseña. La obligación de cambiarla vivía solo en el frontend, así que
// el token de alguien que todavía usaba la contraseña inicial servía igual
// para pegarle a la API por afuera de la pantalla que se la pedía.
// Va acá y no en cada router para que no quede ninguno afuera por olvido.
app.use('/api', autenticar, passwordAlDia);

app.use('/api/socios', rutasFotos);   // /:id/foto — va antes que rutasSocios
app.use('/api/socios', rutasSocios);
app.use('/api/pagos', rutasPagos);
app.use('/api/planes', rutasPlanes);
app.use('/api/plantillas', rutasPlantillas);
app.use('/api/ejercicios', rutasEjercicios);
app.use('/api/rutinas', rutasRutinas);
app.use('/api/entrenamiento', rutasEntrenamiento);
app.use('/api/mediciones', rutasMediciones);
app.use('/api/dashboard', rutasDashboard);
app.use('/api/acceso', rutasAcceso);

app.use('/api', (_req, _res, next) => next(new ErrorHttp(404, 'Ruta no encontrada.')));

// --------------------------------------------------------------------
//  Frontend compilado (npm run build en client/).
//  Si existe, Express lo sirve y el gimnasio usa un solo puerto: los
//  socios entran a http://<ip-de-la-pc>:4100 desde el celular y listo.
//  Si no existe, se sigue usando el dev server de Vite en :5173.
// --------------------------------------------------------------------
const DIST = path.join(RAIZ_PROYECTO, 'client', 'dist');
if (existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST, { index: false, maxAge: '7d' }));
  // Cualquier ruta que no sea /api ni /media la resuelve el router del front.
  app.get(/^(?!\/(api|media|uploads)\/).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  console.warn(
    '  (client/dist no existe todavía: corré "npm run build" en client/ para servir el front desde acá)'
  );
}

// --------------------------------------------------------------------
//  Manejo central de errores
// --------------------------------------------------------------------
app.use((error, _req, res, _next) => {
  // Violaciones de restricciones de PostgreSQL traducidas a algo legible.
  const porCodigo = {
    '23505': [409, 'Ya existe un registro con ese valor único.'],
    '23503': [409, 'No se puede completar: hay registros relacionados.'],
    '23514': [400, 'Los datos no cumplen una validación de la base.'],
    '23P01': [409, 'El período se superpone con otro ya cargado.'],
  };

  if (error.code && porCodigo[error.code]) {
    const [estado, mensaje] = porCodigo[error.code];
    return res.status(estado).json({ error: mensaje, detalle: error.detail });
  }

  if (error instanceof ErrorHttp) {
    return res.status(error.estado).json({ error: error.message, detalle: error.detalle });
  }

  console.error('[error]', error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// --------------------------------------------------------------------
//  Arranque
// --------------------------------------------------------------------
function direccionesLan() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

/**
 * Windows deja que dos procesos escuchen el mismo puerto sin dar EADDRINUSE:
 * el listen sale bien pero las peticiones caen en el otro servidor. Se avisa
 * antes de arrancar en vez de dejar que el sintoma aparezca despues.
 */
async function avisarSiPuertoOcupado(puerto) {
  try {
    const control = AbortSignal.timeout(1500);
    await fetch(`http://127.0.0.1:${puerto}/`, { signal: control });
    console.warn(
      `\n  ATENCION: ya hay algo respondiendo en el puerto ${puerto}.\n` +
        `  Cambiá PORT en gym/.env o cerrá la otra aplicación, o las peticiones\n` +
        `  van a terminar en el servidor equivocado.\n`
    );
  } catch {
    /* nadie escucha: es lo esperado */
  }
}

verificarMedia();
await avisarSiPuertoOcupado(config.puerto);
await iniciarAcceso();

// Escucha en 0.0.0.0 para que los socios entren desde el celular en la LAN.
const servidor = app.listen(config.puerto, '0.0.0.0', () => {
  console.log(`\n  ${config.gimnasio.nombre} — entorno ${config.entorno}`);
  console.log(`  Base de datos:  ${config.db.database}@${config.db.host}:${config.db.port}`);
  console.log('');
  console.log('  ABRÍ EL SISTEMA EN:');
  console.log(`      En esta PC        http://localhost:${config.puerto}`);
  for (const ip of direccionesLan()) {
    console.log(`      Desde el celular  http://${ip}:${config.puerto}`);
  }
  console.log('');
  console.log(`  (chequeo de la API: http://localhost:${config.puerto}/api/salud — devuelve JSON, no es la app)`);
  console.log('  Para cerrar: Ctrl+C');
  console.log('');
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    console.log('\nCerrando...');
    servidor.close(() => pool.end().then(() => process.exit(0)));
  });
}
