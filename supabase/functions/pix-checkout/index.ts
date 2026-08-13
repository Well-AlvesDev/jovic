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

function parseProductModel(rawModel = '') {
  const model = String(rawModel ?? '').trim();
  if (!model) return [];

  return model
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [left = '', right = '0'] = entry.split('*').map((part) => part.trim());
      const size = left || 'Sem tamanho';
      const quantity = Number.parseInt(right, 10);

      return {
        size,
        quantity: Number.isNaN(quantity) ? 0 : quantity,
      };
    });
}

function validateRequestedStock(rawModel = '', requestedSize = '', requestedQuantity = 1) {
  const normalizedSize = String(requestedSize ?? '').trim().toUpperCase();
  const quantityToCheck = Number(requestedQuantity);

  if (!normalizedSize || Number.isNaN(quantityToCheck) || quantityToCheck <= 0) {
    return false;
  }

  const stockEntry = parseProductModel(rawModel).find(
    (entry) => String(entry.size).trim().toUpperCase() === normalizedSize,
  );

  if (!stockEntry) return false;

  return stockEntry.quantity >= quantityToCheck;
}

function calculateDiscountedPrice(priceValue: string | number, discountPercent = 0) {
  const numericPrice = Number.parseFloat(String(priceValue ?? '').replace(',', '.'));
  const numericDiscount = Number.parseFloat(String(discountPercent ?? '0'));

  if (Number.isNaN(numericPrice)) return 0;

  const secureDiscount = Math.min(100, Math.max(0, Number.isNaN(numericDiscount) ? 0 : numericDiscount));
  return Number((numericPrice * (1 - secureDiscount / 100)).toFixed(2));
}

function normalizeCpf(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

function buildCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigins = new Set([
    'https://usejovic.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
  ]);

  const allowOrigin = allowedOrigins.has(origin) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

Deno.serve(async (req) => {
  // AJUSTE AQUI: Responda com 'ok' e status 200
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: buildCorsHeaders(req),
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Método não permitido.' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
      },
    );
  }

  // ... (o resto do seu bloco try/catch continua exatamente igual)

  try {
    const payload = await req.json();
    const productId = Number(payload?.productId ?? payload?.id);
    const requestedQuantity = Number(payload?.quantity ?? 1);
    const requestedSize = String(payload?.size ?? payload?.selectedSize ?? '').trim();
    const customer = payload?.customer ?? {};

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Variáveis do Supabase não configuradas.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    if (!productId || Number.isNaN(productId)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'O ID do produto é obrigatório.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    if (!requestedSize) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Selecione o tamanho do produto.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    if (!customer?.fullName || !customer?.cpf || !customer?.email || !customer?.phone || !customer?.cep || !customer?.street || !customer?.neighborhood || !customer?.number) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Preencha todos os campos obrigatórios do cliente.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: product, error: productError } = await supabase
      .from('j-box')
      .select('ID, PRODUTO, PREÇO, DESCRIPTION, DESCONTO, product_model')
      .eq('ID', productId)
      .single();

    if (productError || !product) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Produto não encontrado.', details: productError?.message ?? null }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    const rawModel = String(product.product_model ?? '');
    const hasEnoughStock = validateRequestedStock(rawModel, requestedSize, requestedQuantity);
    if (!hasEnoughStock) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Tamanho ou quantidade indisponíveis para esse produto.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    const price = Number.parseFloat(String(product.PREÇO ?? '').replace(',', '.'));
    const discount = Number.parseFloat(String(product.DESCONTO ?? '0'));
    const finalPrice = calculateDiscountedPrice(price, discount);

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Token do Mercado Pago não configurado.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
        },
      );
    }

    const cpfDigits = normalizeCpf(customer.cpf);
    const fullName = String(customer.fullName).trim();
    const firstName = fullName.split(' ')[0] || 'Cliente';
    const lastName = fullName.split(' ').slice(1).join(' ') || 'Comprador';

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction_amount: Number(finalPrice.toFixed(2)),
        description: `Compra PIX - ${String(product.PRODUTO ?? 'Produto')}`,
        payment_method_id: 'pix',
        payer: {
          email: String(customer.email).trim(),
          first_name: firstName,
          last_name: lastName,
          identification: {
            type: 'CPF',
            number: cpfDigits,
          },
        },
        external_reference: `pix-${productId}-${Date.now()}`,
        additional_info: {
          items: [
            {
              id: String(product.ID),
              title: String(product.PRODUTO ?? 'Produto'),
              description: String(product.DESCRIPTION ?? 'Produto'),
              quantity: Number(requestedQuantity),
              unit_price: Number(finalPrice.toFixed(2)),
            },
          ],
        },
      }),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.log('MP ERROR:', errorText);

      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Erro ao gerar pagamento PIX no Mercado Pago.',
          details: errorText
        }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) } }
      );
    }

    const payment = await mpResponse.json();
    const qrCode = payment?.point_of_interaction?.transaction_data?.qr_code ?? null;
    const qrCodeBase64 = payment?.point_of_interaction?.transaction_data?.qr_code_base64 ?? null;
    const ticketUrl = payment?.point_of_interaction?.transaction_data?.ticket_url ?? null;

    return new Response(
      JSON.stringify({
        ok: true,
        paymentId: payment?.id ?? null,
        qrCode,
        qrCodeBase64,
        ticketUrl,
        amount: Number(payment?.transaction_amount ?? finalPrice).toFixed(2),
        status: payment?.status ?? 'pending',
        product: {
          id: product.ID,
          name: product.PRODUTO,
          description: product.DESCRIPTION,
          discount: Number(product.DESCONTO ?? 0),
          size: requestedSize,
          quantity: Number(requestedQuantity),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Erro interno do checkout PIX.', details: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
      },
    );
  }
});
