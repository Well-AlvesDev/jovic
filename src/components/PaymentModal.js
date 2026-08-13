import { SUPABASE_CONFIG } from '../config.js';

export default {
  name: 'PaymentModal',
  props: {
    show: { type: Boolean, default: false },
    product: { type: Object, default: null },
    quantity: { type: Number, default: 1 },
    selectedSize: { type: String, default: '' },
  },
  emits: ['close', 'confirm'],
  data() {
    return {
      method: 'pix',
      isSubmitting: false,
      loadingMessage: 'Validando dados do pedido...',
      pixQrCode: '',
      pixTicketUrl: '',
      paymentResult: null,
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
      return this.product?.PRODUTO || 'Item';
    },
    selectedSizeLabel() {
      return this.selectedSize || 'Não informado';
    },
    totalAmount() {
      const price = Number.parseFloat(String(this.product?.PREÇO ?? '').replace(/[\.]/g, '').replace(',', '.')) || 0;
      const discount = Number(this.product?.DESCONTO || 0);
      const finalPrice = price * (1 - discount / 100);
      return (finalPrice * (this.quantity || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        this.paymentResult = null;
        this.pendingCheckoutData = null;
        this.isSubmitting = false;
        this.loadingMessage = 'Validando dados do pedido...';
      }
    }
  },
  methods: {
    close() {
      if (this.isSubmitting) return;
      this.$emit('close');
    },
    selectMethod(m) {
      if (this.isSubmitting) return;
      this.method = m;
    },
    copyPix() {
      if (!this.pixQrCode && !this.pixTicketUrl) return;
      navigator.clipboard?.writeText(this.pixTicketUrl || this.pixQrCode).then(() => {
        alert('Link/QR Code copiado.');
      }).catch(() => { });
    },
    sanitizeCpf(value) {
      return String(value || '').replace(/\D/g, '');
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
          this.pixQrCode = data.qrCodeBase64 ? `data:image/png;base64,${data.qrCodeBase64}` : (data.qrCode || '');
          this.pixTicketUrl = data.ticketUrl || '';
          this.isSubmitting = false;
          this.loadingMessage = 'Pagamento PIX pronto';
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
                <span class="pm-product-qty">Tamanho: {{ selectedSizeLabel }} · Qtd: {{ quantity }}</span>
              </div>
              <div class="pm-product-total">{{ totalAmount }}</div>
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
                  <div v-if="isSubmitting" class="pm-loader">
                    <div class="pm-loader-spinner"></div>
                    <p>{{ loadingMessage }}</p>
                  </div>

                  <template v-else-if="paymentResult && pixQrCode">
                    <div class="pm-pix-result">
                      <p class="pm-note">Escaneie o QR Code abaixo para finalizar o pagamento PIX.</p>
                      <div class="pm-qr-box">
                        <img v-if="pixQrCode" :src="pixQrCode" alt="QR Code PIX" class="pm-qr-image" />
                      </div>
                      <div class="pm-payment-meta">
                        <strong>Valor:</strong> {{ totalAmount }}
                      </div>
                      <div class="pm-payment-meta">
                        <strong>Produto:</strong> {{ productLabel }}
                      </div>
                      <div class="pm-payment-meta">
                        <strong>Tamanho:</strong> {{ selectedSizeLabel }}
                      </div>
                      <button class="pm-confirm" @click.prevent="copyPix">Copiar link do Pix</button>
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
                      <input type="text" v-model="pixForm.cpf" :disabled="isSubmitting" inputmode="numeric" placeholder="000.000.000-00" />
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
                        <input type="text" v-model="pixForm.cep" :disabled="isSubmitting" inputmode="numeric" placeholder="00000-000" />
                      </label>
                      <label class="pm-field small">
                        <span>Número</span>
                        <input type="text" v-model="pixForm.number" :disabled="isSubmitting" placeholder="123" />
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
