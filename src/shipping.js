export function parseDimeValue(value = '') {
    const item = String(value ?? '');
    const matches = item.match(/(?:^|[,\s])(?:L|C|A|P)\s*:?\s*(\d+(?:\.\d+)?)/gi) || [];
    const parsed = {};

    for (const match of matches) {
        const cleaned = match.trim();
        const keyMatch = cleaned.match(/^([A-Za-z])/);
        const valueMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
        if (!keyMatch || !valueMatch) continue;

        const key = keyMatch[1].toUpperCase();
        const numericValue = valueMatch[1];

        if (key === 'L') parsed.width = numericValue;
        else if (key === 'C') parsed.length = numericValue;
        else if (key === 'A') parsed.height = numericValue;
        else if (key === 'P') parsed.weight = numericValue;
    }

    return {
        width: parsed.width || '0',
        length: parsed.length || '0',
        height: parsed.height || '0',
        weight: parsed.weight || '0',
    };
}

export function buildShippingPayload(product, cepDestino, quantity = 1) {
    const dime = typeof product?.dime === 'string' ? product.dime : '';
    const parsed = parseDimeValue(dime);

    return {
        originCep: '55360000',
        cep: String(cepDestino || '').replace(/\D/g, ''),
        quantity: Number(quantity || 1),
        package: {
            width: Number(parsed.width),
            length: Number(parsed.length),
            height: Number(parsed.height),
            weight: Number(parsed.weight),
        },
        services: ['04014', '04510'],
        productId: Number(product?.id || product?.productId || 0),
    };
}

export function normalizeShippingQuote(quotes = []) {
    if (!Array.isArray(quotes)) return [];

    return [...quotes]
        .map((quote) => {
            const code = String(quote?.code || quote?.serviceCode || '').trim();
            const name = String(quote?.name || quote?.service || '').trim();
            const serviceName = name === 'SEDEX' || name === 'PAC' ? name : (code === '04510' ? 'SEDEX' : code === '04014' ? 'PAC' : name || code);

            return {
                code,
                name: serviceName,
                price: Number(quote?.price ?? quote?.value ?? 0),
                deadline: Number(quote?.deadline ?? quote?.deliveryDays ?? quote?.days ?? 0),
            };
        })
        .filter((quote) => quote.name)
        .sort((a, b) => Number(b.price) - Number(a.price));
}
