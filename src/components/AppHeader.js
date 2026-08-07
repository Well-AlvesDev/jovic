export default {
  name: 'AppHeader',
  props: {
    cartCount:   { type: Number,  default: 0 },
    cartTotal:   { type: Number,  default: 0 },
    storeLogo:   { type: String,  default: '' },
    logoSticky:  { type: Boolean, default: false },
    storeName:   { type: String,  default: '' },
  },
  emits: ['toggle-menu'],
  methods: {
    toggleMenu() {
      this.$emit('toggle-menu');
    },
  },
  template: `
    <header class="app-header">
      <div class="header-inner">

        <!-- Menu toggle (esquerda) -->
        <button class="menu-toggle" aria-label="Menu" @click="toggleMenu">
          <i class="ri-menu-line"></i>
          <span class="menu-label">menu</span>
        </button>

        <!-- Centro: logo sticky ou nome da loja -->
        <div class="header-center">
          <transition name="header-logo">
            <div v-if="logoSticky" class="header-logo-wrap" key="logo">
              <img
                v-if="storeLogo"
                :src="storeLogo"
                :alt="storeName"
                class="header-sticky-logo"
              />
              <span v-else class="header-sticky-name">{{ storeName }}</span>
            </div>
          </transition>
        </div>

        <!-- Carrinho (direita) -->
      <img src="./src/assets/images/profile/logo.webp" alt="Cart" class="cart-icon" style="width: 45px;" />

      </div>
    </header>
  `,
};