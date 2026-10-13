// One-off: recalculate commission per sales-tier policy for one month.
// Usage: node recalc_tier_month.js 2026-10
const { pool } = require('./utils/db');
const { recalculateSalerMonthTier } = require('./services/commissionService');
const { getMonthRange, isTierMonth } = require('./services/salesTierService');

async function run() {
  const month = process.argv[2];
  if (!isTierMonth(month)) {
    console.error('Invalid month or before 2026-10. Example: node recalc_tier_month.js 2026-10');
    process.exit(1);
  }
  const { start, end } = getMonthRange(month);
  const client = await pool.connect();
  try {
    const users = await client.query(
      `SELECT DISTINCT user_id FROM rentals
       WHERE status = 'completed' AND is_deleted = false
         AND returned_at >= $1 AND returned_at < $2 AND user_id IS NOT NULL`,
      [start, end]
    );
    let total = 0;
    for (const row of users.rows) {
      await client.query('BEGIN');
      const result = await recalculateSalerMonthTier(client, row.user_id, month, null);
      await client.query('COMMIT');
      total += result.recalculated;
      console.log(`user ${row.user_id}: ${result.recalculated} rentals`);
    }
    console.log(`Done. Recalculated ${total} rentals for ${month}.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
run();
