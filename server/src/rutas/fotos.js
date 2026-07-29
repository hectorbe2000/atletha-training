import { existsSync, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

import { Router } from 'express';
import multer from 'multer';

import { RAIZ_PROYECTO } from '../config.js';
import { una, query } from '../db.js';
import { ErrorHttp, noEncontrado, ruta } from '../http.js';
import { autenticar, soloAdmin } from '../middleware/auth.js';

export const CARPETA_FOTOS = path.join(RAIZ_PROYECTO, 'uploads', 'socios');
mkdirSync(CARPETA_FOTOS, { recursive: true });

const TIPOS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/**
 * El navegador ya redimensiona la foto a 512px antes de subirla, así que acá
 * el límite es solo una red de contención: si algo manda el original de un
 * celular, se rechaza en vez de llenar el disco.
 */
const subida = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CARPETA_FOTOS),
    filename: (req, file, cb) => {
      const ext = TIPOS[file.mimetype] ?? '.jpg';
      // El sufijo temporal evita que el navegador muestre la foto vieja
      // cacheada cuando se reemplaza.
      cb(null, `socio-${req.params.id}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS[file.mimetype]) {
      // cb(null, false) descarta el archivo pero deja que multer termine de
      // leer el cuerpo. Con cb(error) se responde antes de consumir el
      // stream y el navegador recibe una conexión cortada en vez del 400.
      req.tipoInvalido = file.mimetype;
      return cb(null, false);
    }
    cb(null, true);
  },
});

export const rutasFotos = Router();

// OJO: nada de `rutasFotos.use(autenticar, soloAdmin)`.
// Este router se monta en /api/socios junto con rutasSocios, y un middleware
// a nivel de router corre para TODA petición que empiece con ese prefijo,
// coincida o no con alguna de sus rutas. Con soloAdmin ahí arriba, un socio
// no podía ni ver su propia ficha. Los guardias van ruta por ruta.
const guardias = [autenticar, soloAdmin];

/** Borra el archivo anterior para no dejar huérfanos acumulándose. */
async function borrarArchivo(rutaRelativa) {
  if (!rutaRelativa) return;
  const nombre = path.basename(rutaRelativa);
  const completa = path.join(CARPETA_FOTOS, nombre);
  if (existsSync(completa)) await unlink(completa).catch(() => {});
}

rutasFotos.post(
  '/:id/foto',
  ...guardias,
  (req, res, next) =>
    subida.single('foto')(req, res, (error) => {
      if (!error) return next();
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorHttp(400, 'La foto no puede pesar más de 3 MB.'));
      }
      next(error);
    }),
  ruta(async (req, res) => {
    if (req.tipoInvalido) {
      throw new ErrorHttp(
        400,
        `La foto tiene que ser JPG, PNG o WebP (llegó ${req.tipoInvalido}).`
      );
    }
    if (!req.file) throw new ErrorHttp(400, 'No llegó ninguna foto.');

    const socio = await una('SELECT id, foto_url FROM socios WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!socio) {
      await borrarArchivo(req.file.filename);
      throw noEncontrado('Socio');
    }

    const anterior = socio.foto_url;
    const url = `/uploads/socios/${req.file.filename}`;
    await query('UPDATE socios SET foto_url = $2 WHERE id = $1', [socio.id, url]);
    await borrarArchivo(anterior);

    res.status(201).json({ foto_url: url });
  })
);

rutasFotos.delete(
  '/:id/foto',
  ...guardias,
  ruta(async (req, res) => {
    const socio = await una('SELECT id, foto_url FROM socios WHERE id = $1', [
      Number(req.params.id),
    ]);
    if (!socio) throw noEncontrado('Socio');

    await query('UPDATE socios SET foto_url = NULL WHERE id = $1', [socio.id]);
    await borrarArchivo(socio.foto_url);

    res.json({ ok: true });
  })
);
