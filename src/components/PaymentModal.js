export default {
    name: 'PaymentModal',
    props: {
        show: { type: Boolean, default: false },
        product: { type: Object, default: null },
        quantity: { type: Number, default: 1 },
    },
    emits: ['close', 'confirm'],
    data() {
        return {
            method: 'pix',
            pixKey: '00000000-0000-0000-0000-000000000000',
            pixForm: {
                fullName: '',
                cpf: '',
                email: '',
                phone: '',
                cep: '',
                street: '',
                neighborhood: '',
                number: '',
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
        totalAmount() {
            const price = parseFloat(this.product?.PREÇO) || 0;
            return (price * (this.quantity || 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        },
        cardValid() {
            return (this.card.number.replace(/\s+/g, '').length >= 13) && this.card.name && this.card.expiry && (this.card.cvv.length >= 3);
        }
    },
    watch: {
        show(newVal) {
            if (newVal) {
                // reset sensitive fields when opened
                this.card = { number: '', name: '', expiry: '', cvv: '' };
            }
        }
    },
    methods: {
        close() {
            this.$emit('close');
        },
        selectMethod(m) {
            this.method = m;
        },
        copyPix() {
            navigator.clipboard?.writeText(this.pixKey).then(() => {
                alert('Chave PIX copiada.');
            }).catch(() => { });
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
        confirm() {
            if (this.method === 'pix') {
                if (!this.validatePixForm()) return;
                this.$emit('confirm', { method: 'pix', key: this.pixKey, customer: { ...this.pixForm }, product: this.product, quantity: this.quantity });
                return;
            }
            if ((this.method === 'credit' || this.method === 'debit') && this.cardValid) {
                this.$emit('confirm', { method: this.method, card: { ...this.card }, product: this.product, quantity: this.quantity });
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
                <span class="pm-product-qty">Qtd: {{ quantity }}</span>
              </div>
              <div class="pm-product-total">{{ totalAmount }}</div>
            </div>

            <div class="pm-methods">
              <button :class="['pm-method', method==='pix' ? 'active' : '']" @click.prevent="selectMethod('pix')">PIX</button>
              <button :class="['pm-method', method==='credit' ? 'active' : '']" @click.prevent="selectMethod('credit')">Cartão de Crédito</button>
              <button :class="['pm-method', method==='debit' ? 'active' : '']" @click.prevent="selectMethod('debit')">Débito</button>
            </div>
          </div>

          <div class="pm-scrollable">
            <div class="pm-method-panel">
              <template v-if="method==='pix'">
                <div class="pm-pix">
                  <p class="pm-note">Preencha seus dados abaixo para gerar o pagamento via PIX.</p>
                  <form class="pm-pix-form" @submit.prevent="confirm">
                    <label class="pm-field">
                      <span>Nome completo</span>
                      <input type="text" v-model="pixForm.fullName" placeholder="Seu nome completo" />
                    </label>

                    <label class="pm-field">
                      <span>CPF</span>
                      <input type="text" v-model="pixForm.cpf" inputmode="numeric" placeholder="000.000.000-00" />
                    </label>

                    <label class="pm-field">
                      <span>E-mail</span>
                      <input type="email" v-model="pixForm.email" placeholder="seu@email.com" />
                    </label>

                    <label class="pm-field">
                      <span>Telefone</span>
                      <input type="tel" v-model="pixForm.phone" inputmode="tel" placeholder="(00) 90000-0000" />
                    </label>

                    <div class="pm-row">
                      <label class="pm-field small">
                        <span>CEP</span>
                        <input type="text" v-model="pixForm.cep" inputmode="numeric" placeholder="00000-000" />
                      </label>
                      <label class="pm-field small">
                        <span>Número</span>
                        <input type="text" v-model="pixForm.number" placeholder="123" />
                      </label>
                    </div>

                    <label class="pm-field">
                      <span>Rua / Av.</span>
                      <input type="text" v-model="pixForm.street" placeholder="Rua Exemplo" />
                    </label>

                    <label class="pm-field">
                      <span>Bairro</span>
                      <input type="text" v-model="pixForm.neighborhood" placeholder="Bairro Exemplo" />
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
          <button class="pm-confirm" @click.prevent="confirm">Confirmar</button>
        </footer>
      </div>
    </div>
  `
};
