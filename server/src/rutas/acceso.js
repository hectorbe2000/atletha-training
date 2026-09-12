import { Router } from 'express';
import { z } from 'zod';

import { accesoActivo } from '../acceso/index.js';
import { una, varias } from '../db.js';
import { ErrorHttp, noEncontrado, ruta, validar } from '../http.js';
import { soloAdmin } from '../middleware/auth.js';

export const rutasAcceso = Router();
rutasAcceso.use(soloAdmin);

/** Estado del molinete y los últimos eventos, para la pantalla del mostrador. */
rutasAcceso.get(
  '/estado',
  ruta(async (_req, res) => {
    const servicio = accesoActivo();
    if (!servicio) {
      return res.json({ activo: false, molinete: null, recientes: [] });
    }
    res.json({
      activo: true,
      molinete: servicio.situacion(),
      recientes: servicio.recientes,
    });
  })
);

/**
 * Bitácora de la puerta: todos los intentos, con su motivo.
 *
 * Es lo que responde "¿a qué hora entró?" y "¿por qué no lo dejó pasar?".
 */
rutasAcceso.get(
  '/registros',
  ruta(async (req, res) => {
    const limite = Math.min(200, Math.max(1, Number.parseInt(req.query.limite, 10) || 50));
    const soloRechazos = req.query.rechazos === 'true';

    res.json(
      await varias(
        `SELECT a.id, a.ocurrido_en, a.permitido, a.motivo, a.origen, a.forzado,
                a.biometria_id, a.visitante, a.nota,
                v.socio_id, v.codigo, v.nombre_completo, v.documento, v.estado
           FROM accesos a
           LEFT JOIN v_socios_estado v ON v.socio_id = a.socio_id
          ${soloRechazos ? 'WHERE NOT a.permitido' : ''}
          ORDER BY a.ocurrido_en DESC
          LIMIT $1`,
        [limite]
      )
    );
  })
);

// --------------------------------------------------------------------
//  Huellas de los socios
// --------------------------------------------------------------------

/** Las huellas cargadas de un socio. */
rutasAcceso.get(
  '/biometria/:socioId',
  ruta(async (req, res) => {
    const socioId = Number.parseInt(req.params.socioId, 10);
    if (!Number.isInteger(socioId) || socioId <= 0) throw noEncontrado('Socio');

    res.json(
      await varias(
        `SELECT id, biometria_id, etiqueta, activa, creado_en
           FROM socio_biometria WHERE socio_id = $1 ORDER BY creado_en`,
        [socioId]
      )
    );
  })
);

const esquemaAlta = z.object({
  socio_id: z.coerce.number().int().positive(),
  // Lo que devuelve el lector. Todavía no se sabe si es número o cadena, así
  // que se acepta texto y se valida solo que no venga vacío ni gigante.
  biometria_id: z.string().trim().min(1, 'Falta el identificador del lector.').max(64),
  etiqueta: z.string().trim().max(40).optional().or(z.literal('')),
});

/**
 * Asocia una huella a un socio.
 *
 * El enrolamiento en sí —tomar el dedo y guardar la plantilla— lo hace el
 * equipo. Acá solo se anota qué identificador quedó asignado a qué socio.
 * Cuando se sepa si el equipo permite disparar el enrolamiento por comando,
 * esto se puede volver un flujo asistido desde la ficha del socio.
 */
