export function parseProductModel(rawModel = '') {
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

export function validateRequestedStock(rawModel = '', requestedSize = '', requestedQuantity = 1) {
    const normalizedSize = String(requestedSize ?? '').trim().toUpperCase();
    const quantityToCheck = Number.parseInt(requestedQuantity, 10);

    if (!normalizedSize || Number.isNaN(quantityToCheck) || quantityToCheck <= 0) {
        return false;
    }

    const stockEntry = parseProductModel(rawModel).find(
        (entry) => String(entry.size).trim().toUpperCase() === normalizedSize,
    );

    if (!stockEntry) return false;

    return stockEntry.quantity >= quantityToCheck;
}

function parseCurrencyNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const sanitized = String(value ?? '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[^\d,.-]/g, '');

    if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === ',') {
        return Number.NaN;
    }

    const hasComma = sanitized.includes(',');
    const hasDot = sanitized.includes('.');

    if (hasComma && hasDot) {
        const decimalSeparator = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.') ? ',' : '.';
        const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
        const normalized = sanitized
            .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
            .replace(decimalSeparator, '.');
        return Number.parseFloat(normalized);
    }

    if (hasComma) {
        return Number.parseFloat(sanitized.replace(',', '.'));
    }

    if (hasDot && sanitized.split('.').length > 2) {
        return Number.parseFloat(sanitized.replace(/\./g, ''));
    }

    return Number.parseFloat(sanitized);
}

export function calculateDiscountedPrice(priceValue, discountPercent = 0) {
    const numericPrice = parseCurrencyNumber(priceValue);
    const numericDiscount = Number.parseFloat(String(discountPercent ?? '0').replace(',', '.'));

    if (Number.isNaN(numericPrice)) return 0;

    const secureDiscount = Math.min(100, Math.max(0, Number.isNaN(numericDiscount) ? 0 : numericDiscount));
    return Number((numericPrice * (1 - secureDiscount / 100)).toFixed(2));
}
