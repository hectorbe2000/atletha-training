/**
 * Planillas para abrir en Excel.
 *
 * Es CSV, no .xlsx: Excel lo abre con doble clic igual y no hace falta meter
 * una dependencia para generar un formato binario que nadie va a editar a
 * mano. Dos detalles que hacen que se abra bien y no como una sola columna
 * de texto ilegible:
 *
 *   - BOM UTF-8 al principio, o Excel muestra "MarÃ­a" en vez de "María".
 *   - Separador `;`, porque en configuración regional española la coma es el
 *     separador decimal y Excel espera punto y coma para las columnas.
 */

const BOM = '﻿';

/** Escapa un valor: comillas dobles si trae separador, comillas o saltos. */
function celda(valor) {
  if (valor === null || valor === undefined) return '';

  // Las fechas van como texto YYYY-MM-DD; el resto, tal cual.
  const texto = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor);

  // Un valor que arranca con =, + o @ lo interpreta Excel como fórmula. Con
  // datos cargados por el mostrador es improbable, pero sale gratis cortarlo
  // acá antes que explicar después por qué una celda dice #NAME?.
  //
  // El guion se deja pasar cuando lo sigue un número: "-14 días restantes" es
  // un número negativo, no una fórmula, y con la comilla Excel lo tomaba como
  // texto y no se podía ni ordenar ni sumar la columna.
  const esFormula = /^[=+@]/.test(texto) || /^-(?!\d)/.test(texto);
  const seguro = esFormula ? `'${texto}` : texto;

  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/**
 * Arma el CSV a partir de las columnas y las filas.
 *
 * `columnas` es [{ clave, titulo, formato? }].
 */
export function armarPlanilla(columnas, filas) {
  const lineas = [columnas.map((c) => celda(c.titulo)).join(';')];

  for (const fila of filas) {
    lineas.push(
      columnas
        .map((c) => celda(c.formato ? c.formato(fila[c.clave], fila) : fila[c.clave]))
        .join(';')
    );
  }

  // CRLF: es lo que espera Excel en Windows.
  return BOM + lineas.join('\r\n') + '\r\n';
}

/** Manda la planilla como descarga con el nombre indicado. */
export function responderPlanilla(res, nombre, contenido) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(contenido);
}

/** 'socios-2026-08-13.csv' */
export function nombreConFecha(base) {
  const hoy = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${base}-${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}.csv`;
}
