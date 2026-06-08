/* =========================================================
   AVIS - Il Corpo e il Sangue
   service-worker.js — Strategia Cache-First (offline-first)

   Al primo caricamento: mette tutto in cache.
   Dai caricamenti successivi: serve dalla cache (funziona offline).
   ========================================================= */

const CACHE_NAME = 'avis-corpo-sangue-v6-0';

// Elenco di tutti i file da mettere in cache al primo avvio
const FILES_TO_CACHE = [
    './',
    './index.html',
    './css/stile.css',
    './js/app.js',
    './data/data.json',
    './manifest.json',
    './sound/sound-correct.mp3',
    './sound/sound-error.mp3',
    './img/avis-marsciano-logo.png',
    './img/icon-192.png',
    './img/icon-512.png',
    './img/cuore-bg.png',
    './img/circolazione-bg.png',
];

// --- INSTALL: mette in cache tutti i file statici ---
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Pre-caching app shell');
                return Promise.allSettled(
                    FILES_TO_CACHE.map(url => cache.add(url).catch(err => {
                        console.warn('[SW] File non cachato:', url, err);
                    }))
                );
            })
            .then(() => {
                // skipWaiting DOPO che la cache è pronta
                console.log('[SW] Cache pronta — skipWaiting');
                return self.skipWaiting();
            })
    );
});

// --- ACTIVATE: rimuove le vecchie cache ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Removing old cache:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Prende il controllo di tutte le tab aperte immediatamente
    self.clients.claim();
	console.log('[SW] ✅ Versione attiva:', CACHE_NAME);
});

// --- FETCH: strategia Cache-First ---
// 1. Prova a rispondere dalla cache
// 2. Se non c'è, va in rete e aggiorna la cache
self.addEventListener('fetch', event => {
    // Gestisce solo richieste GET
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;   // ✅ Dalla cache (funziona offline)
            }

            // Non in cache: va in rete
            return fetch(event.request).then(networkResponse => {
                // Salva nella cache per la prossima volta
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Fallback generico se né cache né rete sono disponibili
            console.warn('[SW] Fetch failed for:', event.request.url);
        })
    );
});

// Risponde al messaggio SKIP_WAITING inviato dalla pagina
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
