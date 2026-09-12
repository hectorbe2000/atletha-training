/**
 * Cliente HTTP de la API. Rutas relativas siempre: en desarrollo las resuelve
 * el proxy de Vite y en producción Express sirve el front y la API juntos,
 * así la misma build funciona en la PC del gym y en el celular del socio.
 */
const CLAVE_TOKEN = 'gym.token';

export const leerToken = () => localStorage.getItem(CLAVE_TOKEN);
export const guardarToken = (t) => localStorage.setItem(CLAVE_TOKEN, t);
export const borrarToken = () => localStorage.removeItem(CLAVE_TOKEN);

export class ErrorApi extends Error {
  constructor(estado, mensaje, detalle) {
    super(mensaje);
    this.estado = estado;
    this.detalle = detalle;
  }
  /** Mensaje por campo, para pintar los errores de validación en el formulario. */
  porCampo() {
    if (!Array.isArray(this.detalle)) return {};
    return Object.fromEntries(this.detalle.map((d) => [d.campo, d.mensaje]));
  }
}

/** Se dispara cuando el token venció, para que la app vuelva al login. */
let alExpirar = () => {};
export const cuandoExpire = (fn) => {
  alExpirar = fn;
};

async function pedir(metodo, ruta, cuerpo, opciones = {}) {
  const token = leerToken();

  const res = await fetch(ruta, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    signal: opciones.signal,
  });

  if (res.status === 401 && !opciones.sinRedirigir) {
    borrarToken();
    alExpirar();
  }

  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (!res.ok) {
    throw new ErrorApi(res.status, datos?.error ?? 'No se pudo completar la operación.', datos?.detalle);
  }
  return datos;
}

/** Arma un query string omitiendo lo vacío. */
export function qs(objeto) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(objeto)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Subida de archivos. No pone content-type a propósito: el navegador tiene
 * que ponerlo él para incluir el boundary del multipart.
 */
async function subirArchivo(ruta, formData) {
  const token = leerToken();
  const res = await fetch(ruta, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (res.status === 401) {
    borrarToken();
    alExpirar();
  }
  const texto = await res.text();
  const datos = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    throw new ErrorApi(res.status, datos?.error ?? 'No se pudo subir el archivo.', datos?.detalle);
  }
  return datos;
}

/**
 * Pide un archivo protegido (el comprobante en PDF, las planillas) y devuelve
 * una URL temporal del navegador.
 *
 * Un `<a href="/api/...">` pelado no sirve: la API exige el header
 * Authorization y el navegador no lo manda por su cuenta.
 */
async function pedirArchivo(ruta) {
  const token = leerToken();
  const res = await fetch(ruta, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  if (res.status === 401) {
    borrarToken();
    alExpirar();
  }
  if (!res.ok) {
    // El error sí viene en JSON aunque lo pedido fuera un PDF.
    const texto = await res.text();
    let datos = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      /* no era JSON */
    }
    throw new ErrorApi(res.status, datos?.error ?? 'No se pudo generar el archivo.');
  }

  const url = URL.createObjectURL(await res.blob());
  // Se libera sola al rato: revocarla enseguida deja en blanco la pestaña
  // que la acaba de abrir.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}

/**
 * Lo baja con un nombre de archivo dado.
 *
 * Se descarga y no se abre en una pestaña: `window.open` después de un
 * `await` ya no cuenta como gesto del usuario y el bloqueador de emergentes
 * lo corta, así que el botón parecía no hacer nada.
 */
export async function bajarArchivo(ruta, nombre) {
  const url = await pedirArchivo(ruta);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const api = {
  subir: subirArchivo,
  get: (ruta, opciones) => pedir('GET', ruta, undefined, opciones),
  post: (ruta, cuerpo, opciones) => pedir('POST', ruta, cuerpo ?? {}, opciones),
  put: (ruta, cuerpo, opciones) => pedir('PUT', ruta, cuerpo ?? {}, opciones),
  patch: (ruta, cuerpo, opciones) => pedir('PATCH', ruta, cuerpo ?? {}, opciones),
  del: (ruta, opciones) => pedir('DELETE', ruta, undefined, opciones),
};

/** Ruta de un archivo de media del dataset ("images/0025-x.jpg"). */
export const media = (ruta) => `/media/${ruta}`;

// ---------------------------------------------------------------------
//  Formato local (Paraguay)
// ---------------------------------------------------------------------
const fmtGs = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export const guaranies = (n) => `Gs. ${fmtGs.format(Number(n ?? 0))}`;
export const numero = (n, dec = 0) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: dec }).format(Number(n ?? 0));

/** 'YYYY-MM-DD' -> '27 jul 2026', sin que la zona horaria corra el día. */
export function fecha(iso, opciones = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  const soloFecha = String(iso).slice(0, 10);
  const [a, m, d] = soloFecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-PY', opciones);
}

export const fechaCorta = (iso) => fecha(iso, { day: '2-digit', month: '2-digit' });

export function fechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
