// ─────────────────────────────────────────────────────────────────────────
// Supabase Edge Function: calcular-frete
//
// Recebe { productId, cepDestino } do frontend, busca as medidas (coluna
// "dime") e o preço do produto na tabela "j-box", e consulta a API do
// Melhor Envio para retornar as cotações de PAC e SEDEX (valor + prazo).
//
// O token do Melhor Envio fica seguro aqui no servidor (Supabase secret),
// nunca é exposto no navegador.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Config fixa da loja ──────────────────────────────────────────────────
const CEP_ORIGEM = '55870970'; // CEP de origem da loja (somente números)
const TABLE = 'j-box';

// URL da API do Melhor Envio.
// Produção: https://www.melhorenvio.com.br/api/v2/me/shipment/calculate
// Sandbox:  https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate
const MELHOR_ENVIO_URL = Deno.env.get('MELHOR_ENVIO_API_URL')
  ?? 'https://www.melhorenvio.com.br/api/v2/me/shipment/calculate';

const MELHOR_ENVIO_TOKEN = Deno.env.get('MELHOR_ENVIO_TOKEN');

// IDs de serviço do Melhor Envio: 1 = PAC, 2 = SEDEX (Correios)
const SERVICE_IDS = [1, 2];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Parse da coluna "dime": ex. "L10, C20, A4, P400" ───────────────────────
// L = Largura (cm), A = Altura (cm), C = Comprimento (cm), P = Peso (gramas)
function parseDimensoes(dime: string | null | undefined) {
  if (!dime) return null;

  const map: Record<string, number> = {};
  const parts = String(dime).split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^([LACP])\s*([\d.,]+)$/i);
    if (!match) continue;
    const key = match[1].toUpperCase();
    const value = Number.parseFloat(match[2].replace(',', '.'));
    if (!Number.isNaN(value)) map[key] = value;
  }

  const { L, A, C, P } = map;
  if (
    typeof L !== 'number' || typeof A !== 'number' ||
    typeof C !== 'number' || typeof P !== 'number'
  ) {
    return null;
  }

  return {
    width: L,      // cm
    height: A,     // cm
    length: C,     // cm
    weight: P / 1000, // gramas -> kg (Melhor Envio espera kg)
  };
}

// ── Parse de preço do produto (aceita "199,90" / "199.90" / 199.9) ────────
function parsePreco(preco: unknown): number {
  if (typeof preco === 'number' && Number.isFinite(preco)) return preco;
  const sanitized = String(preco ?? '0').trim().replace(/[^\d,.-]/g, '');
  if (sanitized.includes(',') && sanitized.includes('.')) {
    return Number.parseFloat(sanitized.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (sanitized.includes(',')) {
    return Number.parseFloat(sanitized.replace(',', '.')) || 0;
  }
  return Number.parseFloat(sanitized) || 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  if (!MELHOR_ENVIO_TOKEN) {
    console.error('MELHOR_ENVIO_TOKEN não configurado nos secrets da function.');
    return jsonResponse({ error: 'Configuração de frete indisponível no momento.' }, 500);
  }

  try {
    const { productId, cepDestino } = await req.json();

    if (!productId) {
      return jsonResponse({ error: 'productId é obrigatório.' }, 400);
    }

    const cepLimpo = String(cepDestino ?? '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      return jsonResponse({ error: 'CEP inválido. Use o formato 00000-000.' }, 400);
    }

    // ── Busca o produto no Supabase (mesmo banco, via service role) ──────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: product, error: dbError } = await supabase
      .from(TABLE)
      .select('ID, "PREÇO", dime')
      .eq('ID', productId)
      .single();

    if (dbError || !product) {
      console.error('Erro ao buscar produto:', dbError);
      return jsonResponse({ error: 'Produto não encontrado.' }, 404);
    }

    const dimensoes = parseDimensoes(product.dime);
    if (!dimensoes) {
      return jsonResponse(
        { error: 'Medidas do produto não cadastradas corretamente.' },
        422,
      );
    }

    const valorDeclarado = parsePreco(product['PREÇO']);

    // ── Monta payload para o Melhor Envio ─────────────────────────────────
    const payload = {
      from: { postal_code: CEP_ORIGEM },
      to: { postal_code: cepLimpo },
      package: {
        height: dimensoes.height,
        width: dimensoes.width,
        length: dimensoes.length,
        weight: dimensoes.weight,
      },
      options: {
        insurance_value: valorDeclarado || 0,
        receipt: false,
        own_hand: false,
      },
      services: SERVICE_IDS.join(','),
    };

    const meResponse = await fetch(MELHOR_ENVIO_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MELHOR_ENVIO_TOKEN}`,
        'User-Agent': 'JUVELE Loja (contato@juvele.com.br)',
      },
      body: JSON.stringify(payload),
    });

    if (!meResponse.ok) {
      const errBody = await meResponse.text();
      console.error('Erro Melhor Envio:', meResponse.status, errBody);
      return jsonResponse(
        { error: 'Não foi possível calcular o frete no momento. Tente novamente.' },
        502,
      );
    }

    const meData = await meResponse.json();

    // ── Normaliza resposta para o frontend ────────────────────────────────
    const options = (Array.isArray(meData) ? meData : [])
      .filter((item: any) => !item.error)
      .map((item: any) => ({
        service: item.name, // "PAC" | "SEDEX"
        company: item.company?.name ?? 'Correios',
        price: Number.parseFloat(item.price),
        deliveryDays: item.delivery_time ?? item.delivery_range?.max ?? null,
      }));

    if (!options.length) {
      return jsonResponse(
        { error: 'Nenhuma opção de frete disponível para este CEP.' },
        422,
      );
    }

    return jsonResponse({ options });
  } catch (err) {
    console.error('Erro inesperado em calcular-frete:', err);
    return jsonResponse({ error: 'Erro interno ao calcular o frete.' }, 500);
  }
});