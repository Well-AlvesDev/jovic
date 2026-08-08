export default {
  name: 'ProductInfo',
  props: {
    loading: { type: Boolean, default: true },
    product: { type: Object, default: null },
    quantity: { type: Number, default: 1 },
  },
  emits: ['increase-qty', 'decrease-qty', 'add-to-cart', 'buy-now'],
  computed: {
    discountPercentage() {
      const rawDiscount = this.product?.DESCONTO ?? 0;
      const discountValue = parseFloat(rawDiscount);
      if (Number.isNaN(discountValue)) return 0;
      return Math.max(0, Math.min(100, discountValue));
    },
    hasDiscount() {
      return this.discountPercentage > 0;
    },
    finalPrice() {
      const initialPrice = parseFloat(this.product?.PREÇO);
      if (Number.isNaN(initialPrice)) return this.product?.PREÇO;
      if (!this.hasDiscount) return initialPrice;
      return initialPrice * (1 - this.discountPercentage / 100);
    },
    formattedPrice() {
      if (!this.product?.PREÇO) return '';
      const n = parseFloat(this.finalPrice);
      return isNaN(n)
        ? this.product.PREÇO
        : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    hasDescription() {
      return this.product?.DESCRIPTION?.trim().length > 0;
    },
    currentUrl() {
      return typeof window !== 'undefined' ? window.location.href : '';
    },
    shareText() {
      return `${this.product?.PRODUTO || 'Produto'} - ${this.currentUrl}`;
    },
    installmentText() {
      const parcelamento = String(this.product?.PARCELAMENTO ?? '');
      const parts = parcelamento.split(',').map((part) => part.trim());
      const installments = parseInt(parts[0] || '', 10);
      const interestFree = parseInt(parts[1] || '', 10);

      if (!Number.isNaN(interestFree) && interestFree > 0) {
        return `Em até ${interestFree}x sem juros`;
      }
      if (!Number.isNaN(installments) && installments > 0) {
        return `Em até ${installments}x no cartão de crédito`;
      }
      return '';
    },
    sizeOptions() {
      const rawModel = String(this.product?.product_model || this.product?.PRODUCT_MODEL || '').trim();
      if (!rawModel) return [];

      return rawModel
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [label = '', qty = '0'] = item.split('*').map((part) => part.trim());
          const quantity = Number.isNaN(Number(qty)) ? 0 : Number(qty);
          return {
            label: label || 'Sem tamanho',
            quantity,
          };
        });
    },
    selectedSizeData() {
      return this.sizeOptions.find((option) => option.label === this.selectedSize) || this.sizeOptions[0] || null;
    },
    selectedSizeAvailable() {
      return this.selectedSizeData?.quantity ?? null;
    },
  },
  watch: {
    product() {
      this.syncSelectedSize();
    },
  },
  mounted() {
    document.addEventListener('click', this.onDocumentClick);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.onDocumentClick);
  },
  template: `
    <div class="product-info-panel">

      <!-- Skeleton state -->
      <template v-if="loading">
        <div class="skeleton skeleton-info-title"></div>
        <div class="skeleton skeleton-info-sub" style="margin-top:10px"></div>
        <div class="skeleton skeleton-info-price" style="margin-top:20px"></div>
        <div class="skeleton skeleton-info-desc" style="margin-top:24px"></div>
        <div class="skeleton skeleton-info-desc" style="margin-top:8px; width:70%"></div>
        <div class="skeleton skeleton-info-btn" style="margin-top:32px"></div>
        <div class="skeleton skeleton-info-btn" style="margin-top:12px"></div>
      </template>

      <!-- Loaded state -->
      <template v-else-if="product">

        <!-- Nome -->
        <h1 class="detail-product-name">{{ product.PRODUTO }}</h1>

        <!-- Categoria (badge) -->
        <div v-if="product?.CATEGORIA" class="detail-category-badge">
          <i class="ri-price-tag-3-line"></i>
          {{ product.CATEGORIA }}
        </div>

        <!-- Preço -->
        <div class="detail-price-block">
          <div class="detail-price-stack">
            <div v-if="hasDiscount" class="detail-price-old-row">
              <span class="detail-price-old">R$ {{ product.PREÇO }}</span>
              <span class="detail-price-note detail-price-off">{{ discountPercentage }}% OFF</span>
            </div>
            <span class="detail-price">{{ formattedPrice }}</span>
            <span v-if="installmentText" class="detail-price-note detail-price-installments">
              {{ installmentText }}
            </span>
            <span class="detail-price-note detail-price-payment">Aceitamos PIX <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="20" height="20" viewBox="0 0 48 48">
<path fill="#4db6ac" d="M11.9,12h-0.68l8.04-8.04c2.62-2.61,6.86-2.61,9.48,0L36.78,12H36.1c-1.6,0-3.11,0.62-4.24,1.76	l-6.8,6.77c-0.59,0.59-1.53,0.59-2.12,0l-6.8-6.77C15.01,12.62,13.5,12,11.9,12z"></path><path fill="#4db6ac" d="M36.1,36h0.68l-8.04,8.04c-2.62,2.61-6.86,2.61-9.48,0L11.22,36h0.68c1.6,0,3.11-0.62,4.24-1.76	l6.8-6.77c0.59-0.59,1.53-0.59,2.12,0l6.8,6.77C32.99,35.38,34.5,36,36.1,36z"></path><path fill="#4db6ac" d="M44.04,28.74L38.78,34H36.1c-1.07,0-2.07-0.42-2.83-1.17l-6.8-6.78c-1.36-1.36-3.58-1.36-4.94,0	l-6.8,6.78C13.97,33.58,12.97,34,11.9,34H9.22l-5.26-5.26c-2.61-2.62-2.61-6.86,0-9.48L9.22,14h2.68c1.07,0,2.07,0.42,2.83,1.17	l6.8,6.78c0.68,0.68,1.58,1.02,2.47,1.02s1.79-0.34,2.47-1.02l6.8-6.78C34.03,14.42,35.03,14,36.1,14h2.68l5.26,5.26	C46.65,21.88,46.65,26.12,44.04,28.74z"></path>
</svg> <br>e Cartão de Crédito/Débito</span>
          </div>
        </div>

        <!-- Descrição -->
        <div v-if="hasDescription" class="detail-description">
          <h2 class="detail-section-label">Descrição</h2>
          <p class="detail-description-text">{{ product.DESCRIPTION }}</p>
        </div>

        <!-- Tamanho -->
        <div v-if="sizeOptions.length" class="detail-size-block">
          <span class="detail-section-label">Tamanho</span>
          <div class="detail-size-dropdown" :class="{ 'detail-size-dropdown--open': sizeDropdownOpen }">
            <button
              type="button"
              class="detail-size-trigger"
              @click.prevent="toggleSizeDropdown"
              :aria-expanded="sizeDropdownOpen.toString()"
              aria-haspopup="listbox"
            >
              <span>{{ selectedSize || 'Selecione um tamanho' }}</span>
              <i class="ri-arrow-down-s-line detail-size-arrow"></i>
            </button>

            <ul v-if="sizeDropdownOpen" class="detail-size-options" role="listbox">
              <li
                v-for="option in sizeOptions"
                :key="option.label"
                class="detail-size-option"
                :class="{
                  'detail-size-option--disabled': option.quantity <= 0,
                  'detail-size-option--selected': option.label === selectedSize,
                }"
                role="option"
                :aria-selected="option.label === selectedSize"
                @click="selectSize(option)"
              >
                <span class="detail-size-option-label">{{ option.label }}</span>
                <span class="detail-size-option-qty">{{ option.quantity }} disponível</span>
              </li>
            </ul>
          </div>
          <span v-if="selectedSizeAvailable === 0" class="detail-size-note">
            Tamanho selecionado sem estoque.
          </span>
        </div>

        <!-- Quantidade -->
        <div class="detail-qty-block">
          <span class="detail-section-label">Quantidade</span>
          <div class="qty-control">
            <button
              class="qty-btn"
              @click="$emit('decrease-qty')"
              :disabled="quantity <= 1"
              aria-label="Diminuir quantidade"
            >
              <i class="ri-subtract-line"></i>
            </button>
            <span class="qty-value">{{ quantity }}</span>
            <button
              class="qty-btn"
              @click="$emit('increase-qty')"
              :disabled="selectedSizeAvailable !== null && quantity >= selectedSizeAvailable"
              aria-label="Aumentar quantidade"
            >
              <i class="ri-add-line"></i>
            </button>
          </div>
        </div>

        <!-- Ações -->
        <div class="detail-actions">
          <button class="detail-btn detail-btn--primary" @click="$emit('buy-now')">
            <i class="ri-zap-line"></i>
            Comprar agora
          </button>
          <button class="detail-btn detail-btn--secondary" @click="$emit('add-to-cart')">
            <i class="ri-shopping-bag-line"></i>
            Adicionar à sacola
          </button>
        </div>

        <!-- Compartilhar -->
        <div class="detail-share">
          <span class="detail-section-label">Compartilhar</span>
          <div class="share-btns">
            <a
              :href="'https://wa.me/?text=' + encodeURIComponent(shareText)"
              target="_blank"
              rel="noopener"
              class="share-btn share-btn--whatsapp"
              aria-label="Compartilhar no WhatsApp"
            >
              <i class="ri-whatsapp-line"></i>
            </a>
            <button
              class="share-btn share-btn--copy"
              @click="copyLink"
              :title="copied ? 'Link copiado!' : 'Copiar link'"
              aria-label="Copiar link"
            >
              <i :class="copied ? 'ri-check-line' : 'ri-link-m'"></i>
            </button>
          </div>
        </div>

      </template>

      <!-- Erro / não encontrado -->
      <template v-else>
        <div class="detail-not-found">
          <i class="ri-error-warning-line"></i>
          <p>Produto não encontrado.</p>
          <a href="./index.html" class="detail-btn detail-btn--primary" style="margin-top:16px;display:inline-flex">
            <i class="ri-arrow-left-line"></i> Voltar à loja
          </a>
        </div>
      </template>

    </div>
  `,
  data() {
    return {
      copied: false,
      selectedSize: null,
      sizeDropdownOpen: false,
    };
  },
  methods: {
    copyLink() {
      if (!this.currentUrl) return;
      navigator.clipboard?.writeText(this.currentUrl).then(() => {
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2000);
      });
    },
    syncSelectedSize() {
      this.selectedSize = null;
    },
    toggleSizeDropdown() {
      this.sizeDropdownOpen = !this.sizeDropdownOpen;
    },
    closeSizeDropdown() {
      this.sizeDropdownOpen = false;
    },
    selectSize(option) {
      if (option.quantity <= 0) return;
      this.selectedSize = option.label;
      this.$emit('size-selected', { label: option.label, quantity: option.quantity });
      this.closeSizeDropdown();
    },
    onDocumentClick(event) {
      if (!this.$el.contains(event.target)) {
        this.closeSizeDropdown();
      }
    },
  }
};