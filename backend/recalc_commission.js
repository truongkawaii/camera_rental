const pool = require('./db');
const { ensureCommissionSnapshotForCompletedRental } = require('./services/commissionService');

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT id FROM rentals WHERE status = 'completed' AND is_deleted = false");
    let count = 0;
    for (let row of res.rows) {
      await ensureCommissionSnapshotForCompletedRental(client, row.id, 1, { forceRecalc: true });
      count++;
    }
    console.log(`Recalculated ${count} rentals.`);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}
run();
