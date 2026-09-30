import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addBusinessDays, businessDaysBetween, calculateStructuredDeadlines, canFinalize, canRegisterInstallation, canRegisterPieceInstallation, canScheduleInstallation, canScheduleMeasurement, deadlineStatus, filterOperationalBoard, isBusinessDay, isNormalStageMove, safeDriveUrl, stages, stageTargets} from './operationalDomain';
import type {OperationalBoard, OperationalCard} from './operational';
import {isMasonryContractItem} from './masonryContractItems';

test('business days skip weekends and existing national/municipal holidays', () => {
  assert.equal(addBusinessDays('2026-09-18', 1), '2026-09-21');
  assert.equal(addBusinessDays('2026-09-04', 1), '2026-09-08');
  assert.equal(addBusinessDays('2026-09-04', 1, 'Itaquaquecetuba'), '2026-09-09');
  assert.equal(addBusinessDays('2026-04-02', 1), '2026-04-06');
  assert.equal(isBusinessDay(new Date('2026-09-20T12:00:00')), false);
});
test('remaining/overdue business days and configurable thresholds', () => {
  assert.equal(businessDaysBetween('2026-09-18', '2026-09-23'), 3);
  assert.equal(businessDaysBetween('2026-09-23', '2026-09-18'), -3);
  assert.equal(deadlineStatus(null, 5, 2), 'none');
  assert.equal(deadlineStatus(-1, 5, 2), 'late');
  assert.equal(deadlineStatus(2, 5, 2), 'urgent');
  assert.equal(deadlineStatus(5, 5, 2), 'attention');
  assert.equal(deadlineStatus(6, 5, 2), 'normal');
});
test('structured deadlines use explicit signature dates as calculation bases', () => {
  const deadlines = calculateStructuredDeadlines({
    contract_signed_on: '2026-09-18',
    executive_budget_days: 3,
    executive_signed_on: '2026-09-23',
    production_budget_days: 2,
  });
  assert.equal(deadlines.executive_due_date, '2026-09-23');
  assert.equal(deadlines.production_due_date, '2026-09-25');
  assert.deepEqual(calculateStructuredDeadlines({executive_budget_days: 10, production_budget_days: 5}), {executive_due_date: null, production_due_date: null});
});
test('Drive only accepts existing Google HTTPS links, never executable URLs', () => {
  assert.equal(safeDriveUrl('https://drive.google.com/drive/folders/example'), 'https://drive.google.com/drive/folders/example');
  assert.equal(safeDriveUrl('javascript:alert(1)'), null);
  assert.equal(safeDriveUrl('https://drive.google.com.attacker.test/'), null);
  assert.equal(safeDriveUrl(''), null);
});
test('stable states keep completed as normal closure and aftercare separate', () => {
  assert.equal(new Set(stages.map(([id]) => id)).size, 14);
  assert.equal(stages[12][0], 'completed');
  assert.equal(stages[13][0], 'aftercare');
});
test('operational actions and stage targets are contextual', () => {
  assert.equal(canScheduleMeasurement('sold'), true);
  assert.equal(canScheduleInstallation('sold'), false);
  assert.equal(canRegisterInstallation('sold'), false);
  assert.equal(canRegisterInstallation('installation'), true);
  assert.equal(canRegisterPieceInstallation('sold', 'installation'), true);
  assert.equal(canRegisterPieceInstallation('sold', 'sold'), false);
  assert.equal(canRegisterPieceInstallation('installation', 'sold'), true);
  assert.equal(canFinalize('installation', 2, 3), false);
  assert.equal(canFinalize('installation', 3, 3), true);
  assert.equal(stageTargets('sold').includes('completed'), true);
  assert.equal(stageTargets('sold').includes('aftercare'), false);
  assert.equal(stageTargets('installation').includes('completed'), true);
  assert.equal(isNormalStageMove('sold', 'measurement'), true);
  assert.equal(isNormalStageMove('sold', 'cutting'), false);
  assert.equal(isNormalStageMove('inspection', 'finishing'), false);
});
test('canonical masonry classifier excludes furniture and VITTA', () => {
  assert.equal(isMasonryContractItem({supplier: 'DCORATTO SOB MEDIDA', line: 'GRANITOS E MARMORES'}), true);
  assert.equal(isMasonryContractItem({supplier: 'VITTA PLANEJADOS', line: 'GRANITOS E MARMORES'}), false);
  assert.equal(isMasonryContractItem({supplier: 'DCORATTO SOB MEDIDA', line: 'MOVEIS PLANEJADOS'}), false);
});
test('cached filters preserve global indicators and multiple contracts for the same client', () => {
  const base: OperationalCard = {contract_id: 'a', client_id: 'one', client_name: 'Cliente Único', contract_number: '001', stage: 'measurement', priority: 'normal', version: 0, piece_count: 2, installed_count: 0, dependent_count: 0, blocked: false, due_date: '2026-09-18', remaining_days: -1, paused: false, measurement_date: '2026-09-17', measurement_time: null, installation_date: null, installation_time: null};
  const board: OperationalBoard = {cards: [base, {...base, contract_id: 'b', contract_number: '002', stage: 'completed'}, {...base, contract_id: 'c', contract_number: '003', priority: 'urgent', remaining_days: 5, dependent_count: 1}], total: 3, settings: {executive_days: 15, installation_days: 25, attention_days: 5, urgent_days: 2}, indicators: {ongoing: 2, late: 1}};
  assert.equal(filterOperationalBoard(board, {}).total, 2);
  assert.equal(filterOperationalBoard(board, {search: 'unico'}).total, 2);
  assert.equal(filterOperationalBoard(board, {search: '002', completed: true}).cards[0].contract_id, 'b');
  assert.equal(filterOperationalBoard(board, {priority: 'urgent'}).total, 1);
  assert.equal(filterOperationalBoard(board, {situation: 'late'}).total, 1);
  assert.equal(filterOperationalBoard(board, {situation: 'blocked'}).total, 1);
  assert.equal(filterOperationalBoard(board, {situation: 'measurement'}, new Date('2026-09-17T12:00:00')).total, 2);
  assert.equal(filterOperationalBoard(board, {stage: 'completed'}).total, 1);
  assert.deepEqual(filterOperationalBoard(board, {priority: 'urgent'}).indicators, board.indicators);
});
