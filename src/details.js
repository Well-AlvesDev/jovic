import {
  createApp,
  ref,
  computed,
  onMounted,
} from 'https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.esm-browser.prod.js';

import AppHeader from './components/AppHeader.js';
import Sidebar from './components/Sidebar.js';
import Breadcrumb from './components/breadcrumb.js';
import ProductGallery from './components/productgallery.js';
import ProductInfo from './components/productinfo.js';
import PaymentModal from './components/PaymentModal.js';
import { sidebarStoreInfo } from './sidebarInfo.js';
import { CATEGORIES } from './categories.js';

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://hovfcntzthahwszjaxsw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdmZjbnR6dGhhaHdzempheHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDgxNDUsImV4cCI6MjA5Mzc4NDE0NX0.Pss5O_ykTybPUsuZCCln72Pq5dkTGMQ1G1kXR4HOVyw';
const TABLE = 'j-box';

// ── Store config (mesmo do app.js principal) ──────────────────────────────────
const STORE_CONFIG = {
  name: 'JUVELE',
  category: 'Moda Feminina',
  bio: 'Moda feminina com estilo, conforto e personalidade para cada ocasião.',
  isOpen: true,
  instagramUrl: 'https://instagram.com/gringo_store',
  whatsappNumber: sidebarStoreInfo.whatsappNumber,
  logoUrl: './src/assets/images/profile/photo.webp',
  hours: sidebarStoreInfo.hours,
  address: sidebarStoreInfo.address,
};


// ── Helper: parse imagens do produto (mesmo padrão do ProductGrid) ────────────
function parseImages(imageUrl) {
  if (!imageUrl) return [];
  return String(imageUrl)
    .split('/@:/')
    .map(u => u.trim())
    .filter(Boolean);
}

