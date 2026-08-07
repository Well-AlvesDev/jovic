import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
} from 'https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.esm-browser.prod.js';

// Altura do header sticky em px — deve coincidir com o valor em header.css
const HEADER_HEIGHT = 70;

// Margem de histerese: o avatar precisa desaparecer este número de px
// abaixo da nav antes de "desgrudar", evitando flicker ao rolar devagar.
const UNPIN_OFFSET = -50;

export default {
  name: 'StoreBanner',

  props: {
    loading: { type: Boolean, default: true },
    bannerUrl: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    storeName: { type: String, default: '' },
    storeCategory: { type: String, default: '' },
    storeBio: { type: String, default: '' },
    isOpen: { type: Boolean, default: true },
    instagramUrl: { type: String, default: '' },
    whatsappNumber: { type: String, default: '' },
    paymentLogos: { type: Array, default: () => [] },
  },

  emits: ['logo-sticky'],

  setup(props, { emit }) {
    const logoLoadError = ref(false);
    const avatarRef = ref(null);   // template ref para o .avatar-wrap
    let observer = null;

    // ── Computed ─────────────────────────────────────────────────
    const whatsappLink = computed(() => {
      const text = encodeURIComponent(`Olá! Vim pelo link da loja ${props.storeName}.`);
      return `https://wa.me/5581993609366?text=${text}`;
    });

    const formattedInstagramUrl = computed(() => {
      if (!props.instagramUrl) return '';
      if (props.instagramUrl.startsWith('http://') || props.instagramUrl.startsWith('https://'))
        return props.instagramUrl;
      return 'https://' + props.instagramUrl;
    });

    const formattedLogoUrl = computed(() => {
      if (!props.logoUrl || logoLoadError.value) return '';
      if (props.logoUrl.startsWith('http://') || props.logoUrl.startsWith('https://'))
        return props.logoUrl;
      if (props.logoUrl.startsWith('./'))
        return props.logoUrl.substring(2);
      return props.logoUrl;
    });

    // ── Sticky logic ──────────────────────────────────────────────
    // Estratégia: IntersectionObserver com rootMargin negativo no topo
    // igual à altura da nav. Quando o avatar-wrap SAI do viewport pelo
    // topo (passou pela nav), emitimos logo-sticky = true.
    // Usamos dois thresholds (0 e 0.5) para a histerese:
    //   • saiu totalmente (ratio=0 acima) → gruda
    //   • metade visível novamente (ratio≥0.5 abaixo) → desgruda
    function setupObserver() {
      if (!avatarRef.value) return;

      observer = new IntersectionObserver(
        ([entry]) => {
          const aboveNav = !entry.isIntersecting &&
            entry.boundingClientRect.top < HEADER_HEIGHT + UNPIN_OFFSET;

          // Quando fica visível com pelo menos metade de altura → desgruda
          const backVisible = entry.isIntersecting &&
            entry.intersectionRatio >= 0.5;

          if (aboveNav) {
            emit('logo-sticky', true);
          } else if (backVisible) {
            emit('logo-sticky', false);
          }
        },
        {
          // rootMargin desloca o topo da área observada para baixo do header
          rootMargin: `-${HEADER_HEIGHT + UNPIN_OFFSET}px 0px 0px 0px`,
          threshold: [0, 0.5],
        },
      );

      observer.observe(avatarRef.value);
    }

    onMounted(() => {
      // Aguarda o loading terminar para o avatar existir no DOM
      if (!props.loading) {
        setupObserver();
      }
    });

    // Se o loading terminar depois do mount, seta o observer
    watch(
      () => props.loading,
      (val) => {
        if (!val) {
          // próximo tick para o DOM do avatar estar pronto
          Promise.resolve().then(setupObserver);
        }
      },
    );

    onBeforeUnmount(() => {
      observer?.disconnect();
    });

    // ── Methods ───────────────────────────────────────────────────
    function openInstagram() {
      if (formattedInstagramUrl.value) {
        window.open(formattedInstagramUrl.value, '_blank');
      }
    }

    function handleLogoError() {
      logoLoadError.value = true;
    }

    return {
      logoLoadError,
      avatarRef,
      whatsappLink,
      formattedInstagramUrl,
      formattedLogoUrl,
      openInstagram,
      handleLogoError,
    };
  },

  template: `
    <section class="store-banner">

      <!-- Banner image -->
      <div class="banner-wrapper">
        <template v-if="loading">
          <div class="skeleton skeleton-banner"></div>
        </template>
        <template v-else>
          <img
            v-if="bannerUrl"
            :src="bannerUrl"
            alt="Banner da loja"
            class="banner-img"
          />
          <div v-else class="banner-placeholder"></div>
        </template>
      </div>

      <!-- Profile + info -->
      <div class="store-profile">

        <!-- Avatar — ref usado pelo IntersectionObserver -->
        <div class="avatar-wrap" ref="avatarRef">
          <template v-if="loading">
            <div class="skeleton skeleton-avatar"></div>
          </template>
          <template v-else>
            <img
              v-if="formattedLogoUrl"
              :src="formattedLogoUrl"
              alt="Logo da loja"
              class="store-avatar"
              @error="handleLogoError"
            />
            <div v-else class="avatar-placeholder">
              <i class="ri-store-2-line"></i>
            </div>
          </template>
        </div>

        <!-- Store meta -->
        <div class="store-meta">
          <template v-if="loading">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-subtitle"></div>
          </template>
          <template v-else>
            <h1 class="store-name">{{ storeName || 'Nome da Loja' }}</h1>
            <p class="store-category">{{ storeCategory || 'Categoria' }}</p>
            <p v-if="storeBio" class="store-bio">{{ storeBio }}</p>
          </template>
        </div>

        <!-- Open badge -->
        <div class="open-badge-wrap">
          <template v-if="loading">
            <div class="skeleton skeleton-badge"></div>
          </template>
          <template v-else>
            <span :class="['store-status', isOpen ? 'store-status--open' : 'store-status--closed']">
              {{ isOpen ? 'Aberto agora' : 'Fechado agora' }}
            </span>
          </template>
        </div>

        <!-- Info pills -->
        <div class="info-pills">
          <template v-if="loading">
            <div class="skeleton skeleton-pill"></div>
            <div class="skeleton skeleton-pill"></div>
          </template>
          <template v-else>
            <button
              @click="openInstagram"
              class="info-pill info-pill--link info-pill--instagram"
              style="border: none; background: none; cursor: pointer;"
            >
              <i class="ri-instagram-line instagram-icon"></i>
              <div class="pill-text">
                <span class="pill-label">Siga-nos</span>
                <span class="pill-value">no Instagram</span>
              </div>
            </button>
            <div class="pill-divider"></div>
            <a :href="whatsappLink" target="_blank" rel="noopener" class="info-pill info-pill--link">
              <i class="ri-whatsapp-line"></i>
              <div class="pill-text">
                <span class="pill-label">Fale conosco</span>
                <span class="pill-value">no WhatsApp</span>
              </div>
            </a>
          </template>
        </div>

      </div>
    </section>
  `,
};