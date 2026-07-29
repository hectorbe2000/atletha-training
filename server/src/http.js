/** Utilidades compartidas por las rutas. */

/** Error con codigo HTTP, para lanzar desde cualquier capa. */
export class ErrorHttp extends Error {
  constructor(estado, mensaje, detalle) {
    super(mensaje);
    this.estado = estado;
    this.detalle = detalle;
  }
}

export const noEncontrado = (que = 'Recurso') => new ErrorHttp(404, `${que} no encontrado.`);
export const invalido = (mensaje, detalle) => new ErrorHttp(400, mensaje, detalle);
export const prohibido = (mensaje = 'No tenés permiso para esta operación.') =>
  new ErrorHttp(403, mensaje);

/** Envuelve un handler async para que los rechazos lleguen al middleware de errores. */
export const ruta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valida body/query con un esquema zod y devuelve el resultado tipado. */
export function validar(esquema, datos) {
  const r = esquema.safeParse(datos);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => ({
      campo: i.path.join('.') || '(raíz)',
      mensaje: i.message,
    }));
    throw new ErrorHttp(400, 'Datos inválidos.', detalle);
  }
  return r.data;
}

/** Normaliza pagina/limite de la query string. */
export function paginacion(query, limitePorDefecto = 24, limiteMaximo = 100) {
  const pagina = Math.max(1, Number.parseInt(query.pagina, 10) || 1);
  const limite = Math.min(
    limiteMaximo,
    Math.max(1, Number.parseInt(query.limite, 10) || limitePorDefecto)
  );
  return { pagina, limite, offset: (pagina - 1) * limite };
}
