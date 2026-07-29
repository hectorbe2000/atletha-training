import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query } from '../db.js';
import { noEncontrado, paginacion, ruta, validar } from '../http.js';
import { autenticar, soloAdmin } from '../middleware/auth.js';

export const rutasEjercicios = Router();
rutasEjercicios.use(autenticar);

const IDIOMAS = ['es', 'en', 'it', 'tr', 'ru', 'zh', 'hi', 'pl', 'ko', 'fr'];

/**
 * Opciones para los filtros del catalogo, con la cantidad de ejercicios de
 * cada una — asi la UI puede ocultar o atenuar las que no tienen nada.
 */
rutasEjercicios.get(
  '/filtros',
  ruta(async (_req, res) => {
    const [zonas, equipos, musculos] = await Promise.all([
      varias(
        `SELECT t.valor, t.etiqueta, count(e.id)::int AS cantidad
           FROM terminos t
           LEFT JOIN ejercicios e ON e.body_part = t.valor
          WHERE t.tipo = 'BODY_PART'
          GROUP BY t.valor, t.etiqueta, t.orden
          ORDER BY t.orden`
      ),
      varias(
        `SELECT t.valor, t.etiqueta, count(e.id)::int AS cantidad
           FROM terminos t
           LEFT JOIN ejercicios e ON e.equipo = t.valor
          WHERE t.tipo = 'EQUIPO'
          GROUP BY t.valor, t.etiqueta, t.orden
         HAVING count(e.id) > 0
          ORDER BY t.orden`
      ),
      varias(
        `SELECT t.valor, t.etiqueta, count(e.id)::int AS cantidad
           FROM terminos t
           LEFT JOIN ejercicios e ON e.musculo_objetivo = t.valor
          WHERE t.tipo = 'MUSCULO'
          GROUP BY t.valor, t.etiqueta, t.orden
         HAVING count(e.id) > 0
          ORDER BY t.orden`
      ),
    ]);

    res.json({ zonas, equipos, musculos });
  })
);

const esquemaListado = z.object({
  buscar: z.string().trim().max(80).optional(),
  zona: z.string().trim().max(40).optional(),
  equipo: z.string().trim().max(60).optional(),
  musculo: z.string().trim().max(60).optional(),
  solo_favoritos: z.enum(['true', 'false']).optional(),
  orden: z.enum(['nombre', 'codigo', 'relevancia']).optional(),
});

