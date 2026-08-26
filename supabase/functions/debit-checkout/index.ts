declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
const DEBIT_PAYMENT_TYPE = 'debit_card';

function buildCorsHeaders(request: Request) {
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
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(request) },
  });
}

function parseProductModel(rawModel = '') {
  return String(rawModel ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [size = '', quantity = '0'] = entry.split('*').map((part) => part.trim());
      return { size, quantity: Number.parseInt(quantity, 10) || 0 };
    });
}

function hasEnoughStock(rawModel: string, requestedSize: string, requestedQuantity: number) {
  const size = requestedSize.trim().toUpperCase();
  const stock = parseProductModel(rawModel).find((entry) => entry.size.toUpperCase() === size);
  return Boolean(stock && requestedQuantity > 0 && stock.quantity >= requestedQuantity);
}

function parseCurrencyNumber(value: string | number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const sanitized = String(value ?? '').trim().replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
  if (!sanitized) return Number.NaN;

  if (sanitized.includes(',') && sanitized.includes('.')) {
    const decimalSeparator = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    return Number.parseFloat(sanitized.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '').replace(decimalSeparator, '.'));
  }

  if (sanitized.includes(',')) return Number.parseFloat(sanitized.replace(',', '.'));
  return Number.parseFloat(sanitized);
}

function normalizeDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function getCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Cliente',
    lastName: parts.slice(1).join(' ') || 'Comprador',
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return jsonResponse(request, { ok: true });
  if (request.method !== 'POST') return jsonResponse(request, { ok: false, error: 'Método não permitido.' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(request, { ok: false, error: 'Variáveis do Supabase não configuradas.' }, 500);
    }
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return jsonResponse(request, { ok: false, error: 'Token do Mercado Pago não configurado.' }, 500);
    }

    const payload = await request.json();
    const productId = Number(payload?.productId ?? payload?.id);
    const quantity = Number(payload?.quantity ?? 1);
    const size = String(payload?.size ?? payload?.selectedSize ?? '').trim();
    const token = String(payload?.token ?? payload?.tokenId ?? '').trim();
    const paymentMethodId = String(payload?.paymentMethodId ?? '').trim();
    const bin = normalizeDigits(payload?.bin).slice(0, 6);
    const shippingPrice = Number(payload?.shippingPrice ?? 0);
    const customer = payload?.customer ?? {};

    if (!Number.isInteger(productId) || productId <= 0) {
      return jsonResponse(request, { ok: false, error: 'O ID do produto é obrigatório.' }, 400);
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return jsonResponse(request, { ok: false, error: 'Quantidade inválida.' }, 400);
    }
    if (!size) return jsonResponse(request, { ok: false, error: 'Selecione o tamanho do produto.' }, 400);
    if (!token || !paymentMethodId || bin.length !== 6) {
      return jsonResponse(request, { ok: false, error: 'Dados do cartão incompletos.' }, 400);
    }
    if (!customer?.fullName || !customer?.cpf || !customer?.email || !customer?.phone || !customer?.cep || !customer?.street || !customer?.neighborhood || !customer?.number) {
      return jsonResponse(request, { ok: false, error: 'Preencha todos os campos obrigatórios do cliente.' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: product, error: productError } = await supabase
      .from('j-box')
      .select('ID, PRODUTO, DESCRIPTION, PREÇO, DESCONTO, product_model')
      .eq('ID', productId)
      .single();

    if (productError || !product) {
      return jsonResponse(request, { ok: false, error: 'Produto não encontrado.' }, 404);
    }
    if (!hasEnoughStock(String(product.product_model ?? ''), size, quantity)) {
      return jsonResponse(request, { ok: false, error: 'Tamanho ou quantidade indisponíveis para esse produto.' }, 400);
    }

    const price = parseCurrencyNumber(product.PREÇO);
    const discount = Number.parseFloat(String(product.DESCONTO ?? '0').replace(',', '.')) || 0;
    const productAmount = price * (1 - Math.min(100, Math.max(0, discount)) / 100) * quantity;
    const amount = Number((productAmount + (Number.isFinite(shippingPrice) && shippingPrice > 0 ? shippingPrice : 0)).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse(request, { ok: false, error: 'Valor do produto inválido.' }, 400);
    }

    // Reconsulta o BIN no servidor para garantir que um cartão dual continue
    // sendo debitado somente quando o método escolhido for debit_card.
    const methodsResponse = await fetch(`https://api.mercadopago.com/v1/payment_methods?bin=${encodeURIComponent(bin)}`, {
      headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
    });
    if (!methodsResponse.ok) {
      return jsonResponse(request, { ok: false, error: 'Não foi possível validar o tipo do cartão.' }, 502);
    }

    const methodsData = await methodsResponse.json();
    const methods = Array.isArray(methodsData) ? methodsData : (Array.isArray(methodsData?.results) ? methodsData.results : []);
    const debitMethod = methods.find((method: { payment_type_id?: string; id?: string; payment_method_id?: string }) => (
      method?.payment_type_id === DEBIT_PAYMENT_TYPE
      && String(method?.id ?? method?.payment_method_id ?? '') === paymentMethodId
    ));
    if (!debitMethod) {
      return jsonResponse(request, {
        ok: false,
        error: 'O método selecionado não é débito para este cartão. Escolha débito novamente ou use outro cartão.',
      }, 422);
    }

    const { firstName, lastName } = getCustomerName(String(customer.fullName));
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        transaction_amount: amount,
        token,
        description: `Compra débito - ${String(product.PRODUTO ?? 'Produto')}`,
        payment_method_id: paymentMethodId,
        issuer_id: Number(payload?.issuerId) || undefined,
        installments: 1,
        payer: {
          email: String(customer.email).trim(),
          first_name: firstName,
          last_name: lastName,
          identification: { type: 'CPF', number: normalizeDigits(customer.cpf) },
        },
        external_reference: `debit-${productId}-${Date.now()}`,
        additional_info: {
          items: [{
            id: String(product.ID),
            title: String(product.PRODUTO ?? 'Produto'),
            description: String(product.DESCRIPTION ?? 'Produto'),
            quantity,
            unit_price: Number((productAmount / quantity).toFixed(2)),
          }],
        },
      }),
    });

    const responseText = await mpResponse.text();
    let payment = null;
    try {
      payment = responseText ? JSON.parse(responseText) : null;
    } catch {
      payment = null;
    }

    if (!mpResponse.ok) {
      return jsonResponse(request, {
        ok: false,
        error: 'Erro ao processar pagamento de débito no Mercado Pago.',
        details: responseText,
      }, 502);
    }

    return jsonResponse(request, {
      ok: true,
      paymentId: payment?.id ?? null,
      status: payment?.status ?? 'pending',
      statusDetail: payment?.status_detail ?? null,
      amount: Number(payment?.transaction_amount ?? amount).toFixed(2),
      paymentType: 'debit',
      paymentMethodId,
      product: { id: product.ID, name: product.PRODUTO, size, quantity },
    });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: 'Erro interno no checkout de débito.',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});