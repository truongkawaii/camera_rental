const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultSlots, validateSlots, validWeek, selectionSnapshot, addDays } = require('../utils/photoboothSchedule');

test('schedule weeks remain Monday-based across year and leap day boundaries', () => {
  assert.equal(validWeek('2026-12-28'), true);
  assert.equal(addDays('2026-12-28', 6), '2027-01-03');
  assert.equal(validWeek('2026-10-25'), false);
  assert.equal(validWeek('2026-02-30'), false);
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('shift configuration rejects overnight, overlapping, malformed and duplicate slots', () => {
  assert.equal(validateSlots(defaultSlots), true);
  for (const slots of [null, [null, null, null], defaultSlots.map((s, i) => i === 1 ? { ...s, start: '12:00' } : s), defaultSlots.map((s, i) => i === 2 ? { ...s, end: '01:00' } : s), defaultSlots.map(s => ({ ...s, start: '25:00' })), [defaultSlots[0], defaultSlots[0], defaultSlots[2]]]) assert.equal(validateSlots(slots), false);
});
test('registration snapshots trusted hours and rejects duplicate or out-of-week cells', () => {
  const cell = { date: '2026-12-28', slot: 'morning', start: '00:00', end: '23:59', label: 'Injected' };
  assert.deepEqual(selectionSnapshot('2026-12-28', [cell], defaultSlots), [{ date: '2026-12-28', slot: 'morning', label: 'Ca sáng', start: '09:00', end: '13:00' }]);
  assert.throws(() => selectionSnapshot('2026-12-28', [cell, cell], defaultSlots));
  assert.throws(() => selectionSnapshot('2026-12-28', [{ ...cell, date: '2027-01-04' }], defaultSlots));
  assert.throws(() => selectionSnapshot('2026-12-28', [{ ...cell, slot: 'other' }], defaultSlots));
  assert.throws(() => selectionSnapshot('2026-12-28', [null], defaultSlots));
  assert.deepEqual(selectionSnapshot('2026-12-28', [], defaultSlots), []);
});
