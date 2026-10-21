const test = require('node:test');
const assert = require('node:assert/strict');

test('Photobooth order, drawer and finance stay separate from camera rentals', { skip: !process.env.PB_TEST_DATABASE_URL }, async () => {
  const testDb = new URL(process.env.PB_TEST_DATABASE_URL);
  assert.equal(testDb.hostname, '127.0.0.1', 'Integration test only accepts a local disposable database');
  assert.equal(testDb.port, '55439', 'Integration test only accepts the dedicated temporary PostgreSQL port');
  process.env.DB_AUTO_INIT = 'false';
  process.env.DATABASE_URL = process.env.PB_TEST_DATABASE_URL;
  const jwt = require('jsonwebtoken');
  const { pool } = require('../utils/db');
  const app = require('../app');
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/photobooth`;
  const authorization = `Bearer ${jwt.sign({ id: 1, role: 'admin', roles: ['admin'] }, process.env.JWT_SECRET || 'fallback_secret')}`;
  async function call(path, method = 'GET', data) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
    const value = await response.json();
    assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(value)}`);
    return value;
  }
  try {
    await pool.query('TRUNCATE pb_services,pb_gifts,pb_assets,pb_staff,pb_shifts,pb_tasks,pb_incidents,pb_transactions,pb_gift_movements,pb_cash_movements,pb_cash_closures,pb_expenses RESTART IDENTITY');
    const before = (await pool.query('SELECT count(*)::int AS count FROM rentals')).rows[0].count;
    const service = await call('/services', 'POST', { name: 'Chụp khổ dọc', category: 'shoot', price: 70000 });
    const gift = await call('/gifts', 'POST', { name: 'Gấu bông', low_stock_threshold: 1 });
    await call(`/gifts/${gift.id}/adjust`, 'POST', { delta: 2, reason: 'Nhập đầu kỳ' });
    const order = await call('/transactions', 'POST', { sale_date: '2026-10-21', service_id: service.id, quantity: 1, unit_price: 70000, discount_amount: 10000, cash_received: 50000, transfer_received: 30000, customer_name: 'Minh', customer_phone: '0912345678', marketing_consent: true, gift_id: gift.id, gift_quantity: 1 });
    assert.equal(Number(order.total_amount), 60000);
    assert.equal(Number(order.cash_in_drawer), 30000);
    assert.equal(Number(order.change_amount), 20000);
    assert.equal((await call('/cash?date=2026-10-21')).summary.expected, 30000);
    await call('/cash/movements', 'POST', { movement_date: '2026-10-21', type: 'opening', amount: 20000 });
    assert.equal((await call('/cash?date=2026-10-21')).summary.expected, 50000);
    const closure = await call('/cash/closures', 'POST', { close_date: '2026-10-21', actual_amount: 48000 });
    assert.equal(Number(closure.difference_amount), -2000);
    for (const [category, amount] of [['other', 10000], ['ads', 5000], ['rent', 20000]]) await call('/expenses', 'POST', { expense_date: '2026-10-21', category, amount, note: category, payment_method: 'transfer' });
    const finance = await call('/finance?month=2026-10');
    assert.equal(finance.totals.revenue, 60000);
    assert.equal(finance.totals.expense, 35000);
    assert.equal(finance.totals.profit, 25000);
    assert.equal(finance.totals.cash, 30000);
    assert.equal(finance.totals.transfer, 30000);
    assert.equal(finance.daily[0].day, '2026-10-21');
    assert.equal((await call('/customers'))[0].marketing_consent, true);
    const report = await call('/reports?from=2026-10-21&to=2026-10-21');
    assert.equal(report.daily[0].revenue, 60000);
    await call(`/transactions/${order.id}/void`, 'POST', { reason: 'Đơn thử nghiệm' });
    assert.equal((await call('/finance?month=2026-10')).totals.revenue, 0);
    assert.equal((await call('/cash?date=2026-10-21')).summary.expected, 20000);
    assert.equal(Number((await call('/gifts')).find(item => item.id === gift.id).quantity), 2);
    const backup = await call('/backup');
    assert.equal(backup.type, 'snappro-photobooth-backup');
    assert.ok(backup.data.pb_transactions.length > 0);
    assert.equal(backup.data.pb_transactions[0].sale_date, '2026-10-21');
    await call('/restore', 'POST', backup);
    assert.equal((await call('/transactions?date=2026-10-21')).length, backup.data.pb_transactions.length);
    const invalid = structuredClone(backup);
    invalid.data.pb_services[0].unknown_column = 'invalid';
    const rejected = await fetch(`${base}/restore`, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(invalid) });
    assert.equal(rejected.status, 400);
    assert.equal((await call('/transactions?date=2026-10-21')).length, backup.data.pb_transactions.length);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM rentals')).rows[0].count, before);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});
