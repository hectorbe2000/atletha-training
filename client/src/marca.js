/**
 * Identidad del gimnasio en la app.
 *
 * Vivía dentro de whatsapp.js, cuando el nombre solo se usaba para armar los
 * mensajes. Ahora también está en la barra superior, en el login y en el
 * título de la pestaña, así que tiene su propio lugar.
 *
 * Si cambia el nombre del negocio hay que tocar además:
 *   - `GYM_NOMBRE` en gym/.env          (el que sale en el comprobante en PDF)
 *   - client/index.html                 (título de la pestaña)
 *   - client/public/manifest.webmanifest (nombre de la app instalada)
 *
 * No se leen de un solo lado porque el comprobante lo arma el servidor y el
 * título de la pestaña se resuelve antes de que arranque React.
 */
export const NOMBRE_GIMNASIO = 'Atletha Training';

/** El logo, servido desde client/public/. */
export const LOGO = '/logo.png';

/**
 * Quién desarrolló el sistema.
 *
 * Aparece al pie del login y en el comprobante en PDF —los dos lugares que
 * ve gente de afuera— sin competir con la marca del gimnasio: el sistema es
 * de Atletha, la firma es de quien lo hizo.
 */
export const DESARROLLADOR = 'Minga Software';

/**
 * Foto de fondo del login.
 *
 * Se importa en vez de referenciarla por ruta para que Vite le ponga hash y
 * la deje en /assets/, que es lo que el service worker cachea: así se baja
 * una sola vez y no en cada visita al login.
 */
export { default as FONDO_LOGIN } from './assets/fondo-login.jpg';
