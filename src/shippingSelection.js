export function normalizeShippingOption(option = {}) {
    if (!option || typeof option !== 'object') return null;

    const service = String(option.service || option.name || option.label || '').trim().toUpperCase();
    const code = String(option.code || option.id || '').trim().toUpperCase();
    const price = Number(option.price ?? option.value ?? 0);
    const deadline = Number(option.deadline ?? option.deliveryDays ?? option.days ?? 0);

    const normalizedService = service === 'PAC' || service === 'SEDEX'
        ? service
        : (code === '04014' ? 'PAC' : code === '04510' ? 'SEDEX' : service || code || 'ENTREGA');

    return {
        service: normalizedService,
        code: code || normalizedService,
        price: Number.isFinite(price) ? price : 0,
        deadline: Number.isFinite(deadline) ? deadline : 0,
        deliveryDays: Number.isFinite(deadline) ? deadline : 0,
    };
}

export function normalizeShippingOptions(options = []) {
    if (!Array.isArray(options)) return [];

    return options
        .map((option) => normalizeShippingOption(option))
        .filter(Boolean)
        .filter((option) => option && option.service);
}

export function resolveSelectedShipping(options = [], selectedValue) {
    const normalizedOptions = normalizeShippingOptions(options);
    if (!normalizedOptions.length) return null;

    if (!selectedValue) return null;

    const comparisonValue = typeof selectedValue === 'string'
        ? selectedValue
        : (selectedValue.service || selectedValue.name || selectedValue.label || '');

    const normalizedValue = String(comparisonValue).trim().toUpperCase();

    return normalizedOptions.find((option) => {
        const service = option.service.toUpperCase();
        const code = option.code.toUpperCase();
        return service === normalizedValue || code === normalizedValue;
    }) || null;
}

export function isShippingSelectionReady(options = [], selectedValue) {
    const normalizedOptions = normalizeShippingOptions(options);
    if (!normalizedOptions.length) return false;

    const selectedShipping = resolveSelectedShipping(normalizedOptions, selectedValue);
    return Boolean(selectedShipping && normalizedOptions.some((option) => option.service === selectedShipping.service));
}
