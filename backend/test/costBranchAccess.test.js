const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.DB_AUTO_INIT = 'false';
const { pool } = require('../utils/db');
const { costBranchAccess, branchTotals } = require('../services/costBranchAccess');
test('branch costs restrict investor scope and include automatic bonuses in scoped totals', async () => {
  const original = pool.query;
  const tierPath = require.resolve('../services/salesTierService');
  const savedTier = require.cache[tierPath];
  require.cache[tierPath] = { id: tierPath, filename: tierPath, loaded: true, exports: { getBonusMiscRows: async () => [{ id: 'own-bonus', branch_id: 1, amount: 50 }, { id: 'foreign-bonus', branch_id: 2, amount: 900 }] } };
  const all = [{ id: 1, branch_id: 1, amount: '100' }, { id: 2, branch_id: 2, amount: '900' }, { id: 3, branch_id: null, amount: '20' }];
  pool.query = async (sql, values = []) => {
    if (sql.includes('SELECT b.id,b.name')) {
      if (sql.includes('EXISTS')) { assert.ok(sql.includes('e.owner_id=$1')); assert.ok(sql.includes('e.is_deleted=false')); return { rows: Number(values[0]) === 7 ? [{ id: 1, name: 'Cơ sở A' }] : [] }; }
      return { rows: [{ id: 1, name: 'Cơ sở A' }, { id: 2, name: 'Cơ sở B' }] };
    }
    if (sql.includes('FROM misc_costs') || sql.includes('FROM ads_costs')) return { rows: values.length === 3 ? all.filter(row => values[2].includes(row.branch_id)) : all };
    throw new Error(`Unexpected query: ${sql}`);
  };
  const app = express(); app.use(express.json());
  app.use('/misc', require('../routes/miscCosts')); app.use('/ads', require('../routes/adsCosts'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  async function call(path, role='investor', id=7, method='GET') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${jwt.sign({ id, roles: [role] }, process.env.JWT_SECRET || 'fallback_secret')}` } });
    return { status: response.status, data: await response.json() };
  }
  try {
    for (const path of ['/misc', '/ads']) {
      const own = await call(`${path}?month=2026-11`);
      assert.equal(own.status, 200);
      assert.deepEqual(own.data.branches.map(b=>b.id), [1]);
      assert.ok((own.data.misc_costs || own.data.ads_costs).every(row => row.branch_id === 1));
      assert.equal((await call(`${path}?branch_id=2`)).status, 403);
      assert.equal((await call(`${path}?branch_id=invalid`)).status, 400);
      assert.deepEqual((await call(path, 'investor', 8)).data[path === '/misc' ? 'misc_costs' : 'ads_costs'], []);
      assert.equal((await call(path, 'saler')).status, 403);
      assert.equal((await call(path, 'investor', 7, 'POST')).status, 403);
      const admin = await call(path, 'admin');
      assert.ok((admin.data.misc_costs || admin.data.ads_costs).some(row => row.branch_id === 2));
      const filtered = await call(`${path}?branch_id=1`, 'admin');
      assert.ok((filtered.data.misc_costs || filtered.data.ads_costs).every(row => row.branch_id === 1));
    }
    const misc = (await call('/misc')).data;
    assert.equal(misc.total_misc_cost, 150);
    assert.equal(misc.branch_totals[0].amount, 150);
    assert.equal((await call('/ads')).data.total_ads_cost, 100);
    assert.equal(branchTotals([{ branch_id:null, amount:10 }], [])[0].branch_name,'Chưa gắn cơ sở');
    const scope = await costBranchAccess(pool, { id:7, roles:['admin','investor'], activeRole:'investor' });
    assert.deepEqual(scope.ids,[1]);
  } finally { pool.query=original; if(savedTier) require.cache[tierPath]=savedTier; else delete require.cache[tierPath]; await new Promise(resolve=>server.close(resolve)); }
});
