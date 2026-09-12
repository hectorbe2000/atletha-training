/**
 * Comprobante de pago en PDF.
 *
 * NO es una factura legal ni un documento tributario: es el papel que el
 * socio se lleva (o recibe por WhatsApp) diciendo qué pagó, cuánto y por qué
 * período. La leyenda del pie lo aclara para que nadie lo use como factura.
 *
 * Se arma con pdfkit, que es JavaScript puro: no hay que instalar nada
 * nativo en la PC del gimnasio.
 */
import { existsSync } from 'node:fs';

import PDFDocument from 'pdfkit';

import { config } from './config.js';

/** Quién desarrolló el sistema. En el cliente vive en client/src/marca.js. */
const DESARROLLADOR = 'Minga Software';

/** Rojo del logo de Atletha, muestreado del PNG. */
const ACENTO = '#f82820';
const TINTA = '#1a1a1a';
const SUAVE = '#6b6b6b';
const LINEA = '#d8d8d8';

// ---------------------------------------------------------------------
//  Monto en letras
//
//  En Paraguay el comprobante lleva el importe escrito ("Son: Guaraníes
//  ciento cincuenta mil"). Evita que a un 150.000 le agreguen un cero.
// ---------------------------------------------------------------------
const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
  'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

function hasta999(n) {
  if (n < 30) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d];
  }
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const r = n % 100;
  return r ? `${CENTENAS[c]} ${hasta999(r)}` : CENTENAS[c];
}

/** "uno" se apocopa cuando multiplica: veintiún mil, treinta y un millones. */
const comoMultiplicador = (texto) =>
  texto.replace(/veintiuno$/, 'veintiún').replace(/\buno$/, 'un');

export function montoEnLetras(monto) {
  // Los guaraníes no tienen centavos en la práctica.
  const n = Math.round(Number(monto) || 0);
  if (n === 0) return 'cero';

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes = [];

  if (millones === 1) partes.push('un millón');
  else if (millones) partes.push(`${comoMultiplicador(hasta999(millones))} millones`);

  if (miles === 1) partes.push('mil');
  else if (miles) partes.push(`${comoMultiplicador(hasta999(miles))} mil`);

  if (resto) partes.push(hasta999(resto));

  return partes.join(' ');
}

// ---------------------------------------------------------------------
//  Formato
// ---------------------------------------------------------------------
const fmtGs = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const guaranies = (n) => `Gs. ${fmtGs.format(Math.round(Number(n) || 0))}`;

const dosDigitos = (n) => String(n).padStart(2, '0');

/**
 * '13/08/2026', vengan como vengan de la base.
 *
 * `fecha_inicio` y `fecha_fin` son `date` y llegan como 'YYYY-MM-DD' (hay un
 * type parser en db.js que los deja crudos para que la zona horaria no corra
 * el día). Pero `fecha_pago` es `timestamptz` y pg lo devuelve como objeto
 * Date: cortarle 10 caracteres a su texto daba "Thu Aug 13", y de ahí salía
 * el "Fecha: undefined/undefined/Thu Aug 13" del comprobante.
 */
