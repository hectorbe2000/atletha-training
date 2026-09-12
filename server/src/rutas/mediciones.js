import { Router } from 'express';
import { z } from 'zod';

import { una, varias, query } from '../db.js';
import { ErrorHttp, noEncontrado, ruta, validar } from '../http.js';
import { autenticar, socioAccesible } from '../middleware/auth.js';

export const rutasMediciones = Router();
rutasMediciones.use(autenticar);

/** Resuelve sobre qué socio se opera: el propio, o el pedido si sos admin. */
function socioObjetivo(req) {
  const pedido = req.params.socioId ?? req.query.socio_id ?? req.body?.socio_id;
  if (pedido && pedido !== 'mi') return socioAccesible(req, pedido);
  if (!req.usuario.socioId) {
    throw new ErrorHttp(400, 'Indicá de qué socio son las mediciones.');
  }
  return req.usuario.socioId;
}

const medida = (max) =>
  z.coerce.number().positive().max(max).nullable().optional()
    .or(z.literal('').transform(() => null));

const esquemaMedicion = z.object({
  socio_id: z.coerce.number().int().positive().optional(),
  fecha: z.string().date('Fecha inválida.').optional(),
  peso_kg: medida(500),
  cuello_cm: medida(120),
  pecho_cm: medida(250),
  cintura_cm: medida(250),
  cadera_cm: medida(250),
  brazo_cm: medida(120),
  muslo_cm: medida(150),
  notas: z.string().trim().max(500).optional().or(z.literal('')),
});

// La grasa corporal salió del formulario: el gimnasio no tiene con qué
// medirla y un campo que nadie completa es ruido. La columna sigue en la base
// —tirarla obligaría a rehacer la restricción y la vista, y se perdería lo ya
// cargado— pero la aplicación no la escribe ni la muestra.
const CAMPOS = [
  'peso_kg', 'cuello_cm', 'pecho_cm',
  'cintura_cm', 'cadera_cm', 'brazo_cm', 'muslo_cm',
];

// --------------------------------------------------------------------
//  Historial
// --------------------------------------------------------------------
rutasMediciones.get(
  '/:socioId',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const limite = Math.min(200, Math.max(1, Number.parseInt(req.query.limite, 10) || 60));

    const historial = await varias(
      `SELECT id, fecha, peso_kg, cuello_cm, pecho_cm, cintura_cm,
              cadera_cm, brazo_cm, muslo_cm, notas, altura_cm, imc, categoria_imc,
              variacion_kg, variacion_total_kg
         FROM v_mediciones
        WHERE socio_id = $1
        ORDER BY fecha DESC
        LIMIT $2`,
      [socioId, limite]
    );

    const socio = await una(
      `SELECT s.altura_cm, s.objetivo, u.nombre || ' ' || u.apellido AS nombre_completo
         FROM socios s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = $1`,
      [socioId]
    );
    if (!socio) throw noEncontrado('Socio');

    // El resumen se calcula sobre las filas que sí tienen peso: si la última
    // medición fue solo de cintura, "peso actual" tiene que seguir siendo el
    // último peso conocido, no null.
    const conPeso = historial.filter((m) => m.peso_kg != null);
    const actual = conPeso[0] ?? null;
    const primera = conPeso[conPeso.length - 1] ?? null;

    res.json({
      socio,
      resumen: {
        mediciones: historial.length,
        peso_actual: actual?.peso_kg ?? null,
        peso_inicial: primera?.peso_kg ?? null,
        variacion_total: actual && primera ? Number((actual.peso_kg - primera.peso_kg).toFixed(2)) : null,
        imc: actual?.imc ?? null,
        categoria_imc: actual?.categoria_imc ?? null,
        ultima_fecha: historial[0]?.fecha ?? null,
        desde: primera?.fecha ?? null,
      },
      historial,
    });
  })
);

// --------------------------------------------------------------------
//  Registrar (o corregir la del día)
// --------------------------------------------------------------------
rutasMediciones.post(
  '/:socioId',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const d = validar(esquemaMedicion, req.body);

    const valores = CAMPOS.map((c) => d[c] ?? null);
    if (valores.every((v) => v === null)) {
      throw new ErrorHttp(400, 'Cargá al menos un dato: el peso o alguna medida.');
    }

    const medicion = await una(
      `INSERT INTO mediciones
         (socio_id, fecha, peso_kg, cuello_cm, pecho_cm,
          cintura_cm, cadera_cm, brazo_cm, muslo_cm, notas, registrado_por)
       VALUES ($1, coalesce($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (socio_id, fecha) DO UPDATE SET
         peso_kg    = coalesce(EXCLUDED.peso_kg,    mediciones.peso_kg),
         cuello_cm  = coalesce(EXCLUDED.cuello_cm,  mediciones.cuello_cm),
         pecho_cm   = coalesce(EXCLUDED.pecho_cm,   mediciones.pecho_cm),
         cintura_cm = coalesce(EXCLUDED.cintura_cm, mediciones.cintura_cm),
         cadera_cm  = coalesce(EXCLUDED.cadera_cm,  mediciones.cadera_cm),
         brazo_cm   = coalesce(EXCLUDED.brazo_cm,   mediciones.brazo_cm),
         muslo_cm   = coalesce(EXCLUDED.muslo_cm,   mediciones.muslo_cm),
         notas      = coalesce(EXCLUDED.notas,      mediciones.notas)
       RETURNING id, fecha`,
      [socioId, d.fecha ?? null, ...valores, d.notas || null, req.usuario.id]
    );

    // Se devuelve desde la vista para que traiga IMC y variación ya calculados.
    const completa = await una('SELECT * FROM v_mediciones WHERE id = $1', [medicion.id]);
    res.status(201).json(completa);
  })
);

/** La altura es de la persona, no de la medición: se guarda en el socio. */
rutasMediciones.patch(
  '/:socioId/altura',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const { altura_cm } = validar(
      z.object({ altura_cm: z.coerce.number().int().min(80).max(260) }),
      req.body
    );
    await query('UPDATE socios SET altura_cm = $2 WHERE id = $1', [socioId, altura_cm]);
    res.json({ ok: true, altura_cm });
  })
);

rutasMediciones.delete(
  '/:socioId/:medicionId',
  ruta(async (req, res) => {
    const socioId = socioObjetivo(req);
    const borrada = await una(
      'DELETE FROM mediciones WHERE id = $1 AND socio_id = $2 RETURNING id',
      [Number(req.params.medicionId), socioId]
    );
    if (!borrada) throw noEncontrado('Medición');
    res.json({ ok: true });
  })
);
