const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.DB_AUTO_INIT = 'false';
const { pool } = require('../utils/db');
const router = require('../routes/photobooth');
const express = require('express');

function token(role) {
  return jwt.sign({ id: 1, role, roles: [role] }, process.env.JWT_SECRET || 'fallback_secret');
}

async function withServer(callback) {
  const app = express();
  app.use(express.json());
  app.use('/api/photobooth', router);
  const server = app.listen(0);
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('Photobooth API rejects unauthenticated and ungranted investor requests', async () => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rowCount: 0, rows: [] });
  try {
    await withServer(async base => {
      const anonymous = await fetch(`${base}/api/photobooth/services`);
      assert.equal(anonymous.status, 401);
      const investor = await fetch(`${base}/api/photobooth/services`, { headers: { Authorization: `Bearer ${token('investor')}` } });
      assert.equal(investor.status, 403);
    });
  } finally { pool.query = originalQuery; }
});

test('sale snapshots the selected unit price and moves gift stock atomically', async () => {
  const originalConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async (sql, values = []) => {
      queries.push({ sql, values });
      if (sql.includes('FROM pb_cash_closures')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT * FROM pb_services')) return { rows: [{ id: 7, name: 'In ảnh', category: 'print', price: '35000' }] };
      if (sql.startsWith('SELECT 1 FROM pb_staff')) return { rowCount: 1 };
      if (sql.startsWith('UPDATE pb_gifts')) return { rowCount: 1 };
      if (sql.startsWith('INSERT INTO pb_transactions')) return { rows: [{ id: 91, total_amount: '70000' }] };
      return { rows: [], rowCount: 1 };
    },
    release: () => {}
  });
  try {
    await withServer(async base => {
      const response = await fetch(`${base}/api/photobooth/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('admin')}` },
        body: JSON.stringify({ service_id: 7, quantity: 2, payment_method: 'cash', unit_price: 35000, total_amount: 2, gift_id: 3, gift_quantity: 1 })
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).total_amount, '70000');
    });
    const insert = queries.find(item => item.sql.startsWith('INSERT INTO pb_transactions'));
    assert.equal(insert.values[4], 35000);
    assert.equal(insert.values[5], 70000);
    assert.equal(insert.values[17], 70000);
    assert.equal(insert.values[19], 70000);
    assert.ok(queries.some(item => item.sql.startsWith('UPDATE pb_gifts')));
    assert.ok(queries.some(item => item.sql.startsWith('INSERT INTO pb_gift_movements')));
    assert.equal(queries.at(-1).sql, 'COMMIT');
    assert.ok(queries.every(item => !/\b(rentals|equipment|payroll)\b/i.test(item.sql)));
  } finally { pool.connect = originalConnect; }
});

test('insufficient gifts rolls back the sale without inserting revenue', async () => {
  const originalConnect = pool.connect;
  const queries = [];
  pool.connect = async () => ({
    query: async sql => {
      queries.push(sql);
      if (sql.includes('FROM pb_cash_closures')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT * FROM pb_services')) return { rows: [{ id: 7, name: 'Chụp ảnh', category: 'shoot', price: '50000' }] };
      if (sql.startsWith('UPDATE pb_gifts')) return { rowCount: 0 };
      return { rowCount: 1, rows: [] };
    },
    release: () => {}
  });
  try {
    await withServer(async base => {
      const response = await fetch(`${base}/api/photobooth/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('admin')}` },
        body: JSON.stringify({ service_id: 7, quantity: 1, payment_method: 'cash', gift_id: 3, gift_quantity: 2 })
      });
      assert.equal(response.status, 400);
    });
    assert.equal(queries.at(-1), 'ROLLBACK');
    assert.ok(!queries.some(sql => sql.startsWith('INSERT INTO pb_transactions')));
  } finally { pool.connect = originalConnect; }
});

test('split payment and discount reconcile cash without treating change as revenue', async () => {
  const originalConnect = pool.connect;
  let inserted;
  pool.connect = async () => ({
    query: async (sql, values = []) => {
      if (sql.includes('FROM pb_cash_closures')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT * FROM pb_services')) return { rows: [{ id: 7, name: 'Chụp ảnh', category: 'shoot', price: '35000' }] };
      if (sql.startsWith('INSERT INTO pb_transactions')) { inserted = values; return { rows: [{ id: 92, total_amount: '60000' }] }; }
      return { rowCount: 1, rows: [] };
    },
    release: () => {}
  });
  try {
    await withServer(async base => {
      const response = await fetch(`${base}/api/photobooth/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token('admin')}` },
        body: JSON.stringify({ service_id: 7, quantity: 2, unit_price: 35000, discount_amount: 10000, cash_received: 50000, transfer_received: 30000, sale_date: '2026-10-21', customer_name: 'Minh', customer_phone: '0912345678', marketing_consent: true })
      });
      assert.equal(response.status, 201);
    });
    assert.equal(inserted[5], 60000);
    assert.equal(inserted[6], 'mixed');
    assert.equal(inserted[17], 50000);
    assert.equal(inserted[18], 30000);
    assert.equal(inserted[19], 30000);
    assert.equal(inserted[20], 20000);
    assert.equal(inserted[22], true);
  } finally { pool.connect = originalConnect; }
});


test('daily drawer uses one opening and includes cash across every shift', async () => {
  const originalQuery = pool.query;
  pool.query = async sql => {
    if (sql.includes('SELECT amount FROM pb_cash_movements')) return { rows: [{ amount: 50000 }], rowCount: 1 };
    if (sql.includes('GROUP BY type')) return { rows: [{ type: 'opening', amount: 139000 }, { type: 'in', amount: 5000 }, { type: 'out', amount: 2000 }] };
    if (sql.includes('SUM(cash_in_drawer)')) return { rows: [{ amount: 30000 }] };
    if (sql.includes('SUM(amount)')) return { rows: [{ amount: 10000 }] };
    return { rows: [], rowCount: 0 };
  };
  const app = express();
  app.use('/finance', require('../routes/photoboothFinance'));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/finance/cash?date=2026-10-22`, { headers: { Authorization: `Bearer ${token('admin')}` } });
    assert.equal(response.status, 200);
    const { summary } = await response.json();
    assert.equal(summary.opening, 50000);
    assert.equal(summary.expected, 93000);
    assert.equal(summary.balance, 93000);
    assert.equal(summary.balanceShift, null);
  } finally {
    pool.query = originalQuery;
    await new Promise(resolve => server.close(resolve));
  }
});
