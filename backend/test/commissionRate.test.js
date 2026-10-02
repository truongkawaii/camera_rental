const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const {
  calculateCommissionPreview,
  recalculateCurrentMonthCommissions
} = require('../services/commissionService');

test('commission preview changes from 30% to 15% and records an assigned 0% rate', async () => {
  let rate = 30;
  const client = {
    async query(sql) {
      if (sql.includes('FROM commission_rule_set_users rsu')) {
        return { rows: [{ id: 1, name: 'Sale', rate_percent: rate }] };
      }
      if (sql.includes('FROM collaborator_hierarchy')) return { rows: [] };
      if (sql.includes('FROM users WHERE id = ANY')) return { rows: [{ id: 7, full_name: 'Sale' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const preview = () => calculateCommissionPreview(client, { total_price: 1000, user_id: 7 });
  assert.equal((await preview()).lines[0].commission_amount, 300);
  rate = 15;
  assert.equal((await preview()).lines[0].commission_amount, 150);
  rate = 0;
  const zero = await preview();
  assert.equal(zero.lines[0].commission_amount, 0);
  assert.equal(zero.lines[0].line_type, 'direct');
});

test('unassigned employee gets a zero ledger line instead of legacy payroll fallback', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('FROM commission_rule_set_users rsu')) return { rows: [] };
      if (sql.includes('FROM users WHERE id = ANY')) return { rows: [{ id: 7, full_name: 'Sale' }] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const preview = await calculateCommissionPreview(client, { total_price: 1000, user_id: 7 });
  assert.equal(preview.lines.length, 1);
  assert.equal(preview.lines[0].commission_amount, 0);
  assert.equal(preview.lines[0].rate_percent, 0);
});

test('current-month selection uses completed date in Vietnam and respects locked payroll', async () => {
  let rentalQuery = '';
  let insertedLine = null;
  const client = {
    async query(sql, params) {
      if (sql.includes('FROM payroll_snapshots')) return { rows: [] };
      if (sql.includes('SELECT DISTINCT ren.id')) {
        rentalQuery = sql;
        return { rows: [{ id: 3 }] };
      }
      if (sql.includes('SELECT id, status, total_price, user_id, handover_user_id')) {
        assert.equal(params[0], 3);
        return { rows: [{ id: 3, status: 'completed', total_price: 1000, user_id: 7, handover_user_id: null }] };
      }
      if (sql.includes('SELECT COUNT(*)::int AS count')) return { rows: [{ count: 1 }] };
      if (sql.includes('FROM commission_rule_set_users rsu')) return { rows: [{ id: 1, name: 'Sale', rate_percent: 15 }] };
      if (sql.includes('FROM collaborator_hierarchy')) return { rows: [] };
      if (sql.includes('FROM users WHERE id = ANY')) return { rows: [{ id: 7, full_name: 'Sale' }] };
      if (sql.includes('INSERT INTO rental_commission_ledger')) insertedLine = params;
      return { rows: [] };
    }
  };
  assert.deepEqual(
    await recalculateCurrentMonthCommissions(client, [7], 'saler', 1),
    { recalculated: 1, skippedLocked: false }
  );
  assert.equal(insertedLine[0], 3);
  assert.equal(insertedLine[4], 15);
  assert.equal(insertedLine[6], 150);
  assert.match(rentalQuery, /ren\.returned_at >= .*Asia\/Ho_Chi_Minh/);
  assert.match(rentalQuery, /ren\.returned_at < .*INTERVAL '1 month'/);
  assert.doesNotMatch(rentalQuery, /inserted_at/);

  const lockedClient = { async query() { return { rows: [{ id: 1 }] }; } };
  assert.deepEqual(
    await recalculateCurrentMonthCommissions(lockedClient, [7], 'saler', 1),
    { recalculated: 0, skippedLocked: true }
  );
});

test('saving a saler rate recalculates assigned users before commit', async () => {
  const dbPath = require.resolve('../utils/db');
  const servicePath = require.resolve('../services/commissionService');
  const loggerPath = require.resolve('../utils/logger');
  const routePath = require.resolve('../routes/commissionConfigs');
  const original = [dbPath, servicePath, loggerPath, routePath].map(path => require.cache[path]);
  const queries = [];
  let recalculatedUsers = null;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql.includes('SELECT rate_percent, name, rule_type')) {
        return { rows: [{ rate_percent: '30', name: 'Sale', rule_type: 'saler', is_effective_now: true }] };
      }
      if (sql.includes('UPDATE commission_rule_sets')) {
        return { rows: [{ id: 1, name: 'Sale', rule_type: 'saler', rate_percent: '15' }] };
      }
      if (sql.includes('SELECT user_id FROM commission_rule_set_users')) return { rows: [{ user_id: 7 }] };
      return { rows: [] };
    },
    release() {}
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { connect: async () => client } } };
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
    recalculateCurrentMonthCommissions: async (_client, userIds) => {
      recalculatedUsers = userIds;
      return { recalculated: 2, skippedLocked: false };
    }
  } };
  require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { logActivity: async () => {} } };
  delete require.cache[routePath];

  const app = express();
  app.use(express.json());
  app.use('/api/commission-configs', require(routePath));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    process.env.JWT_SECRET = 'commission-test-secret';
    const token = jwt.sign({ id: 1, roles: ['admin'] }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/commission-configs/1/rates`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ saler: 15 })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).recalculated_rentals, 2);
    assert.deepEqual(recalculatedUsers, [7]);
    assert.ok(queries.indexOf('COMMIT') > queries.findIndex(sql => sql.includes('SELECT user_id FROM commission_rule_set_users')));
  } finally {
    await new Promise(resolve => server.close(resolve));
    [dbPath, servicePath, loggerPath, routePath].forEach((path, index) => {
      if (original[index]) require.cache[path] = original[index];
      else delete require.cache[path];
    });
  }
});

test('moving an employee between rule sets recalculates current month in the same transaction', async () => {
  const dbPath = require.resolve('../utils/db');
  const servicePath = require.resolve('../services/commissionService');
  const loggerPath = require.resolve('../utils/logger');
  const routePath = require.resolve('../routes/commissionConfigs');
  const original = [dbPath, servicePath, loggerPath, routePath].map(path => require.cache[path]);
  const queries = [];
  const recalculations = [];
  const client = {
    async query(sql, params) {
      queries.push(sql);
      if (sql.includes('SELECT id, name, rule_type FROM commission_rule_sets')) return { rows: [{ id: 3, name: '15%', rule_type: 'saler' }] };
      if (sql.includes('SELECT id, username FROM users')) return { rows: [{ id: 7, username: 'tung' }] };
      if (sql.includes('SELECT rsu.rule_set_id')) return { rows: [{ rule_set_id: 1, old_rule_set_name: '30%' }] };
      return { rows: [] };
    },
    release() {}
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { connect: async () => client } } };
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: {
    recalculateCurrentMonthCommissions: async (_client, userIds, roleName) => {
      recalculations.push({ userIds, roleName, queryCount: queries.length });
      return { recalculated: 1, skippedLocked: false };
    }
  } };
  require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { logActivity: async () => {} } };
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use('/api/commission-configs', require(routePath));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    process.env.JWT_SECRET = 'commission-test-secret';
    const token = jwt.sign({ id: 1, roles: ['admin'] }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/commission-configs/3/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 7, role_name: 'saler' })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).recalculated_rentals, 1);
    assert.deepEqual(recalculations.map(({ userIds, roleName }) => ({ userIds, roleName })), [{ userIds: [7], roleName: 'saler' }]);
    assert.ok(queries.findIndex(sql => sql.includes('INSERT INTO commission_rule_set_users')) < recalculations[0].queryCount);
    assert.equal(queries.slice(0, recalculations[0].queryCount).includes('COMMIT'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    [dbPath, servicePath, loggerPath, routePath].forEach((path, index) => {
      if (original[index]) require.cache[path] = original[index];
      else delete require.cache[path];
    });
  }
});
