import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMasonryContractItem,
  parseHistoricalContractItemsFromText,
  sumMasonryPieces,
  toMasonryPieces,
} from './masonryContractItems';

const mixedContractText = `
ITEM QTD DESCRICAO AMBIENTE/ PRODUTO FORNECEDOR LINHA PRAZO VALOR
1 1,00 CJ-ADEGA VITTA PLANEJADOS Cozinha 60 4.200,63
2 1,00 CK-PAINEL GARAGEM VITTA PLANEJADOS Area de Servico 60 7.529,24
3 1,00 CL-SALA VITTA PLANEJADOS Sala de Estar 60 9.425,35
4 1,00 CM-COZINHA VITTA PLANEJADOS Cozinha 60 25.736,33
5 1,00 CN-CHAPELARIA VITTA PLANEJADOS Sala de Estar 60 1.482,80
6 1,00 CO-CINEMA VITTA PLANEJADOS Home Cinema 60 2.356,67
7 1,00 CP-ESCRITORIO VITTA PLANEJADOS Home Office 60 7.570,62
8 1,00 CQ-DORMITORIO FUNDO VITTA PLANEJADOS Dormitorio Solteiro 60 25.498,77
9 1,00 CR-WC FUNDO VITTA PLANEJADOS Banheiros 60 1.145,29
10 1,00 CS-DORMITORIO 1 VITTA PLANEJADOS Dormitorio Solteiro 60 19.233,28
11 1,00 CT-WC DORM 1 VITTA PLANEJADOS Banheiros 60 1.058,17
12 1,00 CU-DORMITORIO MASTER VITTA PLANEJADOS Dormitorio Casal 60 27.919,60
13 1,00 CV-WC MASTER VITTA PLANEJADOS Banheiros 60 1.985,63
14 1,00 CW-WC ESCRITORIO VITTA PLANEJADOS Banheiros 60 955,93
15 1,00 CX-GOURMET VITTA PLANEJADOS Area Gourmet 60 8.775,28
16 1,00 CY-BANCADA WC MASTER DCORATTO SOB MEDIDA GRANITOS E 30 2.328,75
17 1,00 CZ-BANCADA WC DORM 1 DCORATTO SOB MEDIDA GRANITOS E 30 1.738,66
18 1,00 DA-BANCADA WC DORM FUNDO DCORATTO SOB MEDIDA GRANITOS E 30 1.844,04
19 1,00 DB-COMPLEMENTO COZ DCORATTO SOB MEDIDA GRANITOS E 30 2.370,91
20 1,00 DC-BANCADA WC ESCRITORIO DCORATTO SOB MEDIDA GRANITOS E 30 1.844,05
Total do pedido: 155.000,00
`;

test('filtra contrato misto mantendo somente itens de marmoraria', () => {
  const items = parseHistoricalContractItemsFromText(mixedContractText);
  const masonryPieces = toMasonryPieces(items);

  assert.equal(items.length, 20);
  assert.equal(masonryPieces.length, 5);
  assert.equal(sumMasonryPieces(masonryPieces), 10126.41);
  assert.deepEqual(masonryPieces.map((piece) => piece.label), [
    'CY-BANCADA WC MASTER',
    'CZ-BANCADA WC DORM 1',
    'DA-BANCADA WC DORM FUNDO',
    'DB-COMPLEMENTO COZ',
    'DC-BANCADA WC ESCRITORIO',
  ]);
});

test('nao classifica VITTA PLANEJADOS como item de marmoraria', () => {
  assert.equal(isMasonryContractItem({
    supplier: 'VITTA PLANEJADOS',
    line: 'Banheiros',
  }), false);
});
