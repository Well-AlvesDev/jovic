import assert from 'node:assert/strict';
import {
    truncateProductName,
    calculateProductTotal,
    calculateFinalTotal,
    normalizeCardInstallments,
    getCardInterestPayer,
    getPaymentMethodSelectionError,
} from '../src/components/PaymentModal.js';

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
assert.equal(normalizeCardInstallments(1), 1);
assert.equal(normalizeCardInstallments(6), 6);
assert.equal(normalizeCardInstallments(7), 6);
assert.equal(normalizeCardInstallments(0), 1);
assert.equal(getCardInterestPayer(3), 'seller');
assert.equal(getCardInterestPayer(4), 'buyer');
assert.equal(getCardInterestPayer(6), 'buyer');
assert.equal(getPaymentMethodSelectionError('debit', [{ payment_type_id: 'credit_card' }]), null);
assert.equal(getPaymentMethodSelectionError('credit', [{ payment_type_id: 'debit_card' }]), null);
assert.equal(getPaymentMethodSelectionError('debit', [{ payment_type_id: 'debit_card' }]), null);
assert.equal(getPaymentMethodSelectionError('credit', [{ payment_type_id: 'credit_card' }]), null);

console.log('payment modal tests passed');
