import assert from 'node:assert/strict';
import { truncateProductName, calculateProductTotal, calculateFinalTotal } from '../src/components/PaymentModal.js';

assert.equal(truncateProductName('Camiseta Premium de Algodão Masculina'), 'Camiseta Premium de Algodão Ma...');
assert.equal(truncateProductName('Produto curto'), 'Produto curto');
assert.equal(truncateProductName(''), 'Item');
assert.equal(
    calculateProductTotal({ PREÇO: '149,90', DESCONTO: '10' }, 2),
    269.82
);
assert.equal(
    calculateFinalTotal({ PREÇO: '149,90', DESCONTO: '10' }, 2, { price: 20 }),
    289.82
);

console.log('payment modal tests passed');
