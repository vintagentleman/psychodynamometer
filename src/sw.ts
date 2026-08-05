/// <reference lib="webworker" />

// Filled in by the sw-manifest plugin in vite.config.ts at build time.
declare const __PRECACHE__: string[];
declare const __POLYFILL__: string;
declare const __VERSION__: string;

// A TS script file cannot redeclare `self`; the webworker lib types it for a generic worker.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `psychodynamometer-${__VERSION__}`;

sw.addEventListener('install', (event) => {
	// `./` and the favicon are unhashed and never appear in the bundle.
	const urls = ['./', 'assets/favicon.svg', ...__PRECACHE__];
	// The worker shares the page's engine, so detecting Temporal here holds for the page.
	if (!('Temporal' in globalThis)) urls.push(__POLYFILL__);
	event.waitUntil(
		caches.open(CACHE).then((cache) =>
			// no-cache: precache the fresh deploy, not the HTTP cache's copy.
			cache.addAll(urls.map((url) => new Request(url, { cache: 'no-cache' }))),
		),
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
			await sw.clients.claim();
		}),
	);
});

// The global caches.match could cross versions mid-update; match only this cache.
async function fromCache(request: Request | string): Promise<Response | undefined> {
	const cache = await caches.open(CACHE);
	// The cache holds one response per URL; Vary-aware matching would only produce false misses.
	return cache.match(request, { ignoreVary: true });
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.mode === 'navigate') {
		// Network-first keeps online visitors on the latest deploy; cache covers offline.
		event.respondWith(
			fetch(request).catch(async () => (await fromCache('./')) ?? Response.error()),
		);
		return;
	}
	event.respondWith(fromCache(request).then((hit) => hit ?? fetch(request)));
});
