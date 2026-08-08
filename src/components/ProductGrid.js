export default {
    name: 'ProductGrid',
    props: {
        loading: { type: Boolean, default: true },
        searchQuery: { type: String, default: '' },
        activeCategory: { type: String, default: 'TODAS' },
    },
    emits: ['clear-search'],
    data() {
        return {
            products: [],
            featuredProducts: [],
            isLoadingProducts: false,
            error: null,
            supabaseClient: null,
            activeImageIndexByProduct: {},
        };
    },
    computed: {
        filteredProducts() {
            const searchText = this.searchQuery?.trim() || '';

            if (!searchText) {
                return this.featuredProducts;
            }

            return this.products
                .filter(product => {
                    const productText = product?.PRODUTO || '';
                    return this.getSearchScore(searchText, productText, product?.PRODUTO || '');
                });
        },
        searchHeading() {
            if (!this.searchQuery) {
                return 'Produtos em Destaque';
            }
            const upperQuery = this.searchQuery.toUpperCase();
            return upperQuery.length > 25 ? upperQuery.substring(0, 25) + '...' : upperQuery;
        },
    },
    methods: {
        normalizeText(value) {
            if (!value) return '';

            return String(value)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        },
        singularizeToken(token) {
            const normalized = this.normalizeText(token);
            if (!normalized) return '';

            if (normalized.endsWith('oes') && normalized.length > 4) {
                return normalized.slice(0, -2);
            }

            if (normalized.endsWith('es') && normalized.length > 4) {
                return normalized.slice(0, -2);
            }

            if (normalized.endsWith('s') && normalized.length > 3) {
                return normalized.slice(0, -1);
            }

            return normalized;
        },
        getTokenVariants(token) {
            const normalizedToken = this.normalizeText(token);
            if (!normalizedToken) return [];

            const variants = new Set([normalizedToken]);
            const singularized = this.singularizeToken(normalizedToken);

            if (singularized && singularized !== normalizedToken) {
                variants.add(singularized);
            }

            return Array.from(variants);
        },
        isStopword(token) {
            return ['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'para', 'com', 'sem', 'em', 'na', 'no', 'nas', 'nos', 'por', 'um', 'uma', 'uns', 'umas'].includes(token);
        },
        levenshteinDistance(a, b) {
            if (a === b) return 0;
            if (!a.length) return b.length;
            if (!b.length) return a.length;

            const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

            for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
            for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

            for (let i = 1; i <= a.length; i += 1) {
                for (let j = 1; j <= b.length; j += 1) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + cost,
                    );
                }
            }

            return matrix[a.length][b.length];
        },
        getSearchScore(searchText, productText, productName = '') {
            const normalizedQuery = this.normalizeText(searchText);
            if (!normalizedQuery) return false;

            const normalizedProductText = this.normalizeText(productText);
            const normalizedProductName = this.normalizeText(productName);

            if (!normalizedProductText) return false;

            const queryTokens = normalizedQuery
                .split(' ')
                .filter(Boolean)
                .filter(token => token.length > 1 && !this.isStopword(token));

            if (queryTokens.length === 0) {
                return false;
            }

            const productTokens = normalizedProductName.split(' ').filter(Boolean);

            return queryTokens.every(queryToken => {
                const queryVariants = this.getTokenVariants(queryToken);

                return productTokens.some(productToken => {
                    const productVariants = this.getTokenVariants(productToken);
                    return queryVariants.some(variant =>
                        productVariants.some(candidate => candidate === variant)
                    );
                });
            });
        },
        shuffleProducts(products) {
            const shuffled = [...products];

            for (let index = shuffled.length - 1; index > 0; index -= 1) {
                const randomIndex = Math.floor(Math.random() * (index + 1));
                [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
            }

            return shuffled;
        },
        clearSearch() {
            this.$emit('clear-search');
        },
        getProductId(product) {
            const rawId = product?.ID ?? product?.id ?? product?.['ID'] ?? '';

            if (rawId === null || rawId === undefined || rawId === '') {
                return 'produto';
            }

            return String(rawId);
        },
        openProductDetails(product) {
            const id = this.getProductId(product);
            window.location.href = `./details.html?id=${encodeURIComponent(id)}`;
        },
        async initSupabase() {
            try {
                // Import Supabase client from CDN
                const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.5/+esm');

                // ⚠️ CONFIGURE THESE WITH YOUR SUPABASE CREDENTIALS
                const SUPABASE_URL = 'https://hovfcntzthahwszjaxsw.supabase.co';
                const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdmZjbnR6dGhhaHdzempheHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDgxNDUsImV4cCI6MjA5Mzc4NDE0NX0.Pss5O_ykTybPUsuZCCln72Pq5dkTGMQ1G1kXR4HOVyw';

                this.supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

                await this.fetchProducts();
            } catch (err) {
                this.error = 'Erro ao conectar com o banco de dados';
                console.error('Supabase init error:', err);
            }
        },
        async fetchProducts() {
            if (!this.supabaseClient) return;

            this.isLoadingProducts = true;
            try {
                const { data, error } = await this.supabaseClient
                    .from('j-box')  // Nome da sua tabela no Supabase
                    .select('ID, PRODUTO, PREÇO, IMAGE-URL, DESCRIPTION, DESCONTO');

                if (error) {
                    throw error;
                }

                this.products = data || [];
                this.featuredProducts = this.shuffleProducts(this.products);
                this.error = null;
            } catch (err) {
                this.error = 'Erro ao carregar produtos';
                console.error('Fetch products error:', err);
                this.products = [];
            } finally {
                this.isLoadingProducts = false;
            }
        },
        getDiscountPercentage(product) {
            const rawDiscount = product?.DESCONTO ?? 0;
            const discountValue = parseFloat(rawDiscount);
            if (Number.isNaN(discountValue)) return 0;
            return Math.max(0, Math.min(100, discountValue));
        },
        getFinalPrice(product) {
            const initialPrice = parseFloat(product?.PREÇO);
            if (Number.isNaN(initialPrice)) return product?.PREÇO;

            const discountPercent = this.getDiscountPercentage(product);
            if (discountPercent <= 0) return initialPrice;

            return initialPrice * (1 - discountPercent / 100);
        },
        formatPrice(price) {
            // Converte para número e formata como moeda brasileira
            const numPrice = parseFloat(price);
            return isNaN(numPrice) ? price : 'R$ ' + numPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        getProductImages(product) {
            if (!product || !product['IMAGE-URL']) return [];

            return String(product['IMAGE-URL'])
                .split('/@:/')
                .map(url => url.trim())
                .filter(Boolean);
        },
        getProductImageKey(product) {
            return `${product.PRODUTO || 'produto'}-${product['IMAGE-URL'] || ''}`;
        },
        getProductImage(product) {
            const images = this.getProductImages(product);
            if (images.length === 0) {
                return 'https://via.placeholder.com/300x300?text=Imagem+Indisponível';
            }

            const key = this.getProductImageKey(product);
            const activeIndex = this.activeImageIndexByProduct[key] ?? 0;
            return images[Math.min(activeIndex, images.length - 1)] || images[0];
        },
        selectProductImage(product, index) {
            const key = this.getProductImageKey(product);
            this.activeImageIndexByProduct[key] = index;
        },
        addToCart(product) {
            // Implementar lógica de adicionar ao carrinho
            console.log('Produto adicionado:', product);
        },
    },
    mounted() {
        this.initSupabase();
    },
    template: `
        <section class="products-section">
            <div class="products-container">
                <template v-if="searchQuery">
                    <p class="products-title-label">Resultados encontrados para</p>
                </template>
                <h2 :class="['products-title', { 'products-title--badge': searchQuery }]">
                    <template v-if="searchQuery">
                        <span class="products-title__text">{{ searchHeading }}</span>
                        <button
                            type="button"
                            class="products-title__remove"
                            @click.stop="clearSearch"
                            aria-label="Limpar busca"
                        >
                            ×
                        </button>
                    </template>
                    <template v-else>
                        {{ searchHeading }}
                    </template>
                </h2>
                
                <div v-if="isLoadingProducts" class="products-grid">
                    <div
                        v-for="n in 12"
                        :key="n"
                        class="product-card product-skeleton-card"
                    >
                        <div class="product-image-wrapper">
                            <div class="skeleton product-skeleton-image"></div>
                        </div>
                        <div class="product-info">
                            <div class="skeleton product-skeleton-title"></div>
                            <div class="skeleton product-skeleton-desc"></div>
                            <div class="skeleton product-skeleton-desc short"></div>
                            <div class="product-footer">
                                <div class="product-price-block">
                                    <div class="skeleton product-skeleton-price-old"></div>
                                    <div class="skeleton product-skeleton-price"></div>
                                </div>
                                <div class="skeleton product-skeleton-button"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div v-else-if="error" class="error-message">
                    <p>⚠️ {{ error }}</p>
                    <p style="font-size: 12px; margin-top: 8px;">Verifique sua conexão com a internet. </p>
                </div>
                
                <div v-else-if="filteredProducts.length === 0" class="empty-message">
                    <p>Nenhum produto encontrado</p>
                </div>
                
                <div v-else class="products-grid">
                    <div
                        v-for="product in filteredProducts"
                        :key="product.PRODUTO || product['IMAGE-URL']"
                        class="product-card"
                        @click="openProductDetails(product)"
                        @keydown.enter.prevent="openProductDetails(product)"
                        tabindex="0"
                        role="button"
                    >
                        <div class="product-image-wrapper">
                            <img 
                                :src="getProductImage(product)" 
                                :alt="product.PRODUTO"
                                class="product-image"
                                @error="e => e.target.src = 'https://via.placeholder.com/300x300?text=Imagem+Indisponível'"
                            />

                            <div v-if="getProductImages(product).length > 1" class="product-image-thumbnails">
                                <button
                                    v-for="(image, index) in getProductImages(product)"
                                    :key="getProductImageKey(product) + '-' + index"
                                    type="button"
                                    class="product-image-thumb"
                                    :class="{ active: (activeImageIndexByProduct[getProductImageKey(product)] ?? 0) === index }"
                                    @click.stop="selectProductImage(product, index)"
                                >
                                    <img :src="image" :alt="product.PRODUTO + ' ' + (index + 1)" />
                                </button>
                            </div>

                            <button class="add-to-cart-btn" @click.stop="addToCart(product)">
                                <i class="ri-shopping-bag-line"></i>
                            </button>
                        </div>
                        
                        <div class="product-info">
                            <h3 class="product-name">{{ product.PRODUTO }}</h3>
                            <p class="product-description">{{ product.DESCRIPTION }}</p>
                            <div class="product-footer">
                                <div class="product-price-block">
                                    <span v-if="getDiscountPercentage(product) > 0" class="product-price-old">{{ formatPrice(product.PREÇO) }}</span>
                                    <span class="product-price">{{ formatPrice(getFinalPrice(product)) }}</span>
                                </div>
                                <button class="buy-btn" @click.stop="openProductDetails(product)">Detalhes</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `,
};
