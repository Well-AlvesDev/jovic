declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const TABLE = 'j-box';
const CEP_ORIGEM = '55870970';
const MAX_INSTALLMENTS = 6;
const SERVICE_IDS: Record<string, number> = { pac: 1, sedex: 2 };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
const MELHOR_ENVIO_TOKEN = Deno.env.get('MELHOR_ENVIO_TOKEN') ?? '';
const MELHOR_ENVIO_URL = Deno.env.get('MELHOR_ENVIO_API_URL')
  ?? 'https://www.melhorenvio.com.br/api/v2/me/shipment/calculate';

class CheckoutError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigins = new Set([
    'https://usejovic.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
  ]);

  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

function parseCurrency(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const sanitized = String(value ?? '').trim().replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!sanitized) return Number.NaN;
  if (sanitized.includes(',') && sanitized.includes('.')) {
    return Number.parseFloat(sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')
      ? sanitized.replace(/\./g, '').replace(',', '.')
      : sanitized.replace(/,/g, ''));
  }
  if (sanitized.includes(',')) return Number.parseFloat(sanitized.replace(',', '.'));
  if (/^\d+\.\d{3}$/.test(sanitized)) return Number.parseFloat(sanitized.replace('.', ''));
  return Number.parseFloat(sanitized);
}

function discountedPrice(price: unknown, discount: unknown): number {
  const numericPrice = parseCurrency(price);
  const numericDiscount = Number.parseFloat(String(discount ?? '0').replace(',', '.'));
  if (!Number.isFinite(numericPrice) || numericPrice < 0) return 0;
  const safeDiscount = Math.min(100, Math.max(0, Number.isFinite(numericDiscount) ? numericDiscount : 0));
  return Number((numericPrice * (1 - safeDiscount / 100)).toFixed(2));
}

function parseStock(rawModel: unknown, size: string, quantity: number): boolean {
  const wanted = String(size).trim().toUpperCase();
  const entry = String(rawModel ?? '').split(',').map((item) => item.trim()).find((item) => {
    const [entrySize = ''] = item.split('*');
    return entrySize.trim().toUpperCase() === wanted;
  });
  if (!entry) return false;
  const [, rawQuantity = '0'] = entry.split('*');
  return Number.parseInt(rawQuantity.trim(), 10) >= quantity;
}

function parseDimensions(value: unknown) {
  const dimensions: Record<string, number> = {};
  for (const part of String(value ?? '').split(',')) {
    const match = part.trim().match(/^([LACP])\s*[:=]?\s*([\d.,]+)$/i);
    if (match) dimensions[match[1].toUpperCase()] = Number.parseFloat(match[2].replace(',', '.'));
  }
  if (![dimensions.L, dimensions.A, dimensions.C, dimensions.P].every((item) => Number.isFinite(item))) return null;
  return { height: dimensions.A, width: dimensions.L, length: dimensions.C, weight: dimensions.P / 1000 };
}

