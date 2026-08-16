export default {
  name: 'ProductInfo',
  props: {
    loading: { type: Boolean, default: true },
    product: { type: Object, default: null },
    quantity: { type: Number, default: 1 },
  },
  emits: ['increase-qty', 'decrease-qty', 'add-to-cart', 'buy-now', 'size-selected'],
  computed: {
    selectedShippingOption() {
      return this.shippingOptions.find((option) => option.service === this.selectedShipping) || null;
    },
    parseCurrencyNumber() {
      return (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;

        const sanitized = String(value ?? '')
          .trim()
          .replace(/\s+/g, '')
          .replace(/[^\d,.-]/g, '');

        if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === ',') {
          return Number.NaN;
        }

        if (sanitized.includes(',') && sanitized.includes('.')) {
          const decimalSeparator = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.') ? ',' : '.';
          const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
          return Number.parseFloat(
            sanitized
              .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
              .replace(decimalSeparator, '.')
          );
        }

        if (sanitized.includes(',')) {
          const [integerPart = '', fractionalPart = ''] = sanitized.split(',');
          if (fractionalPart && fractionalPart.length === 3 && /^\d{1,}$/.test(integerPart)) {
            return Number.parseFloat(integerPart + fractionalPart);
          }
          return Number.parseFloat(sanitized.replace(',', '.'));
        }

        if (sanitized.includes('.')) {
          const [integerPart = '', fractionalPart = ''] = sanitized.split('.');
          if (fractionalPart && fractionalPart.length === 3 && /^\d{1,}$/.test(integerPart)) {
            return Number.parseFloat(integerPart + fractionalPart);
          }
          return Number.parseFloat(sanitized);
        }

        return Number.parseFloat(sanitized);
      };
    },
    discountPercentage() {
      const rawDiscount = this.product?.DESCONTO ?? 0;
      const discountValue = Number.parseFloat(String(rawDiscount ?? '0').replace(',', '.'));
      if (Number.isNaN(discountValue)) return 0;
      return Math.max(0, Math.min(100, discountValue));
    },
    hasDiscount() {
      return this.discountPercentage > 0;
    },
    finalPrice() {
      const initialPrice = this.parseCurrencyNumber(this.product?.PREÇO);
      if (Number.isNaN(initialPrice)) return this.product?.PREÇO;
      if (!this.hasDiscount) return initialPrice;
      return initialPrice * (1 - this.discountPercentage / 100);
    },
    formattedPrice() {
      if (!this.product?.PREÇO) return '';
      const n = this.parseCurrencyNumber(this.finalPrice);
      return Number.isNaN(n)
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

        <!-- Frete -->
        <div class="detail-shipping-block">
          <label class="detail-section-label" for="cep-frete">Calcular frete</label>
          <div class="detail-shipping-input-row">
            <input
              id="cep-frete"
              class="detail-shipping-input"
              type="text"
              inputmode="numeric"
              maxlength="9"
              placeholder="Digite seu CEP"
              aria-label="Digite seu CEP"
              v-model="cepInput"
              @input="onCepInput"
              @keyup.enter="calcularFrete"
            />
            <button
              type="button"
              class="detail-shipping-btn"
              @click="calcularFrete"
              :disabled="shippingLoading"
            >
              {{ shippingLoading ? 'Calculando...' : 'Calcular' }}
            </button>
          </div>
          <span v-if="!shippingError && !shippingOptions.length" class="detail-shipping-hint">
            Informe o CEP para consultar o prazo e valor do frete.
          </span>

          <div v-if="shippingError" class="detail-shipping-status detail-shipping-status--error">
            {{ shippingError }}
          </div>

          <div v-if="shippingOptions.length" class="detail-shipping-results">
            <div class="detail-shipping-results-title">Selecione uma opção de entrega</div>
            <button
              v-for="option in shippingOptions"
              :key="option.service"
              type="button"
              class="detail-shipping-option"
              :class="{ 'detail-shipping-option--selected': option.service === selectedShipping }"
              @click="selectShipping(option)"
            >
              <div class="detail-shipping-option-header">
                <div class="detail-shipping-option-main">
                  <strong>{{ option.service }}</strong>
                  <span>{{ formatShippingPrice(option.price) }}</span>
                </div>
                <span
                  class="detail-shipping-toggle"
                  :class="{ 'detail-shipping-toggle--selected': option.service === selectedShipping }"
                  aria-hidden="true"
                ></span>
              </div>
              <div class="detail-shipping-option-meta">
                {{ formatDeliveryEstimate(option.deliveryDays) }}
              </div>
            </button>
          </div>
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
          <button class="detail-btn detail-btn--primary" @click="handleBuyNow">
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
      selectedShipping: '',
      sizeDropdownOpen: false,
      cepInput: '',
      shippingLoading: false,
      shippingError: null,
      shippingOptions: [],
    };
  },
  methods: {
    normalizeShippingOption(option) {
      if (!option || typeof option !== 'object') return null;

      const service = String(option.service || option.name || option.label || '').trim().toUpperCase();
      const code = String(option.code || option.id || '').trim().toUpperCase();
      const price = Number(option.price ?? option.value ?? 0);
      const deadline = Number(option.deadline ?? option.deliveryDays ?? option.days ?? 0);

      const normalizedService = service === 'PAC' || service === 'SEDEX'
        ? service
        : (code === '04014' ? 'PAC' : code === '04510' ? 'SEDEX' : service || code || 'ENTREGA');

      return {
        service: normalizedService,
        code: code || normalizedService,
        price: Number.isFinite(price) ? price : 0,
        deliveryDays: Number.isFinite(deadline) ? deadline : 0,
      };
    },
    handleBuyNow() {
      if (!this.selectedSize) {
        alert('Selecione um tamanho antes de continuar com o pagamento.');
        return;
      }

      const cepDigits = this.cepInput.replace(/\D/g, '');
      if (cepDigits.length !== 8) {
        alert('Informe e calcule seu CEP antes de continuar com o pagamento.');
        return;
      }

      if (!this.shippingOptions.length) {
        alert('Calcule o frete antes de continuar com o pagamento.');
        return;
      }

      if (!this.selectedShipping) {
        alert('Selecione PAC ou SEDEX antes de continuar com o pagamento.');
        return;
      }

      const selectedShipping = this.selectedShippingOption;
      if (!selectedShipping) {
        alert('Selecione uma opção de entrega válida antes de continuar com o pagamento.');
        return;
      }

      this.$emit('buy-now', {
        selectedSize: this.selectedSize,
        shipping: selectedShipping,
        cep: cepDigits,
      });
    },
    onCepInput() {
      // Máscara simples: 00000-000
      let digits = this.cepInput.replace(/\D/g, '').slice(0, 8);
      if (digits.length > 5) {
        digits = `${digits.slice(0, 5)}-${digits.slice(5)}`;
      }
      this.cepInput = digits;
      // Limpa resultados/erros anteriores ao editar o CEP
      this.shippingError = null;
      this.shippingOptions = [];
      this.selectedShipping = '';
    },
    formatShippingPrice(value) {
      const n = Number(value);
      return Number.isFinite(n)
        ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';
    },
    formatDeliveryEstimate(days) {
      if (!days) return 'Prazo a confirmar';
      const n = Number(days);
      if (!Number.isFinite(n)) return 'Prazo a confirmar';
      return n === 1 ? 'Chega em até 1 dia útil' : `Chega em até ${n} dias úteis`;
    },
    async calcularFrete() {
      const cepDigits = this.cepInput.replace(/\D/g, '');

      if (cepDigits.length !== 8) {
        this.shippingError = 'Digite um CEP válido com 8 dígitos.';
        this.shippingOptions = [];
        return;
      }

      const productId = this.product?.ID;
      if (!productId) {
        this.shippingError = 'Produto não carregado. Recarregue a página.';
        return;
      }

      this.shippingLoading = true;
      this.shippingError = null;
      this.shippingOptions = [];

      try {
        const SUPABASE_URL = 'https://hovfcntzthahwszjaxsw.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvdmZjbnR6dGhhaHdzempheHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMDgxNDUsImV4cCI6MjA5Mzc4NDE0NX0.Pss5O_ykTybPUsuZCCln72Pq5dkTGMQ1G1kXR4HOVyw';

        const response = await fetch(`${SUPABASE_URL}/functions/v1/calcular-frete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'apikey': SUPABASE_KEY,
          },
          body: JSON.stringify({
            productId,
            cepDestino: cepDigits,
          }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
          this.shippingError = data.error || 'Não foi possível calcular o frete.';
          return;
        }

        const normalizedOptions = (data.options || []).map((option) => this.normalizeShippingOption(option));
        this.shippingOptions = normalizedOptions.filter(Boolean);
        this.selectedShipping = '';

        if (!this.shippingOptions.length) {
          this.shippingError = 'Nenhuma opção de frete disponível para este CEP.';
        }
      } catch (err) {
        console.error('Erro ao calcular frete:', err);
        this.shippingError = 'Erro de conexão ao calcular o frete. Tente novamente.';
      } finally {
        this.shippingLoading = false;
      }
    },
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
    selectShipping(option) {
      if (!option || !option.service) return;
      this.selectedShipping = option.service;
    },
    onDocumentClick(event) {
      if (!this.$el.contains(event.target)) {
        this.closeSizeDropdown();
      }
    },
  }
};