rutasEjercicios.get(
  '/',
  ruta(async (req, res) => {
    const f = validar(esquemaListado, req.query);
    const { pagina, limite, offset } = paginacion(req.query, 24);
    const socioId = req.usuario.socioId;

    const condiciones = [];
    const params = [];
    const p = (valor) => `$${params.push(valor)}`;

    if (f.zona) condiciones.push(`e.body_part = ${p(f.zona)}`);
    if (f.equipo) condiciones.push(`e.equipo = ${p(f.equipo)}`);
    if (f.musculo) condiciones.push(`(e.musculo_objetivo = ${p(f.musculo)} OR e.grupo_muscular = $${params.length})`);

    if (f.buscar) {
      // Sin tildes ni mayusculas, sobre el nombre (original y traducido) y
      // sobre las etiquetas en espanol: quien escribe "gemelos" o "mancuerna"
      // espera resultados aunque esas palabras no esten en el nombre.
      const t = p(`%${f.buscar}%`);
      const like = (col) => `f_unaccent(lower(coalesce(${col}, ''))) LIKE f_unaccent(lower(${t}))`;
      // Los sinónimos cubren lo que la gente escribe de verdad: "gemelos"
      // en vez de "Pantorrillas", "multipower" en vez de "Máquina Smith".
      const porSinonimo = (alias) =>
        `EXISTS (SELECT 1 FROM unnest(${alias}.sinonimos) AS sin
                  WHERE f_unaccent(lower(sin)) LIKE f_unaccent(lower(${t})))`;

      condiciones.push(
        `(${[
          like('e.nombre'),
          like('e.nombre_es'),
          like('tz.etiqueta'),
          like('te.etiqueta'),
          like('tm.etiqueta'),
          like('tg.etiqueta'),
          porSinonimo('tz'),
          porSinonimo('te'),
          porSinonimo('tm'),
          porSinonimo('tg'),
        ].join(' OR ')})`
      );
    }

    if (f.solo_favoritos === 'true' && socioId) {
      condiciones.push(
        `EXISTS (SELECT 1 FROM favoritos fa WHERE fa.ejercicio_id = e.id AND fa.socio_id = ${p(socioId)})`
      );
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const ordenSql =
      f.orden === 'codigo'
        ? 'e.codigo'
        : 'fn_nombre_ejercicio(e.nombre, e.nombre_es), e.codigo';

    // Solo se agrega el parametro si de verdad se usa: PostgreSQL rechaza
    // el bind si se envian mas valores que marcadores en la consulta.
    const sqlFavorito = socioId
      ? `EXISTS (SELECT 1 FROM favoritos fa WHERE fa.ejercicio_id = e.id AND fa.socio_id = ${p(socioId)})`
      : 'false';
    const paramLimite = p(limite);
    const paramOffset = p(offset);

    const filas = await varias(
      `SELECT
         e.codigo,
         fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre,
         e.nombre        AS nombre_original,
         e.body_part,
         tz.etiqueta     AS zona,
         e.equipo        AS equipo_valor,
         te.etiqueta     AS equipo,
         e.musculo_objetivo AS musculo_valor,
         tm.etiqueta     AS musculo,
         e.imagen,
         e.gif,
         ${sqlFavorito} AS favorito,
         (count(*) OVER ())::int AS total
       FROM ejercicios e
       LEFT JOIN terminos tz ON tz.tipo = 'BODY_PART' AND tz.valor = e.body_part
       LEFT JOIN terminos te ON te.tipo = 'EQUIPO'    AND te.valor = e.equipo
       LEFT JOIN terminos tm ON tm.tipo = 'MUSCULO'   AND tm.valor = e.musculo_objetivo
       LEFT JOIN terminos tg ON tg.tipo = 'MUSCULO'   AND tg.valor = e.grupo_muscular
       ${where}
       ORDER BY ${ordenSql}
       LIMIT ${paramLimite} OFFSET ${paramOffset}`,
      params
    );

    const total = filas[0]?.total ?? 0;
    res.json({
      total,
      pagina,
      limite,
      paginas: Math.ceil(total / limite),
      datos: filas.map(({ total: _t, ...resto }) => resto),
    });
  })
);

rutasEjercicios.get(
  '/:codigo',
  ruta(async (req, res) => {
    const idioma = IDIOMAS.includes(req.query.idioma) ? req.query.idioma : 'es';
    const socioId = req.usuario.socioId;

    const ejercicio = await una(
      `SELECT
         e.id, e.codigo,
         fn_nombre_ejercicio(e.nombre, e.nombre_es) AS nombre,
         e.nombre AS nombre_original,
         e.nombre_es,
         e.body_part, tz.etiqueta AS zona,
         e.equipo   AS equipo_valor, te.etiqueta AS equipo,
         e.musculo_objetivo AS musculo_valor, tm.etiqueta AS musculo,
         e.grupo_muscular   AS grupo_valor,   tg.etiqueta AS grupo_muscular,
         e.musculos_secundarios,
         e.imagen, e.gif, e.atribucion,
         ${socioId ? 'EXISTS (SELECT 1 FROM favoritos fa WHERE fa.ejercicio_id = e.id AND fa.socio_id = $2)' : 'false'} AS favorito
       FROM ejercicios e
       LEFT JOIN terminos tz ON tz.tipo = 'BODY_PART' AND tz.valor = e.body_part
       LEFT JOIN terminos te ON te.tipo = 'EQUIPO'    AND te.valor = e.equipo
       LEFT JOIN terminos tm ON tm.tipo = 'MUSCULO'   AND tm.valor = e.musculo_objetivo
       LEFT JOIN terminos tg ON tg.tipo = 'MUSCULO'   AND tg.valor = e.grupo_muscular
       WHERE e.codigo = $1`,
      socioId ? [req.params.codigo, socioId] : [req.params.codigo]
    );
    if (!ejercicio) throw noEncontrado('Ejercicio');

    const instruccion = await una(
      `SELECT idioma, texto, pasos FROM ejercicio_instrucciones
        WHERE ejercicio_id = $1 AND idioma = $2`,
      [ejercicio.id, idioma]
    );

    // Etiquetas en espanol de los musculos secundarios.
    const secundarios = await varias(
      `SELECT coalesce(t.etiqueta, m.valor) AS etiqueta
         FROM unnest($1::text[]) AS m(valor)
         LEFT JOIN terminos t ON t.tipo = 'MUSCULO' AND t.valor = m.valor`,
      [ejercicio.musculos_secundarios]
    );

    const { id: _id, musculos_secundarios: _ms, ...resto } = ejercicio;
    res.json({
      ...resto,
      musculos_secundarios: secundarios.map((s) => s.etiqueta),
      instrucciones: instruccion ?? { idioma, texto: '', pasos: [] },
    });
  })
);

/** El admin puede corregir/cargar el nombre en espanol. */
rutasEjercicios.patch(
  '/:codigo',
  soloAdmin,
  ruta(async (req, res) => {
    const { nombre_es } = validar(
      z.object({ nombre_es: z.string().trim().max(160).nullable() }),
      req.body
    );
    const actualizado = await una(
      `UPDATE ejercicios SET nombre_es = nullif(btrim($2), '')
        WHERE codigo = $1
        RETURNING codigo, fn_nombre_ejercicio(nombre, nombre_es) AS nombre, nombre_es`,
      [req.params.codigo, nombre_es ?? '']
    );
    if (!actualizado) throw noEncontrado('Ejercicio');
    res.json(actualizado);
  })
);

// --------------------------------------------------------------------
//  Favoritos del socio
// --------------------------------------------------------------------
rutasEjercicios.put(
  '/:codigo/favorito',
  ruta(async (req, res) => {
    const socioId = req.usuario.socioId;
    if (!socioId) throw noEncontrado('Socio');

    const ejercicio = await una('SELECT id FROM ejercicios WHERE codigo = $1', [
      req.params.codigo,
    ]);
    if (!ejercicio) throw noEncontrado('Ejercicio');

    const marcar = req.body?.favorito !== false;
    if (marcar) {
      await query(
        `INSERT INTO favoritos (socio_id, ejercicio_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [socioId, ejercicio.id]
      );
    } else {
      await query('DELETE FROM favoritos WHERE socio_id = $1 AND ejercicio_id = $2', [
        socioId,
        ejercicio.id,
      ]);
    }
    res.json({ codigo: req.params.codigo, favorito: marcar });
  })
);
