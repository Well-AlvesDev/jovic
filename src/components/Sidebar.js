import { sidebarStoreInfo } from '../sidebarInfo.js';

export default {
  name: 'Sidebar',
  props: {
    isOpen: { type: Boolean, default: false },
    categories: { type: Array, default: () => [] },
    hours: { type: String, default: sidebarStoreInfo.hours },
    address: { type: String, default: sidebarStoreInfo.address },
    whatsappNumber: { type: String, default: sidebarStoreInfo.whatsappNumber },
  },
  emits: ['close', 'category-select'],
  computed: {
    formattedWhatsappNumber() {
      const digits = (this.whatsappNumber || '').replace(/\D/g, '');
      const match = digits.match(/^(\d{2})(\d{2})(\d{1})(\d{4})(\d{4})$/);
      if (!match) return this.whatsappNumber;
      const [, country, area, first, middle, last] = match;
      return `+${country} (${area})${first} ${middle}-${last}`;
    },
  },
  data() {
    return {
      isProductsOpen: false,
    };
  },
  methods: {
    goToHome() {
      window.location.assign('./index.html');
    },
    toggleProducts() {
      this.isProductsOpen = !this.isProductsOpen;
    },
    selectCategory(category) {
      this.$emit('category-select', category);
      this.$emit('close');
    },
    closeSidebar() {
      this.$emit('close');
      this.isProductsOpen = false;
    },
  },
  template: `
    <div>
      <!-- Overlay -->
      <div 
        v-if="isOpen" 
        class="sidebar-overlay" 
        @click="closeSidebar"
      ></div>

      <!-- Sidebar -->
      <nav :class="['sidebar', { 'sidebar-open': isOpen }]">
        <!-- Close Button -->
        <div class="sidebar-header">
          <button class="close-btn" aria-label="Fechar menu" @click="closeSidebar">
            <i class="ri-close-line"></i>
          </button>
        </div>

        <!-- Menu Items -->
        <div class="sidebar-menu">
          <button class="menu-item-toggle" type="button" @click="goToHome">
            <span>Tela inicial</span>
            <i class="ri-arrow-right-line"></i>
          </button>

          <!-- Produtos (com dropdown) -->
          <div class="menu-item-group">
            <button 
              class="menu-item-toggle"
              @click="toggleProducts"
              :aria-expanded="isProductsOpen"
            >
              <span>Produtos</span>
              <svg
                class="icon-arrow"
                :class="{ 'rotate': isProductsOpen }"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            
            <!-- Dropdown de Categorias -->
            <transition name="dropdown">
              <div v-if="isProductsOpen" class="dropdown-menu">
                <button
                  v-for="category in categories"
                  :key="category"
                  class="dropdown-item"
                  @click="selectCategory(category)"
                >
                  {{ category }}
                </button>
              </div>
            </transition>
          </div>

          <!-- Informações da Loja -->
          <div class="store-info">
            <!-- Funcionamento -->
            <div class="info-section">
              <div class="info-header">
                <i class="ri-time-line"></i>
                <h4>Funcionamento</h4>
              </div>
              <p class="info-text">{{ hours }}</p>
            </div>

            <!-- Endereço -->
            <div class="info-section">
              <div class="info-header">
                <i class="ri-map-pin-line"></i>
                <h4>Localização</h4>
              </div>
              <p class="info-text">{{ address }}</p>
            </div>

            <!-- Contato -->
            <div class="info-section">
              <div class="info-header">
                <i class="ri-whatsapp-line"></i>
                <h4>Contato</h4>
              </div>
              <p class="info-text">{{ formattedWhatsappNumber }}</p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="sidebar-footer">
     <img src="./src/assets/images/profile/logo.webp" alt="sVLO Logo" style="width: 30px;" />
          <p style=" cursor: pointer;">USE JOVIC</p> 
        </div>
        
      </nav>
    </div>
  `,
};
