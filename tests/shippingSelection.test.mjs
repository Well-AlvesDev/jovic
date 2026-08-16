import assert from 'node:assert/strict';
import {
    normalizeShippingOptions,
    resolveSelectedShipping,
    isShippingSelectionReady,
} from '../src/shippingSelection.js';

const options = normalizeShippingOptions([
    { code: '04014', name: 'PAC', price: 22.3, deadline: 5 },
    { code: '04510', name: 'SEDEX', price: 45.95, deadline: 2 },
]);

assert.equal(options.length, 2);
assert.equal(options[0].service, 'PAC');
assert.equal(options[1].service, 'SEDEX');

const selected = resolveSelectedShipping(options, 'SEDEX');
assert.equal(selected.service, 'SEDEX');
assert.equal(selected.price, 45.95);
assert.equal(isShippingSelectionReady(options, 'PAC'), true);
assert.equal(isShippingSelectionReady(options, null), false);

console.log('shipping selection tests passed');