rutasAcceso.post(
  '/biometria',
  ruta(async (req, res) => {
    const d = validar(esquemaAlta, req.body);

    const socio = await una('SELECT id FROM socios WHERE id = $1', [d.socio_id]);
    if (!socio) throw noEncontrado('Socio');

    const ocupada = await una(
      `SELECT b.id, u.nombre || ' ' || u.apellido AS de_quien
         FROM socio_biometria b
         JOIN socios s   ON s.id = b.socio_id
         JOIN usuarios u ON u.id = s.usuario_id
        WHERE b.biometria_id = $1`,
      [d.biometria_id]
    );
    if (ocupada) {
      throw new ErrorHttp(
        409,
        `Ese identificador ya está asignado a ${ocupada.de_quien}. ` +
          'Si es un error, quitáselo primero: dos socios con la misma huella harían ' +
          'que la puerta le abra a la persona equivocada.'
      );
    }

    const fila = await una(
      `INSERT INTO socio_biometria (socio_id, biometria_id, etiqueta, registrado_por)
       VALUES ($1, $2, $3, $4)
       RETURNING id, biometria_id, etiqueta, activa, creado_en`,
      [d.socio_id, d.biometria_id, d.etiqueta || null, req.usuario.id]
    );

    res.status(201).json(fila);
  })
);

rutasAcceso.delete(
  '/biometria/:id',
  ruta(async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) throw noEncontrado('Huella');

    const borrada = await una('DELETE FROM socio_biometria WHERE id = $1 RETURNING id', [id]);
    if (!borrada) throw noEncontrado('Huella');
    res.json({ ok: true });
  })
);

// --------------------------------------------------------------------
//  Visitas y días de prueba
// --------------------------------------------------------------------
const esquemaVisita = z.object({
  nombre: z.string().trim().min(2, 'Poné el nombre de quien entra.').max(120),
  tipo: z.enum(['VISITA', 'DIA_DE_PRUEBA']).default('VISITA'),
  nota: z.string().trim().max(200).optional().or(z.literal('')),
});

/**
 * Deja pasar a alguien que no es socio.
 *
 * Una visita o un día de prueba no tienen huella ni membresía, así que el
 * molinete nunca los va a dejar entrar por su cuenta: lo autoriza el
 * administrador desde el mostrador. Queda registrado con nombre, para poder
 * responder después cuántos días de prueba se dieron y cuántos terminaron en
 * una venta.
 */
rutasAcceso.post(
  '/visita',
  ruta(async (req, res) => {
    const d = validar(esquemaVisita, req.body);
    const servicio = accesoActivo();

    // Si hay molinete conectado, se le da la orden; si no, el registro sirve
    // igual: en un gimnasio sin molinete esto es la planilla de visitas.
    let abrio = false;
    let errorPuerta = null;
    if (servicio) {
      try {
        await servicio.molinete.abrir(5000);
        abrio = true;
      } catch (error) {
        errorPuerta = error.message;
      }
    }

    const fila = await una(
      `INSERT INTO accesos (socio_id, permitido, motivo, origen, visitante, nota, registrado_por)
       VALUES (NULL, true, $1, 'MOSTRADOR', $2, $3, $4)
       RETURNING id, ocurrido_en`,
      [d.tipo, d.nombre, d.nota || null, req.usuario.id]
    );

    res.status(201).json({
      ...fila,
      visitante: d.nombre,
      tipo: d.tipo,
      abrio,
      error_puerta: errorPuerta,
    });
  })
);

// --------------------------------------------------------------------
//  Simulación
// --------------------------------------------------------------------

/**
 * Dispara una lectura como si alguien hubiera apoyado el dedo.
 *
 * Solo con el molinete simulado: con el equipo real las lecturas las genera
 * el hardware, y un endpoint que abra la puerta a pedido sería un agujero.
 */
rutasAcceso.post(
  '/simular',
  ruta(async (req, res) => {
    const servicio = accesoActivo();
    if (!servicio) throw new ErrorHttp(409, 'El control de acceso está apagado.');
    if (typeof servicio.molinete.simularHuella !== 'function') {
      throw new ErrorHttp(
        409,
        'Solo se puede simular con el molinete simulado. Con el equipo real la lectura la hace el lector.'
      );
    }

    const { biometria_id } = validar(
      z.object({ biometria_id: z.string().trim().min(1).max(64) }),
      req.body
    );

    // Se espera al evento para poder devolver el resultado en la respuesta,
    // que es lo que hace útil a esto para las pruebas.
    const resultado = await servicio.procesarHuella(biometria_id);
    res.json(resultado);
  })
);
