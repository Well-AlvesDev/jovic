const CACHE_NAME = 'image-cache-v1';
const CACHE_DURATION = 5 * 60 * 60 * 1000; // 5 horas em ms

self.addEventListener('fetch', (event) => {
    // Apenas interceptar requisições de imagem (ImageKit e outras)
    if (!event.request.url.includes('imagekit') &&
        !event.request.url.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i)) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(event.request).then((response) => {
                // Se tem em cache, verifica se expirou
                if (response) {
                    const cacheTime = response.headers.get('x-cache-time');
                    const now = Date.now();
                    if (cacheTime && (now - parseInt(cacheTime)) < CACHE_DURATION) {
                        return response; // Cache válido
                    }
                }

                // Fazer nova requisição
                return fetch(event.request)
                    .then((response) => {
                        // Validar resposta
                        if (!response || response.status !== 200 ||
                            !response.headers.get('content-type')?.includes('image')) {
                            return response;
                        }

                        // Clonar resposta e adicionar timestamp
                        const responseToCache = response.clone();
                        const headers = new Headers(responseToCache.headers);
                        headers.set('x-cache-time', Date.now().toString());

                        const cachedResponse = new Response(responseToCache.body, {
                            status: responseToCache.status,
                            statusText: responseToCache.statusText,
                            headers: headers
                        });

                        cache.put(event.request, cachedResponse);
                        return response;
                    })
                    .catch(() => {
                        // Se falhar, retornar do cache mesmo que expirado
                        return cache.match(event.request) ||
                            new Response('Imagem não disponível offline', { status: 503 });
                    });
            });
        })
    );
});

// Limpar caches antigos na ativação
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
});
