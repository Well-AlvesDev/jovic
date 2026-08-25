declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const MERCADO_PAGO_ACCESS_TOKEN = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? '';
const MAX_INSTALLMENTS = 6;

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(request) },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return jsonResponse(request, { ok: true });
  if (request.method !== 'GET') return jsonResponse(request, { ok: false, error: 'Método não permitido.' }, 405);

  try {
    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return jsonResponse(request, { ok: false, error: 'Token do Mercado Pago não configurado.' }, 500);
    }

    const url = new URL(request.url);
    const amount = Number(url.searchParams.get('amount'));
    const bin = String(url.searchParams.get('bin') ?? '').replace(/\D/g, '').slice(0, 6);
    const paymentMethodId = String(url.searchParams.get('paymentMethodId') ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || bin.length !== 6) {
      return jsonResponse(request, { ok: false, error: 'Informe um valor e o BIN de 6 dígitos.' }, 400);
    }

    let resolvedPaymentMethodId = paymentMethodId;
    if (!resolvedPaymentMethodId) {
      const methodsResponse = await fetch(
        `https://api.mercadopago.com/v1/payment_methods?bin=${encodeURIComponent(bin)}`,
        { headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` } },
      );

      if (!methodsResponse.ok) {
        const details = await methodsResponse.text();
        return jsonResponse(request, {
          ok: false,
          error: 'Não foi possível identificar a bandeira do cartão.',
          details,
        }, 502);
      }

      const methods = await methodsResponse.json();
      const methodList = Array.isArray(methods) ? methods : (Array.isArray(methods?.results) ? methods.results : []);
      const cardMethod = methodList.find(
        (method: { payment_type_id?: string; id?: string }) => method?.payment_type_id === 'credit_card',
      );
      resolvedPaymentMethodId = String(cardMethod?.id ?? '');
    }

    if (!resolvedPaymentMethodId) {
      return jsonResponse(request, { ok: false, error: 'Bandeira de cartão não identificada.' }, 422);
    }

    const installmentsUrl = new URL('https://api.mercadopago.com/v1/payment_methods/installments');
    installmentsUrl.searchParams.set('amount', amount.toFixed(2));
    installmentsUrl.searchParams.set('bin', bin);
    installmentsUrl.searchParams.set('payment_method_id', resolvedPaymentMethodId);

    const installmentsResponse = await fetch(installmentsUrl, {
      headers: { Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` },
    });

    if (!installmentsResponse.ok) {
      const details = await installmentsResponse.text();
      return jsonResponse(request, { ok: false, error: 'Não foi possível consultar as parcelas.', details }, 502);
    }

    const data = await installmentsResponse.json();
    const payerCosts = Array.isArray(data) ? data.flatMap((item) => item?.payer_costs ?? []) : [];
    const installments = payerCosts
      .filter((option) => Number(option?.installments) >= 1 && Number(option?.installments) <= MAX_INSTALLMENTS)
      .map((option) => ({
        installments: Number(option.installments),
        installmentAmount: Number(option.installment_amount ?? 0),
        totalAmount: Number(option.total_amount ?? 0),
        installmentRate: Number(option.installment_rate ?? 0),
        labels: Array.isArray(option.labels) ? option.labels : [],
      }));

    return jsonResponse(request, {
      ok: true,
      paymentMethodId: resolvedPaymentMethodId,
      installments,
    });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: 'Erro ao consultar as parcelas do cartão.',
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
