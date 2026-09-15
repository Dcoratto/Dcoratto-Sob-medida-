import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOfficialContractNumber, normalizeContractNumber} from './contractParser';

test('extrai numero oficial com hifen na linha abaixo do rotulo', () => {
  assert.equal(extractOfficialContractNumber('CONTRATO N.o\n100001677-2'), '100001677-2');
});

test('extrai numero oficial com hifen na mesma linha do rotulo', () => {
  assert.equal(extractOfficialContractNumber('CONTRATO N.º 100001677-2'), '100001677-2');
});

test('preserva zeros a esquerda e hifen', () => {
  assert.equal(extractOfficialContractNumber('CONTRATO Nº 001234-5'), '001234-5');
});

test('preserva sufixo textual do identificador', () => {
  assert.equal(extractOfficialContractNumber('CONTRATO N° 12345-A'), '12345-A');
});

test('mantem contratos numericos sem hifen', () => {
  assert.equal(extractOfficialContractNumber('CONTRATO N.o\n100001677'), '100001677');
});

test('normalizacao do contrato nao usa regra generica de item numerico', () => {
  assert.equal(normalizeContractNumber(' 100001677 - 2 '), '100001677-2');
});
