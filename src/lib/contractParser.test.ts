import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOfficialContractNumber, normalizeContractNumber, parseLegacyQuotePiecesFromTokens} from './contractParser';

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

test('parser automatico reaproveita texto para filtrar somente pecas de marmoraria', () => {
  const tokens = [
    'ITEM QTD DESCRICAO AMBIENTE/ PRODUTO FORNECEDOR LINHA PRAZO VALOR',
    '1 1,00 COZINHA VITTA PLANEJADOS Cozinha 60 4.200,63',
    '2 1,00 BANCADA COZINHA DCORATTO SOB MEDIDA GRANITOS E 30 2.328,75',
    '3 1,00 LAVATORIO DCORATTO SOB MEDIDA GRANITOS E MARMORES 30 1.738,66',
    'Total do pedido: 8.268,04',
  ];

  const pieces = parseLegacyQuotePiecesFromTokens(tokens);

  assert.deepEqual(pieces, [
    {name: 'BANCADA COZINHA', value: 2328.75},
    {name: 'LAVATORIO', value: 1738.66},
  ]);
});
