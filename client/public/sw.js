/**
 * Service worker del sistema del gimnasio.
 *
 * Objetivo modesto y honesto: que la app abra rápido y no muera si el WiFi
 * del gimnasio parpadea. NO intenta funcionar offline de verdad — los datos
 * (socios, rutinas, pagos) siempre salen de la red, porque mostrar una
 * membresía vencida como vigente sería peor que no mostrar nada.
 *
 * Estrategia por tipo de pedido:
 *   /api/         → solo red. Nunca se cachea.
 *   /assets/      → cache primero. Los nombres llevan hash, así que si
 *                   cambian, cambia la URL.
 *   /media/images → cache primero. Son 1324 JPG de 180px que no cambian.
 *   /media/videos → solo red. Son GIF pesados: llenarían el disco del celular.
 *   navegación    → red primero, y si no hay, el index.html cacheado.
 */

const VERSION = 'v1';
const CACHE_SHELL = `gym-shell-${VERSION}`;
const CACHE_ESTATICO = `gym-estatico-${VERSION}`;
const CACHE_MEDIA = `gym-media-${VERSION}`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((n) => n.startsWith('gym-') && !n.endsWith(VERSION))
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Cache primero: si está guardado se sirve al instante y no se pide nada. */
async function cachePrimero(pedido, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardado = await cache.match(pedido);
  if (guardado) return guardado;

  const respuesta = await fetch(pedido);
  if (respuesta.ok) cache.put(pedido, respuesta.clone());
  return respuesta;
}

/** Red primero, con lo cacheado como red de contención. */
async function redPrimero(pedido, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok) cache.put(pedido, respuesta.clone());
    return respuesta;
  } catch (error) {
    const guardado = await cache.match(pedido);
    if (guardado) return guardado;
    throw error;
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Los datos nunca se cachean: una membresía vencida no puede verse vigente.
  if (url.pathname.startsWith('/api/')) return;

  // Los GIF pesan demasiado para guardarlos en el celular.
  if (url.pathname.startsWith('/media/videos/')) return;

  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(cachePrimero(request, CACHE_ESTATICO));
    return;
  }

  if (url.pathname.startsWith('/media/images/') || url.pathname.startsWith('/uploads/')) {
    evento.respondWith(cachePrimero(request, CACHE_MEDIA));
    return;
  }

  // Navegación: la app abre aunque el servidor no conteste.
  if (request.mode === 'navigate') {
    evento.respondWith(
      redPrimero(request, CACHE_SHELL).catch(() => caches.match('/'))
    );
  }
});
