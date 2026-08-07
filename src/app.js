import { createApp, ref, computed, watch, onMounted, onBeforeUnmount } from 'https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.esm-browser.prod.js';
import AppHeader from './components/AppHeader.js';
import StoreBanner from './components/StoreBanner.js';
import SearchAndTabs from './components/SearchAndTabs.js';
import ProductGrid from './components/ProductGrid.js';
import Sidebar from './components/Sidebar.js';
import Footer from './components/Footer.js';
import { sidebarStoreInfo } from './sidebarInfo.js';
import { CATEGORIES } from './categories.js';

createApp({
  components: { AppHeader, StoreBanner, SearchAndTabs, ProductGrid, Sidebar, Footer },

  setup() {
    const loading = ref(true);
    const searchQuery = ref('');
    const activeCategory = ref('TODAS');
    const menuOpen = ref(false);
    const isExternalCategoryLoading = ref(false);
    let pendingExternalCategoryScroll = false;

    // Controla se o logo deve aparecer fixado na nav
    const logoSticky = ref(false);

    // ── Store data ──────────────────────────────────────────────
    // Replace these values with your real data source (API, Supabase, etc.)
    const store = ref({
      name: 'JOVIC',
      category: 'Moda Masculina',
      bio: '⚡Presença, conforto e qualidade. 🚚 Enviamos para todo o Brasil. Garanta já sua peça! ',
      minOrder: 0,
      instagramUrl: 'https://www.instagram.com/use_jovic/',
      whatsappNumber: sidebarStoreInfo.whatsappNumber,
      bannerUrl: './src/assets/images/profile/banner.png?v=1',
      logoUrl: './src/assets/images/profile/photo.webp',
      paymentLogos: [],
      hours: sidebarStoreInfo.hours,
      address: sidebarStoreInfo.address,
    });

    const categories = ref([...CATEGORIES]);

    const cartCount = ref(0);
    const cartTotal = ref(0);
    const currentTime = ref(new Date());
    let statusInterval = null;

    const storeIsOpen = computed(() => {
      const now = currentTime.value;
      const day = now.getDay();
      const hours = now.getHours();
      const minutes = now.getMinutes();

      const isWeekdayOpen = day >= 1 && day <= 6; // Segunda (1) a Sábado (6)
      if (!isWeekdayOpen) return false;

      const currentMinutes = hours * 60 + minutes;
      const openMinutes = 8 * 60; // 08:00
      const closeMinutes = 17 * 60 + 30; // 17:30

      return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    });

    // Simulate async data load (replace with real fetch)
    onMounted(() => {
      statusInterval = window.setInterval(() => {
        currentTime.value = new Date();
      }, 30000);
      setTimeout(() => {
        loading.value = false;
      }, 1800);

      const params = new URLSearchParams(window.location.search);
      const categoryFromUrl = params.get('category') || params.get('search') || params.get('q');

      if (categoryFromUrl) {
        isExternalCategoryLoading.value = true;
        requestAnimationFrame(() => {
          applyCategorySelection(decodeURIComponent(categoryFromUrl), { scrollAfterSearch: true });
        });
      }
    });

    onBeforeUnmount(() => {
      if (statusInterval !== null) {
        window.clearInterval(statusInterval);
        statusInterval = null;
      }
    });

    function scrollToSearchBar() {
      const headerHeight = 70;
      const searchEl = document.querySelector('.search-tabs-wrap');
      if (!searchEl) return;

      const top = searchEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    }

    function applyCategorySelection(cat, options = {}) {
      const normalizedCategory = String(cat || '').trim();
      const isAllCategory = normalizedCategory.toUpperCase() === 'TODAS';

      activeCategory.value = isAllCategory ? 'TODAS' : normalizedCategory;
      searchQuery.value = isAllCategory ? '' : normalizedCategory;

      if (options.scrollAfterSearch) {
        pendingExternalCategoryScroll = true;
        return;
      }

      requestAnimationFrame(() => scrollToSearchBar());
    }

    function onCategoryChange(cat) {
      applyCategorySelection(cat);
    }

    function clearSearch() {
      searchQuery.value = '';
    }

    function onSearch() {
      if (searchQuery.value && searchQuery.value !== activeCategory.value) {
        activeCategory.value = '';
      }
    }

    watch(searchQuery, (value) => {
      if (value && value !== activeCategory.value) {
        activeCategory.value = '';
      }

      if (pendingExternalCategoryScroll) {
        pendingExternalCategoryScroll = false;
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            scrollToSearchBar();
            window.setTimeout(() => {
              isExternalCategoryLoading.value = false;
            }, 2000);
          }, 250);
        });
      }
    });

    function toggleMenu() {
      menuOpen.value = !menuOpen.value;
    }

    function closeSidebar() {
      menuOpen.value = false;
    }

    function onCategorySidebarSelect(cat) {
      applyCategorySelection(cat);
      menuOpen.value = false;
    }

    // Recebe o evento do StoreBanner e atualiza o estado
    function onLogoSticky(val) {
      logoSticky.value = val;
    }

    return {
      loading,
      store,
      categories,
      searchQuery,
      activeCategory,
      cartCount,
      cartTotal,
      logoSticky,
      onCategoryChange,
      menuOpen,
      isExternalCategoryLoading,
      toggleMenu,
      clearSearch,
      onSearch,
      closeSidebar,
      onCategorySidebarSelect,
      onLogoSticky,
      storeIsOpen,
    };
  },

  template: `
    <div class="page">
      <div v-if="isExternalCategoryLoading" class="external-category-loader" aria-live="polite" aria-label="Aplicando pesquisa">
        <div class="external-category-loader__spinner"></div>
      </div>

      <AppHeader 
        :cartCount="cartCount" 
        :cartTotal="cartTotal"
        :storeLogo="store.logoUrl"
        :storeName="store.name"
        :logoSticky="logoSticky"
        @toggle-menu="toggleMenu"
      />
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
        <StoreBanner
          :loading="loading"
          :bannerUrl="store.bannerUrl"
          :logoUrl="store.logoUrl"
          :storeName="store.name"
          :storeCategory="store.category"
          :storeBio="store.bio"
          :isOpen="storeIsOpen"
          :minOrder="store.minOrder"
          :instagramUrl="store.instagramUrl"
          :whatsappNumber="store.whatsappNumber"
          :paymentLogos="store.paymentLogos"
          @logo-sticky="onLogoSticky"
        />
        <SearchAndTabs
          :loading="loading"
          :categories="categories"
          v-model="searchQuery"
          :activeCategory="activeCategory"
          @category-change="onCategoryChange"
          @search="onSearch"
        />
        <ProductGrid
          :loading="loading"
          :searchQuery="searchQuery"
          :activeCategory="activeCategory"
          @clear-search="clearSearch"
        />
      </main>
      <Footer />
    </div>
  `,
}).mount('#app');