// ── App ───────────────────────────────────────────────────────────────────────
createApp({
  components: { AppHeader, Sidebar, Breadcrumb, ProductGallery, ProductInfo, PaymentModal },

  setup() {
    // ── Estado global da página ───────────────────────────────
    const loading = ref(true);
    const product = ref(null);
    const error = ref(null);
    const menuOpen = ref(false);
    const cartCount = ref(0);
    const quantity = ref(1);
    const maxQuantity = ref(null);
    const selectedSize = ref('');
    const selectedShipping = ref(null);
    const shippingCep = ref('');
    const showPaymentModal = ref(false);
    const debugMode = ref(false);

    // ── Computed: imagens do produto ──────────────────────────
    const images = computed(() => parseImages(product.value?.['IMAGE-URL']));

    // ── Computed: breadcrumb dinâmico ─────────────────────────
    const breadcrumbItems = computed(() => {
      const base = [
        { label: 'Início', href: './index.html' },
        { label: 'Produtos', href: './index.html#produtos' },
      ];
      if (product.value?.PRODUTO) {
        base.push({ label: product.value.PRODUTO, href: null });
      } else {
        base.push({ label: 'Detalhes do Produto', href: null });
      }
      return base;
    });

    // ── Supabase: busca produto pelo ID da URL ────────────────
    async function fetchProduct() {
      loading.value = true;
      error.value = null;

      // Lê o ID da querystring: details.html?id=123
      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');

      if (!id) {
        error.value = 'ID do produto não informado.';
        loading.value = false;
        return;
      }

      try {
        const { createClient } = await import(
          'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.5/+esm'
        );
        const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

        const { data, error: sbError } = await supabase
          .from(TABLE)
          .select('ID, PRODUTO, PREÇO, "IMAGE-URL", DESCRIPTION, DESCONTO, PARCELAMENTO, product_model')
          .eq('ID', id)
          .single();

        if (sbError) throw sbError;

        product.value = data;
      } catch (err) {
        console.error('Erro ao buscar produto:', err);
        error.value = 'Não foi possível carregar o produto. Tente novamente.';
      } finally {
        loading.value = false;
      }
    }

    // ── Ações do carrinho ─────────────────────────────────────
    function increaseQty() {
      if (maxQuantity.value !== null && quantity.value >= maxQuantity.value) return;
      quantity.value++;
    }
    function decreaseQty() {
      if (quantity.value > 1) quantity.value--;
    }

    function addToCart() {
      // Temporariamente desativado: não adiciona itens à sacola.
      console.log('Adicionar à sacola desativado para este momento.');
    }

    function buyNow(sizeOverride = null) {
      if (!product.value) {
        alert('Produto não encontrado.');
        return;
      }

      const activeShipping =
        (sizeOverride && typeof sizeOverride === 'object' && sizeOverride.shipping)
          ? sizeOverride.shipping
          : selectedShipping.value;

      const activeSize =
        (typeof sizeOverride === 'string' && sizeOverride.trim())
          ? sizeOverride
          : (sizeOverride && typeof sizeOverride === 'object' && sizeOverride.selectedSize)
            ? sizeOverride.selectedSize
            : selectedSize.value;

      if (!activeSize) {
        alert('Selecione um tamanho antes de continuar com o pagamento.');
        return;
      }

      if (!activeShipping || !activeShipping.service) {
        alert('Informe e calcule o CEP e selecione PAC ou SEDEX antes de continuar com o pagamento.');
        return;
      }

      if (sizeOverride && typeof sizeOverride === 'object' && sizeOverride.cep) {
        shippingCep.value = sizeOverride.cep;
      }

      selectedSize.value = activeSize;
      selectedShipping.value = activeShipping;
      showPaymentModal.value = true;
    }

    function closeModal() {
      showPaymentModal.value = false;
      debugMode.value = false;
    }

    function onPaymentConfirm(paymentData) {
      console.log('Checkout PIX processado:', paymentData);
    }

    function onDebugPayment() {
      // Simula um pagamento PIX concluído para testes
      if (!product.value) {
        alert('Carregue um produto primeiro.');
        return;
      }
      debugMode.value = true;
      showPaymentModal.value = true;
    }

    function onSizeSelected(sizeInfo) {
      if (!sizeInfo || typeof sizeInfo.quantity !== 'number') {
        maxQuantity.value = null;
        selectedSize.value = '';
        return;
      }

      selectedSize.value = sizeInfo.label || '';
      maxQuantity.value = sizeInfo.quantity;
      if (maxQuantity.value === 0) {
        quantity.value = 1;
      } else if (quantity.value > maxQuantity.value) {
        quantity.value = maxQuantity.value;
      }
    }

    // ── Menu / sidebar ────────────────────────────────────────
    function toggleMenu() { menuOpen.value = !menuOpen.value; }
    function closeSidebar() { menuOpen.value = false; }

    function onCategorySidebarSelect(category) {
      closeSidebar();
      window.location.assign(`./index.html?category=${encodeURIComponent(category)}`);
    }

    onMounted(fetchProduct);

    return {
      loading,
      product,
      error,
      images,
      breadcrumbItems,
      quantity,
      selectedSize,
      selectedShipping,
      shippingCep,
      menuOpen,
      cartCount,
      store: STORE_CONFIG,
      categories: CATEGORIES,
      increaseQty,
      decreaseQty,
      addToCart,
      buyNow,
      showPaymentModal,
      closeModal,
      onPaymentConfirm,
      toggleMenu,
      closeSidebar,
      onCategorySidebarSelect,
      onDebugPayment,
      debugMode,
    };
  },

  template: `
    <div class="page">

      <!-- Header (reutilizado) -->
      <AppHeader
        :cartCount="cartCount"
        :storeLogo="store.logoUrl"
        :storeName="store.name"
        :logoSticky="true"
        @toggle-menu="toggleMenu"
        @debug-payment="onDebugPayment"
      />

      <!-- Sidebar (reutilizado) -->
      <Sidebar
        :isOpen="menuOpen"
        :categories="categories"
        :hours="store.hours"
        :address="store.address"
        :whatsappNumber="store.whatsappNumber"
        @close="closeSidebar"
        @category-select="onCategorySidebarSelect"
      />

      <main class="main">

        <!-- Breadcrumb -->
        <div class="details-wrapper">
          <Breadcrumb :items="breadcrumbItems" />
        </div>

        <!-- Erro global -->
        <div v-if="error && !loading" class="details-wrapper">
          <div class="detail-error-state">
            <i class="ri-error-warning-line"></i>
            <p>{{ error }}</p>
            <a href="./index.html" class="detail-btn detail-btn--primary">
              <i class="ri-arrow-left-line"></i> Voltar à loja
            </a>
          </div>
        </div>

        <!-- Conteúdo principal -->
        <div v-else class="details-wrapper">
          <div class="details-grid">

            <!-- Galeria de imagens -->
            <ProductGallery
              :images="images"
              :loading="loading"
              :productName="product ? product.PRODUTO : ''"
            />

            <!-- Informações + ações -->
            <ProductInfo
              :loading="loading"
              :product="product"
              :quantity="quantity"
              @increase-qty="increaseQty"
              @decrease-qty="decreaseQty"
              @size-selected="onSizeSelected"
              @add-to-cart="addToCart"
              @buy-now="buyNow"
            />

          </div>
        </div>

      </main>
      <PaymentModal
        :show="showPaymentModal"
        :product="product"
        :quantity="quantity"
        :selectedSize="selectedSize"
        :selectedShipping="selectedShipping"
        :shippingCep="shippingCep"
        :debugMode="debugMode"
        @close="closeModal"
        @confirm="onPaymentConfirm"
      />
    </div>
  `,
}).mount('#app');