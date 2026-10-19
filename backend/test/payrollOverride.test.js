const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

test('editing an existing monthly override preserves its branch and saves successfully', async () => {
  const dbPath = require.resolve('../utils/db');
  const commissionPath = require.resolve('../services/commissionService');
  const loggerPath = require.resolve('../utils/logger');
  const routePath = require.resolve('../routes/payroll');
  const originals = [dbPath, commissionPath, loggerPath, routePath].map(path => require.cache[path]);
  const existing = { id: 9, user_id: 7, month: '2026-10', rate_percent: '15', bonus_amount: '100000', branch_id: null };
  let savedValues;
  let branchChecked;
  const client = {
    async query(sql, params) {
      if (sql.includes('FROM users u') && sql.includes("r.name = 'saler'")) return { rows: [{ '?column?': 1 }] };
      if (sql.includes('FROM payroll_snapshots')) return { rows: [] };
      if (sql.includes('FROM sale_monthly_commission_overrides') && sql.includes('SELECT id')) {
        const projected = { ...existing };
        if (!sql.includes('branch_id')) delete projected.branch_id;
        return { rows: [projected] };
      }
      if (sql.includes('SELECT id FROM branches')) {
        branchChecked = params[0];
        return { rows: Number(params[0]) === 5 ? [{ id: 5 }] : [] };
      }
      if (sql.includes('INSERT INTO sale_monthly_commission_overrides')) savedValues = params;
      return { rows: [] };
    },
    release() {}
  };

  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: { connect: async () => client } } };
  require.cache[commissionPath] = { id: commissionPath, filename: commissionPath, loaded: true, exports: {
    recalculateSalerMonthTier: async () => ({ recalculated: 0 })
  } };
  require.cache[loggerPath] = { id: loggerPath, filename: loggerPath, loaded: true, exports: { logActivity: async () => {} } };
  delete require.cache[routePath];

  const app = express();
  app.use(express.json());
  app.use('/api/payroll', require(routePath));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    process.env.JWT_SECRET = 'payroll-override-test';
    const token = jwt.sign({ id: 1, roles: ['admin'] }, process.env.JWT_SECRET);
    const save = async () => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/payroll/sale-override`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 7, month: '2026-10', rate_percent: 20, bonus_amount: 200000 })
      });
      assert.equal(response.status, 200, JSON.stringify(await response.json()));
    };

    await save();
    assert.equal(savedValues[4], null);
    assert.equal(branchChecked, undefined);

    existing.branch_id = 5;
    savedValues = undefined;
    await save();
    assert.equal(branchChecked, 5);
    assert.equal(savedValues[4], 5);
  } finally {
    await new Promise(resolve => server.close(resolve));
    [dbPath, commissionPath, loggerPath, routePath].forEach((path, index) => {
      if (originals[index]) require.cache[path] = originals[index];
      else delete require.cache[path];
    });
  }
});
