import assert from 'node:assert/strict';
import { parseProductModel, validateRequestedStock, calculateDiscountedPrice } from '../src/checkout/pixValidation.js';

const model = 'G*1, PP*3, P*1';

assert.deepEqual(parseProductModel(model), [
    { size: 'G', quantity: 1 },
    { size: 'PP', quantity: 3 },
    { size: 'P', quantity: 1 },
]);

assert.equal(validateRequestedStock(model, 'PP', 2), true);
assert.equal(validateRequestedStock(model, 'P', 2), false);
assert.equal(validateRequestedStock(model, 'M', 1), false);
assert.equal(calculateDiscountedPrice(100, 20), 80);
assert.equal(calculateDiscountedPrice('R$ 120,00', 10), 108);
assert.equal(calculateDiscountedPrice('1.299,90', 5), 1234.9);
assert.equal(calculateDiscountedPrice('10,80', 0), 10.8);
assert.equal(calculateDiscountedPrice('10.000', 0), 10000);
assert.equal(calculateDiscountedPrice('1.234,56', 15), 1049.38);

console.log('pixValidation tests passed');
