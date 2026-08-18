import assert from 'node:assert/strict';
import { normalizeViaCepAddress } from '../src/components/PaymentModal.js';

const fullData = {
    logradouro: 'Avenida Brasil',
    bairro: 'Centro',
    complemento: 'Bloco A',
    complemento2: 'Apto 101',
};

assert.deepEqual(normalizeViaCepAddress(fullData), {
    street: 'Avenida Brasil',
    neighborhood: 'Centro',
    complement: 'Bloco A Apto 101',
});

assert.deepEqual(normalizeViaCepAddress({
    logradouro: 'Rua das Flores',
    bairro: '',
    complemento: '',
}), {
    street: 'Rua das Flores',
    neighborhood: '',
    complement: '',
});

console.log('viacep address tests passed');