async function calculateShipping(cep: string, service: string, product: Record<string, unknown>, quantity: number) {
  const dimensions = parseDimensions(product.dime);
  if (!dimensions) throw new CheckoutError('Medidas do produto não cadastradas corretamente.', 422);

  const response = await fetch(MELHOR_ENVIO_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MELHOR_ENVIO_TOKEN}`,
      'User-Agent': 'JOVIC Loja (checkout)',
    },
    body: JSON.stringify({
      from: { postal_code: CEP_ORIGEM },
      to: { postal_code: cep },
      package: {
        height: dimensions.height,
        width: dimensions.width,
        length: dimensions.length,
        weight: Number((dimensions.weight * quantity).toFixed(3)),
      },
      options: { insurance_value: Number((discountedPrice(product.PREÇO, product.DESCONTO) * quantity).toFixed(2)), receipt: false, own_hand: false },
      services: Object.values(SERVICE_IDS).join(','),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error('Melhor Envio recusou a recotação:', response.status, details);
    throw new CheckoutError('Não foi possível recalcular o frete.', 502);
  }
  const options = await response.json();
  const option = (Array.isArray(options) ? options : []).find((item) => {
    const itemService = String(item?.name ?? '').trim().toLowerCase();
    const itemId = Number(item?.id ?? item?.code ?? item?.service_id);
    return !item?.error
      && (itemService === service || itemId === SERVICE_IDS[service])
      && Number.isFinite(Number(item?.price));
  });
  if (!option) {
    const unavailable = (Array.isArray(options) ? options : [])
      .filter((item) => item?.error)
      .map((item) => `${item?.name ?? item?.id ?? 'serviço'}: ${item?.error}`)
      .join('; ');
    console.error('Serviço de frete indisponível:', service, unavailable || options);
    throw new CheckoutError('A opção de frete selecionada não está disponível para este CEP.', 422);
  }
  return Number.parseFloat(String(option.price));
}

async function detectPaymentType(paymentMethodId: string): Promise<'credit' | 'debit'> {
  const methodsUrl = new URL('https://api.mercadopago.com/v1/payment_methods');
  methodsUrl.searchParams.set('site_id', 'MLB');
  const response = await fetch(methodsUrl, {
    headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Mercado Pago não retornou os métodos de pagamento:', response.status, details);
    throw new CheckoutError(`Não foi possível consultar os métodos de cartão (Mercado Pago HTTP ${response.status}).`, 502);
  }
  const data = await response.json();
  const methods = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  const method = methods.find((item: { id?: string }) => item?.id === paymentMethodId);
  if (!method) {
    console.error('payment_method_id não encontrado na lista do Mercado Pago:', paymentMethodId);
    throw new CheckoutError('A bandeira do cartão não foi encontrada no Mercado Pago.', 422);
  }
  if (method?.payment_type_id === 'credit_card') return 'credit';
  if (method?.payment_type_id === 'debit_card') return 'debit';
  throw new CheckoutError('A forma de pagamento informada não é um cartão aceito.', 422);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return jsonResponse(request, { ok: true });
  if (request.method !== 'POST') return jsonResponse(request, { ok: false, error: 'Método não permitido.' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MERCADO_PAGO_ACCESS_TOKEN || !MELHOR_ENVIO_TOKEN) {
      const missing = [
        ['SUPABASE_URL', SUPABASE_URL],
        ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
        ['MERCADO_PAGO_ACCESS_TOKEN', MERCADO_PAGO_ACCESS_TOKEN],
        ['MELHOR_ENVIO_TOKEN', MELHOR_ENVIO_TOKEN],
      ].filter(([, value]) => !value).map(([name]) => name);
      console.error('Checkout não configurado. Secrets ausentes:', missing.join(', '));
      return jsonResponse(request, { ok: false, error: 'Serviço de pagamento não configurado.', missing }, 500);
    }

    const payload = await request.json();
    const productId = Number(payload?.productId ?? payload?.id);
    const quantity = Number.parseInt(payload?.quantity, 10);
    const size = String(payload?.size ?? '').trim();
    const service = String(payload?.shippingService ?? '').trim().toLowerCase();
    const cep = String(payload?.shippingCep ?? payload?.customer?.cep ?? '').replace(/\D/g, '');
    const cardToken = String(payload?.cardToken ?? '').trim();
    const paymentMethodId = String(payload?.paymentMethodId ?? '').trim();
    const installments = Number.parseInt(payload?.installments ?? '1', 10);
    const customer = payload?.customer ?? {};

    if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      return jsonResponse(request, { ok: false, error: 'Produto ou quantidade inválidos.' }, 400);
    }
    if (!size || !SERVICE_IDS[service] || cep.length !== 8) {
      return jsonResponse(request, { ok: false, error: 'Tamanho, CEP ou serviço de frete inválido.' }, 400);
    }
    if (!cardToken || !paymentMethodId) {
      return jsonResponse(request, { ok: false, error: 'Token e bandeira do cartão são obrigatórios.' }, 400);
    }
    if (!customer.fullName || !customer.email || String(customer.cpf ?? '').replace(/\D/g, '').length !== 11) {
      return jsonResponse(request, { ok: false, error: 'Dados do cliente inválidos.' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: product, error } = await supabase
      .from(TABLE)
      .select('ID, PRODUTO, PREÇO, DESCRIPTION, DESCONTO, product_model, dime')
      .eq('ID', productId)
      .single();
    if (error || !product) return jsonResponse(request, { ok: false, error: 'Produto não encontrado.' }, 404);
    if (!parseStock(product.product_model, size, quantity)) {
      return jsonResponse(request, { ok: false, error: 'Tamanho ou quantidade indisponíveis para esse produto.' }, 400);
    }

    const paymentType = await detectPaymentType(paymentMethodId);
    if (paymentType === 'debit' && installments !== 1) {
      return jsonResponse(request, { ok: false, error: 'Cartão de débito deve ser pago à vista.' }, 400);
    }
    if (paymentType === 'credit' && (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS)) {
      return jsonResponse(request, { ok: false, error: `Crédito permitido em até ${MAX_INSTALLMENTS} parcelas.` }, 400);
    }

    const unitPrice = discountedPrice(product.PREÇO, product.DESCONTO);
    if (unitPrice <= 0) return jsonResponse(request, { ok: false, error: 'Preço do produto inválido.' }, 422);
    const shippingAmount = await calculateShipping(cep, service, product, quantity);
    const totalAmount = Number((unitPrice * quantity + shippingAmount).toFixed(2));
    const fullName = String(customer.fullName).trim().split(/\s+/);

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: totalAmount,
        token: cardToken,
        description: `Compra ${paymentType === 'credit' ? 'crédito' : 'débito'} - ${product.PRODUTO ?? 'Produto'}`,
        payment_method_id: paymentMethodId,
        installments: paymentType === 'credit' ? installments : 1,
        issuer_id: payload?.issuerId || undefined,
        payer: {
          email: String(customer.email).trim(),
          first_name: fullName[0] || 'Cliente',
          last_name: fullName.slice(1).join(' ') || 'Comprador',
          identification: { type: 'CPF', number: String(customer.cpf).replace(/\D/g, '') },
        },
        external_reference: `card-${productId}-${Date.now()}`,
      }),
    });

    if (!mpResponse.ok) {
      console.error('Mercado Pago recusou o pagamento:', mpResponse.status, await mpResponse.text());
      return jsonResponse(request, { ok: false, error: 'Erro ao processar o pagamento no Mercado Pago.' }, 502);
    }
    const payment = await mpResponse.json();
    return jsonResponse(request, {
      ok: true,
      paymentId: payment?.id ?? null,
      status: payment?.status ?? 'pending',
      statusDetail: payment?.status_detail ?? null,
      paymentType,
      amounts: { product: Number((unitPrice * quantity).toFixed(2)), shipping: shippingAmount, total: totalAmount },
    });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    console.error('Erro no card-checkout:', error);
    return jsonResponse(request, { ok: false, error: error instanceof Error ? error.message : 'Erro interno do checkout.' }, status);
  }
});