function fechaCorta(valor) {
  if (!valor) return '—';
  if (valor instanceof Date) {
    // En hora local: es la que vio el mostrador al cobrar.
    return `${dosDigitos(valor.getDate())}/${dosDigitos(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }
  const [a, m, d] = String(valor).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** La hora del cobro, para el encabezado. Vacío si no se puede determinar. */
function horaCorta(valor) {
  if (!(valor instanceof Date)) return '';
  return `${dosDigitos(valor.getHours())}:${dosDigitos(valor.getMinutes())}`;
}

const METODOS = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  QR: 'QR',
  OTRO: 'Otro',
};

/** El número que ve el socio: 0000042, a partir del id del pago. */
export const numeroComprobante = (id) => String(id).padStart(7, '0');

// ---------------------------------------------------------------------
//  Armado del PDF
// ---------------------------------------------------------------------

/**
 * Escribe el comprobante en `destino` (un stream: la respuesta HTTP).
 * Devuelve el documento por si hay que esperar a que termine.
 */
export function armarComprobante(destino, pago) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  doc.pipe(destino);

  const izq = doc.page.margins.left;
  const der = doc.page.width - doc.page.margins.right;
  const ancho = der - izq;

  // --- Encabezado: logo + datos del gimnasio -------------------------
  const arriba = doc.y;
  let textoX = izq;

  if (existsSync(config.gimnasio.logo)) {
    doc.image(config.gimnasio.logo, izq, arriba, { fit: [64, 64] });
    textoX = izq + 78;
  }

  doc.font('Helvetica-Bold').fontSize(17).fillColor(TINTA);
  doc.text(config.gimnasio.nombre, textoX, arriba + 6, { width: 260 });

  doc.font('Helvetica').fontSize(9).fillColor(SUAVE);
  // Una debajo de la otra, no en la misma línea: en renglón corrido el
  // teléfono se pega a la dirección y no se distingue dónde termina cada uno.
  // Las líneas vacías no se imprimen: mejor una menos que un dato de relleno.
  for (const linea of [config.gimnasio.direccion, config.gimnasio.telefono].filter(Boolean)) {
    doc.text(linea, textoX, doc.y + 2, { width: 260 });
  }

  // Bloque derecho: qué documento es y su número.
  doc.font('Helvetica-Bold').fontSize(12).fillColor(ACENTO);
  doc.text('COMPROBANTE DE PAGO', izq, arriba + 6, { width: ancho, align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor(TINTA);
  doc.text(`N° ${numeroComprobante(pago.id)}`, izq, doc.y + 2, { width: ancho, align: 'right' });
  doc.fontSize(9).fillColor(SUAVE);
  const hora = horaCorta(pago.fecha_pago);
  doc.text(
    `${fechaCorta(pago.fecha_pago)}${hora ? ` · ${hora}` : ''}`,
    izq,
    doc.y + 1,
    { width: ancho, align: 'right' }
  );

  // --- Franja de color, para que no parezca una carta ----------------
  const yFranja = Math.max(arriba + 74, doc.y + 12);
  doc.rect(izq, yFranja, ancho, 3).fill(ACENTO);

  // --- Datos del socio -----------------------------------------------
  let y = yFranja + 22;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(SUAVE).text('RECIBIMOS DE', izq, y);
  y += 14;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(TINTA).text(pago.socio_nombre, izq, y);
  y += 19;
  doc.font('Helvetica').fontSize(9.5).fillColor(SUAVE);
  doc.text(`Cédula ${pago.documento}   ·   Socio ${pago.socio_codigo}`, izq, y);

  // --- Detalle -------------------------------------------------------
  y += 26;
  doc.rect(izq, y, ancho, 22).fill('#f4f4f5');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(SUAVE);
  doc.text('CONCEPTO', izq + 10, y + 7);
  doc.text('PERÍODO', izq + 250, y + 7);
  doc.text('IMPORTE', izq, y + 7, { width: ancho - 10, align: 'right' });

  y += 22;
  doc.font('Helvetica').fontSize(10.5).fillColor(TINTA);
  const concepto = pago.plan ? `Membresía ${pago.plan}` : 'Pago de membresía';
  doc.text(concepto, izq + 10, y + 9, { width: 230 });
  const periodo = pago.fecha_inicio
    ? `${fechaCorta(pago.fecha_inicio)} al ${fechaCorta(pago.fecha_fin)}`
    : '—';
  doc.fontSize(9.5).fillColor(SUAVE).text(periodo, izq + 250, y + 10, { width: 140 });
  doc.font('Helvetica').fontSize(10.5).fillColor(TINTA);
  doc.text(guaranies(pago.monto), izq, y + 9, { width: ancho - 10, align: 'right' });

  y += 34;
  doc.moveTo(izq, y).lineTo(der, y).lineWidth(0.7).strokeColor(LINEA).stroke();

  // --- Total ---------------------------------------------------------
  y += 14;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA);
  doc.text('TOTAL', izq + 10, y + 5);
  doc.fontSize(17).fillColor(ACENTO);
  doc.text(guaranies(pago.monto), izq, y, { width: ancho - 10, align: 'right' });

  y += 30;
  doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(SUAVE);
  doc.text(`Son: Guaraníes ${montoEnLetras(pago.monto)}.`, izq + 10, y, { width: ancho - 20 });

  // --- Forma de pago -------------------------------------------------
  y = doc.y + 22;
  // La referencia de la transferencia no va: es un dato de conciliación
  // interna del gimnasio, no algo que le sirva al socio en su papel. Sigue
  // guardándose y sale en la planilla de cobros.
  const filas = [
    ['Forma de pago', METODOS[pago.metodo] ?? pago.metodo],
    pago.observacion ? ['Observación', pago.observacion] : null,
    pago.cobrado_por ? ['Atendido por', pago.cobrado_por] : null,
  ].filter(Boolean);

  for (const [etiqueta, valor] of filas) {
    doc.font('Helvetica').fontSize(9).fillColor(SUAVE).text(etiqueta, izq + 10, y, { width: 110 });
    doc.font('Helvetica').fontSize(9.5).fillColor(TINTA).text(String(valor), izq + 130, y, {
      width: ancho - 140,
    });
    y = doc.y + 7;
  }

  // --- Pie -----------------------------------------------------------
  const yPie = doc.page.height - doc.page.margins.bottom - 54;
  doc.moveTo(izq, yPie).lineTo(der, yPie).lineWidth(0.7).strokeColor(LINEA).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(SUAVE);
  doc.text(
    'Este documento es un comprobante interno de pago y no constituye factura legal ' +
      'ni documento tributario.',
    izq,
    yPie + 10,
    { width: ancho, align: 'center' }
  );
  doc.fontSize(8).fillColor('#9a9a9a');
  doc.text(`${config.gimnasio.nombre} · Comprobante N° ${numeroComprobante(pago.id)}`, izq, yPie + 26, {
    width: ancho,
    align: 'center',
  });
  // La firma de quien desarrolló el sistema, al pie y en gris claro: es un
  // comprobante del gimnasio, no un aviso.
  doc.fontSize(7).fillColor('#b4b4b4');
  doc.text(`Sistema desarrollado por ${DESARROLLADOR}`, izq, yPie + 38, {
    width: ancho,
    align: 'center',
  });

  doc.end();
  return doc;
}
