/**
 * Traduce al español los 1324 nombres de ejercicios y los guarda en
 * ejercicios.nombre_es.
 *
 *   node scripts/traducir-nombres.js            aplica
 *   node scripts/traducir-nombres.js --simular  muestra sin escribir
 *   node scripts/traducir-nombres.js --informe  lista lo que no supo traducir
 *   node scripts/traducir-nombres.js --borrar   vacía todos los nombre_es
 *
 * Es idempotente y NO pisa un nombre corregido a mano desde el panel:
 * solo escribe donde nombre_es está vacío o coincide con lo que este mismo
 * script generó antes. Para forzar el reemplazo total: --rehacer
 */
import { cerrarPool, query, transaccion, varias } from '../src/db.js';
import {
  EQUIPO, EXCEPCIONES, MODIFICADOR, NUCLEO, PALABRA, POSTURA,
} from './diccionario-ejercicios.js';

// --------------------------------------------------------------------
//  Utilidades de coincidencia por frases
// --------------------------------------------------------------------

/** Convierte una tabla en entradas ordenadas de más palabras a menos. */
function porLongitud(tabla) {
  return Object.entries(tabla)
    .map(([clave, valor]) => ({ tokens: clave.split(' '), clave, valor }))
    .sort((a, b) => b.tokens.length - a.tokens.length);
}

const NUCLEOS = porLongitud(NUCLEO);
const EQUIPOS = porLongitud(EQUIPO);
const POSTURAS = porLongitud(POSTURA);
const MODIFICADORES = porLongitud(MODIFICADOR);
const PALABRAS = porLongitud(PALABRA);

/** ¿Los tokens de `frase` empiezan en la posición i de `tokens`? */
function coincideEn(tokens, i, frase) {
  if (i + frase.length > tokens.length) return false;
  for (let k = 0; k < frase.length; k++) {
    if (tokens[i + k] !== frase[k]) return false;
  }
  return true;
}

/**
 * Recorre los tokens de izquierda a derecha extrayendo las frases de la
 * tabla (la más larga gana). Devuelve las traducciones encontradas y los
 * tokens que sobraron.
 */
function extraer(tokens, entradas) {
  const encontrados = [];
  const resto = [];
  let i = 0;

  while (i < tokens.length) {
    const hit = entradas.find((e) => coincideEn(tokens, i, e.tokens));
    if (hit) {
      if (hit.valor) encontrados.push(hit.valor);
      i += hit.tokens.length;
    } else {
      resto.push(tokens[i]);
      i += 1;
    }
  }
  return { encontrados, resto };
}

/**
 * Ubica los movimientos del nombre, de izquierda a derecha y prefiriendo la
 * frase más larga en cada posición.
 *
 * Hay nombres con dos movimientos encadenados ("clean and press",
 * "pullover to press", "squat row"): se conservan los dos, en el orden
 * original, y después se unen con "y".
 */
function ubicarNucleos(tokens) {
  const encontrados = [];
  const usados = new Set();
  let i = 0;

  while (i < tokens.length) {
    const hit = NUCLEOS.find((e) => coincideEn(tokens, i, e.tokens));
    if (hit) {
      encontrados.push(hit.valor);
      for (let k = 0; k < hit.tokens.length; k++) usados.add(i + k);
      i += hit.tokens.length;
    } else {
      i += 1;
    }
  }
  return { valores: encontrados, usados };
}

// --------------------------------------------------------------------
//  Traducción de un nombre
// --------------------------------------------------------------------

// --------------------------------------------------------------------
//  Concordancia de género y número
//
//  Los adjetivos del diccionario se escriben con marcas: "inclinad{o}{s}".
//  Acá se resuelven contra el sustantivo que encabeza el movimiento:
//  "press inclinado" pero "sentadilla inclinada" y "elevaciones inclinadas".
// --------------------------------------------------------------------

/** Femenino por terminación: -a, -ción, -sión, -xión, -z (y sus plurales). */
const FEMENINO = /(?:ci[óo]n|si[óo]n|xi[óo]n|ciones|siones|xiones|a|as|z)$/;

/** Terminan en -s pero son singulares. */
const SINGULAR_CON_S = new Set(['press', 'bíceps', 'tríceps', 'abdominals']);

function concordar(texto, cabeza) {
  if (!cabeza) return texto.replace(/\{o\}/g, 'o').replace(/\{s\}/g, '');
  const c = cabeza.toLowerCase().replace(/[^\wáéíóúñ-]/g, '');
  const femenino = FEMENINO.test(c);
  const plural = c.endsWith('s') && !SINGULAR_CON_S.has(c);
  return texto.replace(/\{o\}/g, femenino ? 'a' : 'o').replace(/\{s\}/g, plural ? 's' : '');
}

