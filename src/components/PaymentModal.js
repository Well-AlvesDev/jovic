import { SUPABASE_CONFIG } from '../config.js';

export function truncateProductName(value, maxLength = 30) {
  const text = String(value ?? '').trim();
  if (!text) return 'Item';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function normalizeViaCepAddress(address = {}) {
  const street = String(address.logradouro ?? '').trim();
  const neighborhood = String(address.bairro ?? '').trim();
  const complementParts = [address.complemento, address.complemento2]
    .filter((value) => String(value ?? '').trim())
    .map((value) => String(value).trim());

  return {
    street,
    neighborhood,
    complement: complementParts.join(' '),
  };
}

export function calculateProductTotal(product = {}, quantity = 1) {
  const parseCurrencyNumber = (value) => {
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

  const price = parseCurrencyNumber(product?.PREÇO) || 0;
  const discount = Number.parseFloat(String(product?.DESCONTO ?? '0').replace(',', '.')) || 0;
  const finalPrice = price * (1 - discount / 100);
  return Number(((finalPrice * (Number(quantity) || 1))).toFixed(2));
}

export function calculateFinalTotal(product = {}, quantity = 1, selectedShipping = null) {
  const subtotal = calculateProductTotal(product, quantity);
  const shipping = Number(selectedShipping?.price ?? 0);
  return Number((subtotal + shipping).toFixed(2));
}

export default {
  name: 'PaymentModal',
  props: {
    show: { type: Boolean, default: false },
    product: { type: Object, default: null },
    quantity: { type: Number, default: 1 },
    selectedSize: { type: String, default: '' },
    selectedShipping: { type: Object, default: null },
    shippingCep: { type: String, default: '' },
  },
  emits: ['close', 'confirm'],
  data() {
    return {
      method: 'pix',
      isSubmitting: false,
      isLoadingAddress: false,
      loadingMessage: 'Validando dados do pedido...',
      pixQrCode: '',
      pixTicketUrl: '',
      pixCode: '',
      copySuccess: false,
      paymentResult: null,
      paymentStatus: 'idle',
      paymentStatusTimer: null,
      pendingCheckoutData: null,
      pixForm: {
        fullName: '',
        cpf: '',
        email: '',
        phone: '',
        cep: '',
        street: '',
        neighborhood: '',
        number: '',
        complement: '',
      },
      card: {
        number: '',
        name: '',
        expiry: '',
        cvv: '',
      },
    };
  },
  computed: {
    productLabel() {
      return truncateProductName(this.product?.PRODUTO, 30);
    },
    selectedSizeLabel() {
      return this.selectedSize || 'Não informado';
    },
    selectedShippingLabel() {
      if (!this.selectedShipping) return 'Não informado';
      const price = Number(this.selectedShipping.price ?? 0);
      return `${this.selectedShipping.service || 'Entrega'}${Number.isFinite(price) && price > 0 ? ` • ${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}`;
    },
    shippingPriceLabel() {
      if (!this.selectedShipping) return '';
      const price = Number(this.selectedShipping.price ?? 0);
      if (!Number.isFinite(price) || price <= 0) return 'Frete: grátis';
      return `Frete: ${price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
    },
    totalAmount() {
      return calculateProductTotal(this.product, this.quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    finalAmount() {
      return calculateFinalTotal(this.product, this.quantity, this.selectedShipping).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    },
    cardValid() {
      return (this.card.number.replace(/\s+/g, '').length >= 13) && this.card.name && this.card.expiry && (this.card.cvv.length >= 3);
    },
    pixButtonLabel() {
      if (this.isSubmitting) return 'Gerando QR Code...';
      return 'Confirmar';
    },
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.card = { number: '', name: '', expiry: '', cvv: '' };
        this.pixQrCode = '';
        this.pixTicketUrl = '';
        this.pixCode = '';
        this.copySuccess = false;
        this.paymentResult = null;
        this.pendingCheckoutData = null;
        this.paymentStatus = 'idle';
        this.clearPaymentStatusPolling();
        this.isSubmitting = false;
        this.isLoadingAddress = false;
        this.loadingMessage = 'Validando dados do pedido...';
        this.pixForm.cep = this.formatCep(this.shippingCep || '');
        this.loadAddressFromCep();
      }
    },
    'pixForm.cep': function (newValue) {
      if (!newValue || String(newValue).replace(/\D/g, '').length !== 8) {
        return;
      }
      this.loadAddressFromCep();
    }
  },
  methods: {
    close() {
      if (this.isSubmitting) return;
      this.clearPaymentStatusPolling();
      this.$emit('close');
    },
    clearPaymentStatusPolling() {
      if (this.paymentStatusTimer) {
        clearInterval(this.paymentStatusTimer);
        this.paymentStatusTimer = null;
      }
    },
    async checkPaymentStatus(paymentId) {
      if (!paymentId) return;

      try {
        const response = await fetch(`${SUPABASE_CONFIG.pixCheckoutUrl}?paymentId=${encodeURIComponent(paymentId)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_CONFIG.anonKey,
          },
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (!data?.ok || !data?.paymentId) {
          return;
        }

        this.paymentResult = { ...this.paymentResult, ...data, status: data.status || this.paymentResult?.status || 'pending' };
        this.paymentStatus = data.status || this.paymentStatus || 'pending';

        if (this.paymentStatus === 'approved') {
          this.clearPaymentStatusPolling();
          this.isSubmitting = false;
          this.loadingMessage = 'Pagamento concluído';
        }
      } catch (error) {
        console.error('Erro ao consultar status do pagamento PIX:', error);
      }
    },
    startPaymentStatusPolling(paymentId) {
      this.clearPaymentStatusPolling();
      if (!paymentId) return;

      this.checkPaymentStatus(paymentId);
      this.paymentStatusTimer = setInterval(() => {
        this.checkPaymentStatus(paymentId);
      }, 5000);
    },
    selectMethod(m) {
      if (this.isSubmitting) return;
      this.method = m;
    },
    copyPix() {
      const textToCopy = this.pixCode || this.pixTicketUrl || this.pixQrCode;
      if (!textToCopy) return;
      navigator.clipboard?.writeText(textToCopy).then(() => {
        this.copySuccess = true;
        setTimeout(() => {
          this.copySuccess = false;
        }, 900);
      }).catch(() => { });
    },
    sanitizeCpf(value) {
      return String(value || '').replace(/\D/g, '');
    },
    formatCpf(value = '') {
      const digits = String(value).replace(/\D/g, '').slice(0, 11);
      const formatted = digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

      return formatted;
    },
    formatCep(value = '') {
      const digits = String(value).replace(/\D/g, '').slice(0, 8);
      return digits.replace(/(\d{5})(\d)/, '$1-$2');
    },
    async loadAddressFromCep() {
      const cepDigits = String(this.pixForm.cep || '').replace(/\D/g, '');
      if (cepDigits.length !== 8) {
        this.isLoadingAddress = false;
        return;
      }

      this.isLoadingAddress = true;
      this.pixForm.cep = this.formatCep(this.pixForm.cep || '');

      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json();

        if (data?.erro) {
          this.isLoadingAddress = false;
          return;
        }

        const normalized = normalizeViaCepAddress(data);

        if (normalized.street) {
          this.pixForm.street = normalized.street;
        }
        if (normalized.neighborhood) {
          this.pixForm.neighborhood = normalized.neighborhood;
        }
        if (normalized.complement) {
          this.pixForm.complement = normalized.complement;
        }
      } catch (error) {
        console.error('Erro ao consultar ViaCEP:', error);
      } finally {
        this.isLoadingAddress = false;
      }
    },
    validatePixForm() {
      const f = this.pixForm;
      const onlyDigits = (s = '') => String(s).replace(/\D/g, '');
      if (!f.fullName.trim()) { alert('Informe o nome completo.'); return false; }
      const cpfDigits = onlyDigits(f.cpf);
      if (cpfDigits.length !== 11) { alert('CPF inválido (11 dígitos).'); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) { alert('E-mail inválido.'); return false; }
      const phoneDigits = onlyDigits(f.phone);
      if (phoneDigits.length < 8) { alert('Telefone inválido.'); return false; }
      const cepDigits = onlyDigits(f.cep);
      if (cepDigits.length !== 8) { alert('CEP inválido (8 dígitos).'); return false; }
      if (!f.street.trim()) { alert('Informe a Rua/Avenida.'); return false; }
      if (!f.neighborhood.trim()) { alert('Informe o Bairro.'); return false; }
      if (!f.number.trim()) { alert('Informe o número do endereço.'); return false; }
      return true;
    },
    async confirm() {
      if (this.method === 'pix') {
        if (!this.validatePixForm()) return;
        if (!this.product?.ID) {
          alert('Produto indisponível para pagamento.');
          return;
        }
        if (!this.selectedSize) {
          alert('Selecione um tamanho antes de confirmar o Pix.');
          return;
        }
        if (!this.selectedShipping || !this.selectedShipping.service) {
          alert('Selecione PAC ou SEDEX antes de confirmar o Pix.');
          return;
        }
        if (!this.shippingCep || String(this.shippingCep).replace(/\D/g, '').length !== 8) {
          alert('Informe e calcule o CEP antes de confirmar o Pix.');
          return;
        }

        this.isSubmitting = true;
        this.loadingMessage = 'Validando estoque e gerando QR Code...';

        const payload = {
          id: Number(this.product.ID),
          productId: Number(this.product.ID),
          quantity: Number(this.quantity || 1),
          size: String(this.selectedSize),
          customer: {
            ...this.pixForm,
            cpf: this.sanitizeCpf(this.pixForm.cpf),
            phone: String(this.pixForm.phone || '').replace(/\D/g, ''),
            cep: String(this.pixForm.cep || '').replace(/\D/g, ''),
            number: String(this.pixForm.number || '').trim(),
          },
        };

        this.pendingCheckoutData = JSON.parse(JSON.stringify(payload));

        try {
          const response = await fetch(SUPABASE_CONFIG.pixCheckoutUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_CONFIG.anonKey,
            },
            body: JSON.stringify(payload),
          });

          let data = null;
          const responseText = await response.text();

          if (responseText) {
            try {
              data = JSON.parse(responseText);
            } catch (error) {
              data = { error: responseText };
            }
          }

          if (!response.ok || data?.ok === false) {
            throw new Error(data?.error || `Não foi possível gerar o QR Code do Pix. Status ${response.status}.`);
          }

          this.paymentResult = data;
          this.paymentStatus = data?.status || 'pending';
          this.pixQrCode = data.qrCodeBase64 ? `data:image/png;base64,${data.qrCodeBase64}` : (data.qrCode || '');
          this.pixTicketUrl = data.ticketUrl || '';
          this.pixCode = data.qrCode || data.ticketUrl || 'PIX gerado com sucesso';
          this.isSubmitting = false;
          this.loadingMessage = this.paymentStatus === 'approved' ? 'Pagamento concluído' : 'Pagamento PIX pronto';

          if (data?.paymentId) {
            this.startPaymentStatusPolling(data.paymentId);
          }

          this.$emit('confirm', { method: 'pix', customer: { ...this.pixForm }, product: this.product, quantity: this.quantity, size: this.selectedSize, payment: data, formSnapshot: this.pendingCheckoutData });
          return;
        } catch (error) {
          alert(error.message || 'Erro ao gerar o Pix.');
          this.isSubmitting = false;
          this.loadingMessage = 'Falha na validação';
          return;
        }
      }

      if ((this.method === 'credit' || this.method === 'debit') && this.cardValid) {
        this.$emit('confirm', { method: this.method, card: { ...this.card }, product: this.product, quantity: this.quantity, size: this.selectedSize });
        return;
      }
      alert('Preencha os dados de pagamento corretamente.');
    },
    formatCardNumber() {
      this.card.number = this.card.number.replace(/[^0-9]/g, '').replace(/(.{4})/g, '$1 ').trim();
    }
  },
  template: `
    <div v-if="show" class="payment-modal-overlay" @click.self="close">
      <div class="payment-modal">
        <header class="payment-modal-header">
          <h3>Pagamento</h3>
          <button class="pm-close" @click.prevent="close"><i class="ri-close-line"></i></button>
        </header>

        <div class="payment-modal-body">
          <div class="pm-fixed-area">
            <div class="pm-product">
              <div class="pm-product-info">
                <strong class="pm-product-name">{{ productLabel }}</strong>
                <span class="pm-product-qty">Tamanho: {{ selectedSizeLabel }} · Quantidade: {{ quantity }}</span>
                <div class="pm-product-total-row">
                  <span class="pm-product-total-label">Total:</span>
                  <span class="pm-product-final">{{ finalAmount }}</span>
                </div>
              </div>
              <div class="pm-product-price-wrap">
                <div class="pm-product-total">{{ totalAmount }}</div>
                <div class="pm-product-shipping" v-if="shippingPriceLabel">{{ shippingPriceLabel }}</div>
              </div>
            </div>

            <div class="pm-methods" v-if="!(method === 'pix' && (isSubmitting || paymentResult))">
              <button :class="['pm-method', method==='pix' ? 'active' : '']" @click.prevent="selectMethod('pix')">PIX</button>
              <button :class="['pm-method', method==='credit' ? 'active' : '']" @click.prevent="selectMethod('credit')">Cartão de Crédito</button>
              <button :class="['pm-method', method==='debit' ? 'active' : '']" @click.prevent="selectMethod('debit')">Débito</button>
            </div>
          </div>

          <div class="pm-scrollable">
            <div class="pm-method-panel">
              <template v-if="method==='pix'">
                <div class="pm-pix">
                  <div v-if="isLoadingAddress" class="pm-loader">
                    <div class="pm-loader-spinner"></div>
                    <p>Processando informações</p>
                  </div>

                  <div v-else-if="isSubmitting" class="pm-loader">
                    <div class="pm-loader-spinner"></div>
                    <p>{{ loadingMessage }}</p>
                  </div>

                  <template v-else-if="paymentStatus === 'approved' && paymentResult">
                    <div class="pm-pix-result">
                      <p class="pm-note">Pagamento confirmado com sucesso!</p>
                      <div class="pm-success-box">
                        <i class="ri-check-double-line" style="font-size: 2rem; color: #24b36b;"></i>
                        <h4 style="margin: 12px 0 8px;">Seu PIX foi aprovado</h4>
                        <p>Pedido confirmado e o pagamento foi concluído.</p>
                      </div>
                    </div>
                  </template>

                  <template v-else-if="paymentResult && (pixQrCode || pixTicketUrl || pixCode)">
                    <div class="pm-pix-result">
                      <p class="pm-note">
                        {{ pixQrCode ? 'Escaneie o QR Code abaixo para finalizar o pagamento PIX.' : 'Seu pagamento PIX foi gerado com sucesso. Use o código ou o link abaixo para concluir o pagamento.' }}
                      </p>

                      <div v-if="pixQrCode" class="pm-qr-box">
                        <img :src="pixQrCode" alt="QR Code PIX" class="pm-qr-image" />
                      </div>

                      <div v-if="pixTicketUrl" class="pm-ticket-link-wrap">
                        <a :href="pixTicketUrl" target="_blank" rel="noopener noreferrer" class="pm-ticket-link">
                          Abrir link do pagamento PIX
                        </a>
                      </div>

                      <div class="pm-pix-copy-row" v-if="pixCode" @click.prevent="copyPix">
                        <div v-if="!copySuccess" class="pm-pix-code" title="Clique para copiar o código PIX">{{ pixCode }}</div>
                        <button v-if="!copySuccess" class="pm-copy-button" @click.prevent="copyPix" aria-label="Copiar código PIX">
                          <i class="ri-file-copy-line"></i>
                          <span>copiar</span>
                        </button>

                        <div v-if="copySuccess" class="pm-copy-success-message" aria-live="polite">
                          Código pix copiado!
                        </div>
                      </div>
                    </div>
                  </template>

                  <form v-else class="pm-pix-form" @submit.prevent="confirm">
                    <p class="pm-note">Preencha seus dados abaixo para gerar o pagamento via PIX.</p>
                    <label class="pm-field">
                      <span>Nome completo</span>
                      <input type="text" v-model="pixForm.fullName" :disabled="isSubmitting" placeholder="Seu nome completo" />
                    </label>

                    <label class="pm-field">
                      <span>CPF</span>
                      <input
                        type="text"
                        v-model="pixForm.cpf"
                        :disabled="isSubmitting"
                        inputmode="numeric"
                        placeholder="000.000.000-00"
                        @input="pixForm.cpf = formatCpf(pixForm.cpf)"
                      />
                      <small class="pm-helper-text">Formatação automática. Digite apenas números.</small>
                    </label>

                    <label class="pm-field">
                      <span>E-mail</span>
                      <input type="email" v-model="pixForm.email" :disabled="isSubmitting" placeholder="seu@email.com" />
                    </label>

                    <label class="pm-field">
                      <span>Telefone</span>
                      <input type="tel" v-model="pixForm.phone" :disabled="isSubmitting" inputmode="tel" placeholder="(00) 90000-0000" />
                    </label>

                    <div class="pm-row">
                      <label class="pm-field small">
                        <span>CEP</span>
                        <input
                          type="text"
                          v-model="pixForm.cep"
                          :disabled="isSubmitting"
                          inputmode="numeric"
                          placeholder="00000-000"
                          @input="pixForm.cep = formatCep(pixForm.cep)"
                        />
                      </label>
                      <label class="pm-field small">
                        <span>Número</span>
                        <input type="text" v-model="pixForm.number" :disabled="isSubmitting" placeholder="Exemplo: 123" />
                      </label>
                    </div>

                    <label class="pm-field">
                      <span>Rua / Av.</span>
                      <input type="text" v-model="pixForm.street" :disabled="isSubmitting" placeholder="Ex. Av. Brasil" />
                    </label>

                    <label class="pm-field">
                      <span>Bairro</span>
                      <input type="text" v-model="pixForm.neighborhood" :disabled="isSubmitting" placeholder=" Ex. Jardim América" />
                    </label>

                    <label class="pm-field">
                      <span>Complemento <i style="font-size: 0.8em; color: #999;">(opcional)</i></span>
                      <input type="text" v-model="pixForm.complement" :disabled="isSubmitting" placeholder="Ex. Apto 101, Bloco A" />
                    </label>
                  </form>
                </div>
              </template>

              <template v-else>
                <form class="pm-card-form" @submit.prevent="confirm">
                  <label class="pm-field">
                    <span>Número do cartão</span>
                    <input type="text" v-model="card.number" @input="formatCardNumber" inputmode="numeric" placeholder="0000 0000 0000 0000" />
                  </label>
                  <label class="pm-field">
                    <span>Nome no cartão</span>
                    <input type="text" v-model="card.name" placeholder="Nome impresso no cartão" />
                  </label>
                  <div class="pm-row">
                    <label class="pm-field small">
                      <span>Validade</span>
                      <input type="text" v-model="card.expiry" placeholder="MM/AA" />
                    </label>
                    <label class="pm-field small">
                      <span>CVV</span>
                      <input type="password" v-model="card.cvv" inputmode="numeric" placeholder="123" />
                    </label>
                  </div>
                </form>
              </template>
            </div>
          </div>
        </div>

        <footer class="payment-modal-footer">
          <button class="pm-cancel" @click.prevent="close">Cancelar</button>
          <button class="pm-confirm" @click.prevent="confirm" :disabled="isSubmitting" v-if="method==='pix' && !paymentResult">{{ pixButtonLabel }}</button>
          <button class="pm-confirm" @click.prevent="confirm" v-else-if="method!=='pix'">Confirmar</button>
        </footer>
      </div>
    </div>
  `
};
