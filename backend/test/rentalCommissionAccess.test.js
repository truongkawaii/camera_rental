const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
process.env.DB_AUTO_INIT = 'false';

test('sales cannot preview new rental commissions, including when admin switches to sales', async () => {
  const paths = ['../utils/db', '../services/commissionService', '../routes/rentals'].map(require.resolve);
  const previous = paths.map(path => require.cache[path]);
  let previews = 0;
  let queries = 0;
  require.cache[paths[0]] = { id: paths[0], filename: paths[0], loaded: true, exports: { pool: {
    async query(_sql, values) { queries++; return { rows: Number(values[0]) === 10 ? [{ inserted_by: 7 }] : Number(values[0]) === 11 ? [{ inserted_by: 8 }] : [] }; }
  } } };
  require.cache[paths[1]] = { id: paths[1], filename: paths[1], loaded: true, exports: {
    async calculateCommissionPreview() { previews++; return { grand_total_commission: 15000 }; }
  } };
  delete require.cache[paths[2]];
  const app = express();
  app.use(express.json());
  app.use('/rentals', require('../routes/rentals'));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const url = `http://127.0.0.1:${server.address().port}/rentals/commission-preview`;
  async function request(roles, rentalId, activeRole) {
    return fetch(url, { method: 'POST', headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt.sign({ id: 7, roles }, process.env.JWT_SECRET || 'fallback_secret')}`,
      ...(activeRole ? { 'X-Active-Role': activeRole } : {})
    }, body: JSON.stringify({ total_price: 100000, rental_id: rentalId }) });
  }
  try {
    assert.equal((await request(['saler'])).status, 403);
    assert.equal((await request(['admin', 'saler'], undefined, 'saler')).status, 403);
    assert.equal(previews, 0);
    assert.equal(queries, 0);
    assert.equal((await request(['saler'], 11)).status, 403);
    assert.equal((await request(['saler'], 999)).status, 403);
    assert.equal((await request(['saler'], 10)).status, 200, 'existing creator access is preserved');
    assert.equal((await request(['admin'])).status, 200);
    assert.equal((await request(['admin', 'saler'], undefined, 'admin')).status, 200);
    assert.equal((await request(['camera_manager'])).status, 200);
    assert.equal(previews, 4);
  } finally {
    await new Promise(resolve => server.close(resolve));
    paths.forEach((path, index) => { if (previous[index]) require.cache[path] = previous[index]; else delete require.cache[path]; });
  }
});