/**
 * Limpia preposiciones que quedan pegadas al unir las partes: el "on" de
 * "on exercise ball" sobra porque el equipo ya traduce con su propia
 * preposición ("en pelota de estabilidad"). Se resuelve al final, sobre el
 * texto armado, en vez de descartar palabras antes — así no se pierde
 * ninguna "y" que sí hacía falta.
 */
function limpiarPreposiciones(texto) {
  return texto
    // "con con lastre" -> "con lastre"
    .replace(/\b(en|con|de|sobre|a)\s+\1\b/g, '$1')
    // "en a una pierna" -> "a una pierna": de dos preposiciones seguidas
    // sobra la primera, que se quedo sin complemento.
    .replace(/\b(?:en|con|de|sobre|a)\s+(?=(?:en|con|de|sobre|a)\s)/g, '')
    // preposicion colgando al final
    .replace(/\s+(?:en|con|de|sobre|a)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const desconocidas = new Map();

function anotarDesconocida(palabra, nombre) {
  if (!desconocidas.has(palabra)) desconocidas.set(palabra, { n: 0, ejemplo: nombre });
  desconocidas.get(palabra).n += 1;
}

function limpiarTokens(texto) {
  return texto
    .split(/\s+/)
    .map((t) => t.replace(/^[(,]+|[),.]+$/g, '').trim())
    .filter(Boolean);
}

/**
 * El dataset trae 4 nombres con el símbolo de grado doblemente codificado
 * ("45в°" = U+0432 U+00B0 en vez de U+00B0). Se normaliza antes de traducir.
 */
function normalizarOrigen(texto) {
  return texto.replace(/в°/g, '°');
}

export function traducir(nombreOriginal) {
  let base = normalizarOrigen(nombreOriginal).toLowerCase().trim().replace(/\s+/g, ' ');

  // "v. 2" / "v. 3" -> variante
  let variante = '';
  const mVar = base.match(/\s*v\.\s*(\d+)\s*/);
  if (mVar) {
    variante = `variante ${mVar[1]}`;
    base = base.replace(mVar[0], ' ').trim();
  }

  // Paréntesis: se traducen aparte y quedan al final.
  const parentesis = [];
  base = base
    .replace(/\(([^)]*)\)/g, (_, dentro) => {
      const limpio = dentro.trim();
      if (['male', 'female', 'pov', 'back pov', 'side pov'].includes(limpio)) return ' ';
      parentesis.push(limpio);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  const excepcion =
    EXCEPCIONES[nombreOriginal.toLowerCase().trim()] ?? EXCEPCIONES[base];
  if (excepcion) {
    return { texto: excepcion, completo: true, sinNucleo: false };
  }

  const tokens = limpiarTokens(base);
  if (!tokens.length) return { texto: nombreOriginal, completo: false, sinNucleo: true };

  // 1. Movimientos
  const nucleos = ubicarNucleos(tokens);
  const alrededor = tokens.filter((_, i) => !nucleos.usados.has(i));

  // 2. Equipo, postura y modificadores, en ese orden de prioridad
  const eq = extraer(alrededor, EQUIPOS);
  const po = extraer(eq.resto, POSTURAS);
  const mo = extraer(po.resto, MODIFICADORES);

  // 3. Lo que sobra, palabra por palabra
  const pa = extraer(mo.resto, PALABRAS);
  for (const t of pa.resto) anotarDesconocida(t, nombreOriginal);

  // Con dos movimientos, el "and" del original ya lo aporta el "y" que los
  // une: si no, sale "cargada y press y con barra".
  const sueltas =
    nucleos.valores.length >= 2 ? pa.encontrados.filter((p) => p !== 'y') : pa.encontrados;

  // Dos movimientos encadenados se unen con "y": "cargada y press".
  const movimiento = nucleos.valores.join(' y ');

  // 4. Armado: movimiento + descriptores + modificadores + postura + equipo
  const partes = [
    movimiento || null,
    ...sueltas,
    ...mo.encontrados,
    ...po.encontrados,
    ...eq.encontrados,
    // Lo que no se pudo traducir se conserva tal cual, no se inventa.
    ...pa.resto,
  ].filter(Boolean);

  let texto = limpiarPreposiciones(partes.join(' '));
  texto = concordar(texto, movimiento.split(' ')[0]);

  const extras = [...parentesis.map((p) => traducirParentesis(p)), variante].filter(Boolean);
  if (extras.length) texto += ` (${extras.join(', ')})`;

  texto = texto.charAt(0).toUpperCase() + texto.slice(1);

  return {
    texto,
    completo: pa.resto.length === 0 && nucleos.valores.length > 0,
    sinNucleo: nucleos.valores.length === 0,
  };
}

function traducirParentesis(texto) {
  const tokens = limpiarTokens(texto);
  const eq = extraer(tokens, EQUIPOS);
  const po = extraer(eq.resto, POSTURAS);
  const mo = extraer(po.resto, MODIFICADORES);
  const pa = extraer(mo.resto, PALABRAS);

  return concordar(
    limpiarPreposiciones(
      [...mo.encontrados, ...po.encontrados, ...eq.encontrados, ...pa.encontrados, ...pa.resto]
        .filter(Boolean)
        .join(' ')
    ),
    null
  );
}

// --------------------------------------------------------------------
//  Ejecución
// --------------------------------------------------------------------

const simular = process.argv.includes('--simular');
const soloInforme = process.argv.includes('--informe');
const rehacer = process.argv.includes('--rehacer');

async function borrar() {
  const { rowCount } = await query('UPDATE ejercicios SET nombre_es = NULL');
  console.log(`\n  ${rowCount} nombres en español borrados.\n`);
}

async function main() {
  const ejercicios = await varias(
    'SELECT id, codigo, nombre, nombre_es FROM ejercicios ORDER BY codigo'
  );

  const traducciones = ejercicios.map((e) => ({ ...e, ...traducir(e.nombre) }));

  const completos = traducciones.filter((t) => t.completo).length;
  const sinNucleo = traducciones.filter((t) => t.sinNucleo);
  const parciales = traducciones.filter((t) => !t.completo && !t.sinNucleo);

  console.log(`\n  ${ejercicios.length} nombres procesados`);
  console.log(`    ${completos} traducidos por completo`);
  console.log(`    ${parciales.length} con alguna palabra sin diccionario`);
  console.log(`    ${sinNucleo.length} sin movimiento reconocido`);

  if (soloInforme || simular) {
    console.log('\n  --- Muestra ---');
    for (const t of traducciones.filter((_, i) => i % 97 === 0).slice(0, 14)) {
      console.log(`    ${t.nombre}\n      -> ${t.texto}`);
    }
  }

  if (soloInforme) {
    if (desconocidas.size) {
      console.log(`\n  --- ${desconocidas.size} palabras sin traducción, por frecuencia ---`);
      const ordenadas = [...desconocidas.entries()].sort((a, b) => b[1].n - a[1].n);
      for (const [palabra, info] of ordenadas.slice(0, 60)) {
        console.log(`    ${String(info.n).padStart(3)}x  ${palabra.padEnd(22)} ej: ${info.ejemplo}`);
      }
    }
    if (sinNucleo.length) {
      console.log('\n  --- Sin movimiento reconocido ---');
      for (const t of sinNucleo.slice(0, 40)) console.log(`    ${t.nombre}  ->  ${t.texto}`);
    }
    return;
  }

  if (simular) {
    console.log('\n  (simulación: no se escribió nada)\n');
    return;
  }

  // Escritura. No pisa lo que un admin corrigió a mano: solo actualiza si
  // el valor actual está vacío o es el que generó una corrida anterior.
  let escritos = 0;
  let respetados = 0;

  await transaccion(async (c) => {
    for (const t of traducciones) {
      const generadoAntes = t.nombre_es === null || t.nombre_es === '' ||
        traducir(t.nombre).texto === t.nombre_es;

      if (!rehacer && !generadoAntes) {
        respetados++;
        continue;
      }
      if (t.nombre_es === t.texto) continue;

      await c.query('UPDATE ejercicios SET nombre_es = $2 WHERE id = $1', [t.id, t.texto]);
      escritos++;
    }
  });

  console.log(`\n  ${escritos} nombres actualizados en la base.`);
  if (respetados) {
    console.log(`  ${respetados} respetados por estar corregidos a mano (--rehacer los pisa).`);
  }
  console.log('');
}

const ejecutadoDirecto = process.argv[1]?.endsWith('traducir-nombres.js');
const accion = process.argv.includes('--borrar') ? borrar : main;
if (ejecutadoDirecto) {
  accion()
  .catch((e) => {
    console.error('\nError:', e.message);
    console.error(e.stack);
    process.exitCode = 1;
  })
    .finally(cerrarPool);
}
