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

export function calculateDiscountedPrice(priceValue, discountPercent = 0) {
    const numericPrice = Number.parseFloat(priceValue);
    const numericDiscount = Number.parseFloat(discountPercent);

    if (Number.isNaN(numericPrice)) return 0;

    const secureDiscount = Math.min(100, Math.max(0, Number.isNaN(numericDiscount) ? 0 : numericDiscount));
    return Number((numericPrice * (1 - secureDiscount / 100)).toFixed(2));
}
