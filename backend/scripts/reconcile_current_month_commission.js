// Reconcile stale direct commission lines for completed rentals in the current
// Vietnamese month. Read-only unless --apply is passed; never touches past months.
process.env.DB_AUTO_INIT = 'false';

const { pool } = require('../utils/db');
const { ensureCommissionSnapshotForCompletedRental } = require('../services/commissionService');

const APPLY = process.argv.includes('--apply');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const month = await client.query(`
      SELECT to_char(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month
    `);
    const monthStr = month.rows[0].month;
    const locked = await client.query(
      'SELECT 1 FROM payroll_snapshots WHERE month = $1 AND is_deleted = false LIMIT 1',
      [monthStr]
    );
    if (locked.rows.length > 0) {
      console.log(`Payroll ${monthStr} is locked; no commission rows changed.`);
      await client.query('ROLLBACK');
      return;
    }

    const stale = await client.query(`
      WITH current_rules AS (
        SELECT rsu.user_id, rsu.role_name, rs.rate_percent
        FROM commission_rule_set_users rsu
        JOIN commission_rule_sets rs ON rs.id = rsu.rule_set_id
        WHERE rsu.is_deleted = false
          AND rs.is_deleted = false
          AND rs.is_active = true
          AND (rs.effective_from IS NULL OR rs.effective_from <= NOW())
          AND (rs.effective_to IS NULL OR rs.effective_to >= NOW())
      ), expected AS (
        SELECT ren.id AS rental_id, cr.user_id, cr.role_name, cr.rate_percent,
               ROUND(ren.total_price * cr.rate_percent / 100, 2) AS commission_amount
        FROM rentals ren
        JOIN current_rules cr ON
          (cr.role_name = 'saler' AND cr.user_id = ren.user_id)
          OR (cr.role_name = 'driver' AND cr.user_id = ren.handover_user_id)
        WHERE ren.status = 'completed'
          AND ren.is_deleted = false
          AND ren.returned_at >= (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
          AND ren.returned_at < ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') + INTERVAL '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh')
      )
      SELECT DISTINCT e.rental_id
      FROM expected e
      LEFT JOIN rental_commission_ledger l
        ON l.rental_id = e.rental_id
       AND l.user_id = e.user_id
       AND l.source_role = e.role_name
       AND l.line_type = 'direct'
       AND l.is_deleted = false
      WHERE l.id IS NULL
         OR l.rate_percent IS DISTINCT FROM e.rate_percent
         OR l.commission_amount IS DISTINCT FROM e.commission_amount
      ORDER BY e.rental_id
    `);

    console.log(`${monthStr}: ${stale.rows.length} completed rental(s) need recalculation.`);
    if (!APPLY) {
      console.log('Dry run only. Pass --apply to update the current month.');
      await client.query('ROLLBACK');
      return;
    }

    for (const row of stale.rows) {
      await ensureCommissionSnapshotForCompletedRental(client, row.rental_id, null, { forceRecalc: true });
    }
    await client.query('COMMIT');
    console.log(`Recalculated ${stale.rows.length} rental(s) for ${monthStr}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(error => {
  console.error('Current-month commission reconciliation failed:', error);
  process.exitCode = 1;
});
