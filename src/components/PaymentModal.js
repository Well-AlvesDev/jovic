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

export const MAX_CARD_INSTALLMENTS = 6;
export const SELLER_INTEREST_FREE_INSTALLMENTS = 3;

export function normalizeCardInstallments(value = 1) {
  const installments = Number.parseInt(value, 10);
  if (!Number.isInteger(installments) || installments < 1) return 1;
  return Math.min(installments, MAX_CARD_INSTALLMENTS);
}

export function getCardInterestPayer(installments = 1) {
  return normalizeCardInstallments(installments) > SELLER_INTEREST_FREE_INSTALLMENTS
    ? 'buyer'
    : 'seller';
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
      cardInstallments: 1,
      cardInstallmentOptions: [],
      cardInstallmentsBin: '',
      isLoadingCardInstallments: false,
      cardInstallmentsError: '',
      cardInstallmentsRequestId: 0,
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
    maxCardInstallments() {
      return MAX_CARD_INSTALLMENTS;
    },
    sellerInterestFreeInstallments() {
      return SELLER_INTEREST_FREE_INSTALLMENTS;
    },
    pixButtonLabel() {
      if (this.isSubmitting) return 'Gerando QR Code...';
      return 'Confirmar';
    },
    paymentMethodLabel() {
      if (this.paymentResult?.paymentType === 'credit' || this.method === 'credit') return 'Cartão de crédito';
      if (this.paymentResult?.paymentType === 'debit' || this.method === 'debit') return 'Cartão de débito';
      return 'PIX';
    },
    approvedAmount() {
      const amount = this.paymentResult?.amounts?.total ?? this.paymentResult?.amount ?? this.paymentResult?.transaction_amount;
      return this.formatCurrency(amount);
    },
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.card = { number: '', name: '', expiry: '', cvv: '' };
        this.cardInstallments = 1;
        this.cardInstallmentOptions = [];
        this.cardInstallmentsBin = '';
        this.isLoadingCardInstallments = false;
        this.cardInstallmentsError = '';
        this.cardInstallmentsRequestId += 1;
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
    },
    'card.number': function () {
      this.loadCardInstallments();
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
        const statusUrl = this.method === 'pix' ? SUPABASE_CONFIG.pixCheckoutUrl : SUPABASE_CONFIG.cardCheckoutUrl;
        const response = await fetch(`${statusUrl}?paymentId=${encodeURIComponent(paymentId)}`, {
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
    async loadCardInstallments() {
      const bin = String(this.card.number || '').replace(/\D/g, '').slice(0, 6);

      if (bin.length === 6 && bin === this.cardInstallmentsBin) return;

      const requestId = ++this.cardInstallmentsRequestId;
      this.cardInstallmentOptions = [];
      this.cardInstallments = 1;
      this.cardInstallmentsError = '';

      if (bin.length !== 6) {
        this.cardInstallmentsBin = '';
        this.isLoadingCardInstallments = false;
        return;
      }

      this.cardInstallmentsBin = bin;
      this.isLoadingCardInstallments = true;
      try {
        const amount = calculateFinalTotal(this.product, this.quantity, this.selectedShipping).toFixed(2);
        const response = await fetch(`${SUPABASE_CONFIG.cardInstallmentsUrl}?amount=${encodeURIComponent(amount)}&bin=${encodeURIComponent(bin)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_CONFIG.anonKey,
          },
        });
        const data = await response.json();

        if (requestId !== this.cardInstallmentsRequestId) return;
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.error || 'Não foi possível consultar as parcelas.');
        }

        this.cardInstallmentOptions = Array.isArray(data?.installments)
          ? data.installments.filter((option) => option.installments >= 1 && option.installments <= MAX_CARD_INSTALLMENTS)
          : [];
        if (this.cardInstallmentOptions.length === 0) {
          this.cardInstallmentsError = 'Nenhuma opção de parcelamento disponível.';
        }
      } catch (error) {
        if (requestId === this.cardInstallmentsRequestId) {
          this.cardInstallmentsError = error.message || 'Não foi possível consultar as parcelas.';
        }
      } finally {
        if (requestId === this.cardInstallmentsRequestId) {
          this.isLoadingCardInstallments = false;
        }
      }
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
    validateCreditCustomerForm() {
      const f = this.pixForm;
      const onlyDigits = (s = '') => String(s).replace(/\D/g, '');
      if (!f.fullName.trim()) { alert('Informe o nome completo.'); return false; }
      if (onlyDigits(f.cpf).length !== 11) { alert('CPF inválido (11 dígitos).'); return false; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) { alert('E-mail inválido.'); return false; }
      if (onlyDigits(f.phone).length < 8) { alert('Telefone inválido.'); return false; }
      if (onlyDigits(f.cep).length !== 8) { alert('CEP inválido (8 dígitos).'); return false; }
      if (!f.street.trim()) { alert('Informe a Rua/Avenida.'); return false; }
      if (!f.neighborhood.trim()) { alert('Informe o Bairro.'); return false; }
      if (!f.number.trim()) { alert('Informe o número do endereço.'); return false; }
      return true;
    },
    validateCardInstallments() {
      const installments = Number(this.cardInstallments);
      if (!Number.isInteger(installments) || installments < 1 || installments > MAX_CARD_INSTALLMENTS) {
        alert(`Selecione entre 1 e ${MAX_CARD_INSTALLMENTS} parcelas.`);
        return false;
      }
      if (!this.cardInstallmentOptions.some((option) => option.installments === installments)) {
        alert('Aguarde a consulta das condições de parcelamento.');
        return false;
      }
      return true;
    },
    formatInstallmentAmount(installments) {
      const amount = calculateFinalTotal(this.product, this.quantity, this.selectedShipping);
      return (amount / normalizeCardInstallments(installments)).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    },
    formatCurrency(value) {
      return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
    },
    downloadReceipt() {
      window.print();
    },
    async tokenizeCard() {
      const publicKey = String(SUPABASE_CONFIG.mercadoPagoPublicKey || '').trim();
      if (!publicKey) {
        throw new Error('Configure a chave pública do Mercado Pago antes de testar o pagamento.');
      }
      if (!window.MercadoPago) {
        throw new Error('SDK do Mercado Pago não carregado. Recarregue a página e tente novamente.');
      }

      const mercadoPago = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      const cardNumber = String(this.card.number).replace(/\D/g, '');
      const expiry = String(this.card.expiry).replace(/\D/g, '');
      const [month = '', year = ''] = [expiry.slice(0, 2), expiry.slice(2, 4)];
      if (month.length !== 2 || year.length !== 2) {
        throw new Error('Informe a validade do cartão no formato MM/AA.');
      }

      const token = await mercadoPago.createCardToken({
        cardNumber,
        cardholderName: String(this.card.name).trim(),
        cardExpirationMonth: month,
        cardExpirationYear: `20${year}`,
        securityCode: String(this.card.cvv).replace(/\D/g, ''),
        identificationType: 'CPF',
        identificationNumber: this.sanitizeCpf(this.pixForm.cpf),
      });
      if (!token?.id) throw new Error('Não foi possível tokenizar o cartão.');

      const bin = cardNumber.slice(0, 6);
      const methodsResponse = await mercadoPago.getPaymentMethods({ bin });
      let methods = Array.isArray(methodsResponse)
        ? methodsResponse
        : (Array.isArray(methodsResponse?.results) ? methodsResponse.results : []);
      const expectedType = this.method === 'credit' ? 'credit_card' : 'debit_card';
      let paymentMethod = methods.find((method) => method?.payment_type_id === expectedType);

      // Alguns ambientes do SDK retornam uma lista incompleta; a consulta pública
      // por BIN é a mesma fonte oficial e não expõe os dados completos do cartão.
      if (!paymentMethod) {
        const publicMethodsUrl = new URL('https://api.mercadopago.com/v1/payment_methods');
        publicMethodsUrl.searchParams.set('public_key', publicKey);
        publicMethodsUrl.searchParams.set('bin', bin);
        const publicMethodsResponse = await fetch(publicMethodsUrl);
        if (publicMethodsResponse.ok) {
          const publicMethodsData = await publicMethodsResponse.json();
          const publicMethods = Array.isArray(publicMethodsData)
            ? publicMethodsData
            : (Array.isArray(publicMethodsData?.results) ? publicMethodsData.results : []);
          methods = [...methods, ...publicMethods];
          paymentMethod = publicMethods.find((method) => method?.payment_type_id === expectedType);
        }
      }

      const paymentMethodId = paymentMethod?.id || paymentMethod?.payment_method_id;
      if (!paymentMethodId) {
        const returnedTypes = [...new Set(methods
          .map((method) => method?.payment_type_id)
          .filter(Boolean))].join(', ') || 'nenhum';
        console.warn('Métodos retornados para o BIN:', methods.map((method) => ({
          id: method?.id || method?.payment_method_id,
          type: method?.payment_type_id,
          name: method?.name,
        })));
        throw new Error(`O Mercado Pago não retornou uma opção de ${this.method === 'credit' ? 'crédito' : 'débito'} para este BIN. Tipos retornados: ${returnedTypes}.`);
      }

      return {
        tokenId: token.id,
        paymentMethodId,
        issuerId: paymentMethod.issuer?.id || null,
        requestedPaymentType: this.method,
      };
    },
    async submitCardPayment() {
      const customer = {
        ...this.pixForm,
        cpf: this.sanitizeCpf(this.pixForm.cpf),
        phone: String(this.pixForm.phone || '').replace(/\D/g, ''),
        cep: String(this.pixForm.cep || '').replace(/\D/g, ''),
        number: String(this.pixForm.number || '').trim(),
      };
      this.isSubmitting = true;
      this.loadingMessage = 'Protegendo o cartão e processando pagamento...';

      try {
        const cardData = await this.tokenizeCard();
        const response = await fetch(SUPABASE_CONFIG.cardCheckoutUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_CONFIG.anonKey,
          },
          body: JSON.stringify({
            productId: Number(this.product.ID),
            quantity: Number(this.quantity || 1),
            size: String(this.selectedSize),
            shippingService: String(this.selectedShipping.service),
            shippingCep: customer.cep,
            cardToken: cardData.tokenId,
            paymentMethodId: cardData.paymentMethodId,
            issuerId: cardData.issuerId,
            requestedPaymentType: cardData.requestedPaymentType,
            installments: this.method === 'credit' ? normalizeCardInstallments(this.cardInstallments) : 1,
            customer,
          }),
        });
        const responseText = await response.text();
        let data = null;
        try {
          data = responseText ? JSON.parse(responseText) : null;
        } catch {
          throw new Error(`Resposta inválida do checkout (HTTP ${response.status}).`);
        }
        if (!response.ok || data?.ok === false) {
          throw new Error(data?.error || `O checkout recusou o pagamento (HTTP ${response.status}).`);
        }
        if (!data) throw new Error(`O checkout não retornou dados (HTTP ${response.status}).`);
        const returnedStatus = String(data?.status || '').trim().toLowerCase();
        console.info('Resposta do checkout de cartão:', {
          paymentId: data?.paymentId,
          status: returnedStatus || 'ausente',
          paymentType: data?.paymentType,
        });
        this.paymentResult = data;
        this.paymentStatus = returnedStatus || 'pending';
        this.loadingMessage = returnedStatus === 'approved' ? 'Pagamento concluído' : 'Pagamento em análise';
        if (data?.paymentId && returnedStatus !== 'approved') {
          this.startPaymentStatusPolling(data.paymentId);
        }
        this.$emit('confirm', { method: data.paymentType || this.method, customer, payment: data });
      } catch (error) {
        console.error('Falha no pagamento com cartão:', error);
        alert(error?.message || 'Erro ao processar o pagamento.');
      } finally {
        this.isSubmitting = false;
      }
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

      if ((this.method === 'credit' || this.method === 'debit') && !this.validateCreditCustomerForm()) return;

      if (this.method === 'credit' && !this.validateCardInstallments()) return;

      if ((this.method === 'credit' || this.method === 'debit') && this.cardValid) {
        await this.submitCardPayment();
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

            <div class="pm-methods" v-if="!(isSubmitting || paymentStatus === 'approved' || (method === 'pix' && paymentResult))">
              <button :class="['pm-method', 'pm-method-pix', method==='pix' ? 'active' : '']" @click.prevent="selectMethod('pix')">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4754 1.7678C13.1086 0.400967 10.8925 0.400967 9.52565 1.7678L5.39898 5.89447C6.50441 5.82558 7.63299 6.2135 8.47774 7.05825L11.4703 10.0508C11.7632 10.3437 12.2381 10.3437 12.531 10.0508L15.5235 7.05833C16.3682 6.2136 17.4967 5.82567 18.6021 5.89454L14.4754 1.7678ZM20.4538 7.74617L22.2328 9.52516C23.5943 10.8867 23.5996 13.091 22.2485 14.4591L20.4741 16.2335C19.3025 17.4051 17.403 17.4051 16.2314 16.2335L13.2381 13.2402C12.5547 12.5567 11.4466 12.5567 10.7632 13.2402L7.76977 16.2336C6.5982 17.4052 4.69871 17.4052 3.52713 16.2336L1.74761 14.4541C0.40149 13.0856 0.408385 10.8851 1.76829 9.52516L3.54282 7.75063C4.71554 6.59381 6.60399 6.59872 7.77063 7.76536L10.7632 10.7579C11.4466 11.4413 12.5547 11.4413 13.2381 10.7579L16.2306 7.76543C17.3957 6.60032 19.2807 6.5939 20.4538 7.74617ZM5.39783 18.1045C6.50336 18.1734 7.63206 17.7855 8.47688 16.9407L11.4703 13.9473C11.7632 13.6544 12.2381 13.6544 12.531 13.9473L15.5243 16.9406C16.3691 17.7854 17.4978 18.1733 18.6033 18.1044L14.4754 22.2323C13.1086 23.5991 10.8925 23.5991 9.52565 22.2323L5.39783 18.1045Z"></path></svg>
                <span>PIX</span>
              </button>
              <button :class="['pm-method', 'pm-method-icon', method==='credit' ? 'active' : '']" @click.prevent="selectMethod('credit')">
                <i class="ri-bank-card-fill"></i>
                <span>Cartão de Crédito</span>
              </button>
              <button :class="['pm-method', 'pm-method-icon', method==='debit' ? 'active' : '']" @click.prevent="selectMethod('debit')">
                <i class="ri-bank-card-2-fill"></i>
                <span>Cartão de Débito</span>
              </button>
            </div>
          </div>

          <div class="pm-scrollable">
            <div class="pm-method-panel">
              <template v-if="paymentStatus === 'approved' && paymentResult">
                <section class="pm-approved" aria-live="polite">
                  <div class="pm-approved-icon" aria-hidden="true">
                    <i class="ri-check-line"></i>
                  </div>
                  <p class="pm-approved-kicker">Pagamento aprovado</p>
                  <h4>Pagamento realizado com sucesso</h4>
                  <p class="pm-approved-subtitle">Seu pedido foi confirmado com segurança.</p>

                  <div class="pm-approved-details">
                    <div>
                      <span>Forma de pagamento</span>
                      <strong>{{ paymentMethodLabel }}</strong>
                    </div>
                    <div>
                      <span>Valor total</span>
                      <strong>{{ approvedAmount }}</strong>
                    </div>
                    <div v-if="paymentResult.paymentId">
                      <span>ID da transação</span>
                      <strong>{{ paymentResult.paymentId }}</strong>
                    </div>
                    <div v-if="paymentResult.statusDetail">
                      <span>Status</span>
                      <strong>{{ paymentResult.statusDetail }}</strong>
                    </div>
                  </div>

                  <button class="pm-receipt-button" type="button" @click.prevent="downloadReceipt">
                    <i class="ri-download-2-line"></i>
                    <span>Baixar comprovante</span>
                  </button>
                </section>
              </template>

              <template v-else-if="method==='pix'">
                <div class="pm-pix">
                  <div v-if="isLoadingAddress" class="pm-loader">
                    <div class="pm-loader-spinner"></div>
                    <p>Processando informações</p>
                  </div>

                  <div v-else-if="isSubmitting" class="pm-loader">
                    <div class="pm-loader-spinner"></div>
                    <p>{{ loadingMessage }}</p>
                  </div>

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

              <template v-else-if="method==='credit'">
                <form class="pm-card-form pm-pix-form" @submit.prevent="confirm">
                  <p class="pm-note">Preencha seus dados para concluir o pagamento com cartão de crédito.</p>
                  <label class="pm-field">
                    <span>Número do cartão</span>
                    <input type="text" v-model="card.number" @input="formatCardNumber" inputmode="numeric" placeholder="0000 0000 0000 0000" />
                  </label>
                  <label class="pm-field">
                    <span>Nome no cartão</span>
                    <input type="text" v-model="card.name" placeholder="Ex. MARIA JOSE" />
                  </label>
                  <div class="pm-row">
                    <label class="pm-field small">
                      <span>Validade</span>
                      <input type="text" v-model="card.expiry" placeholder="MM/AA" />
                    </label>
                    <label class="pm-field small">
                      <span>CVV</span>
                      <input type="text" v-model="card.cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123" />
                    </label>
                  </div>

                  <label class="pm-field">
                    <span>Quantidade de parcelas</span>
                    <select v-model.number="cardInstallments" :disabled="isSubmitting">
                      <option v-if="isLoadingCardInstallments" disabled value="">
                        Consultando condições...
                      </option>
                      <option v-else-if="cardInstallmentOptions.length === 0" disabled value="">
                        Digite os 6 primeiros números do cartão
                      </option>
                      <option v-for="option in cardInstallmentOptions" :key="option.installments" :value="option.installments">
                        {{ option.installments }}x {{ option.installments <= sellerInterestFreeInstallments ? 'sem juros' : 'com juros' }} ({{ formatCurrency(option.installmentAmount) }})
                      </option>
                    </select>
                    <small v-if="cardInstallmentsError" class="pm-helper-text">{{ cardInstallmentsError }}</small>
                  </label>

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
                    <input type="text" v-model="pixForm.neighborhood" :disabled="isSubmitting" placeholder="Ex. Jardim América" />
                  </label>

                  <label class="pm-field">
                    <span>Complemento <i style="font-size: 0.8em; color: #999;">(opcional)</i></span>
                    <input type="text" v-model="pixForm.complement" :disabled="isSubmitting" placeholder="Ex. Apto 101, Bloco A" />
                  </label>
                </form>
              </template>

              <template v-else>
                <form class="pm-card-form pm-pix-form" @submit.prevent="confirm">
                  <p class="pm-note">Preencha seus dados para concluir o pagamento com cartão de débito.</p>
                  <label class="pm-field">
                    <span>Número do cartão</span>
                    <input type="text" v-model="card.number" @input="formatCardNumber" inputmode="numeric" placeholder="0000 0000 0000 0000" />
                  </label>
                  <label class="pm-field">
                    <span>Nome no cartão</span>
                    <input type="text" v-model="card.name" placeholder="Ex. MARIA JOSE" />
                  </label>
                  <div class="pm-row">
                    <label class="pm-field small">
                      <span>Validade</span>
                      <input type="text" v-model="card.expiry" placeholder="MM/AA" />
                    </label>
                    <label class="pm-field small">
                      <span>CVV</span>
                      <input type="text" v-model="card.cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" placeholder="123" />
                    </label>
                  </div>

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
                    <input type="text" v-model="pixForm.neighborhood" :disabled="isSubmitting" placeholder="Ex. Jardim América" />
                  </label>

                  <label class="pm-field">
                    <span>Complemento <i style="font-size: 0.8em; color: #999;">(opcional)</i></span>
                    <input type="text" v-model="pixForm.complement" :disabled="isSubmitting" placeholder="Ex. Apto 101, Bloco A" />
                  </label>
                </form>
              </template>
            </div>
          </div>
        </div>

        <footer class="payment-modal-footer">
          <button class="pm-cancel" @click.prevent="close">Cancelar</button>
          <button class="pm-confirm" @click.prevent="confirm" :disabled="isSubmitting" v-if="method==='pix' && !paymentResult">{{ pixButtonLabel }}</button>
          <button class="pm-confirm" @click.prevent="confirm" v-else-if="method!=='pix' && !paymentResult">Confirmar</button>
        </footer>
      </div>
    </div>
  `
};
