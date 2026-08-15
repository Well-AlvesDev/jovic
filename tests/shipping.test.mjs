import assert from 'node:assert/strict';
import { parseDimeValue, buildShippingPayload, normalizeShippingQuote } from '../src/shipping.js';

assert.deepEqual(parseDimeValue('L10, C20, A4, P400'), {
    width: '10',
    length: '20',
    height: '4',
    weight: '400',
});

assert.deepEqual(parseDimeValue('L:10, C:20, A:4, P:400'), {
    width: '10',
    length: '20',
    height: '4',
    weight: '400',
});

const payload = buildShippingPayload(
    { id: 123, dime: 'L10, C20, A4, P400' },
    '01310902',
    2
);

assert.equal(payload.originCep, '55360000');
assert.equal(payload.cep, '01310902');
assert.equal(payload.package.width, 10);
assert.equal(payload.package.length, 20);
assert.equal(payload.package.height, 4);
assert.equal(payload.package.weight, 400);
assert.deepEqual(payload.services, ['04014', '04510']);

const normalized = normalizeShippingQuote([
    { code: '04510', name: 'SEDEX', price: 45.95, deadline: 2 },
    { code: '04014', name: 'PAC', price: 22.3, deadline: 5 },
]);

assert.equal(normalized[0].name, 'SEDEX');
assert.equal(normalized[1].name, 'PAC');
assert.equal(normalized[0].price, 45.95);

console.log('shipping tests passed');
