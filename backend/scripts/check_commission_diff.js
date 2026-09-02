const { pool } = require('../utils/db');

async function main() {
  const start = '2026-07-01T00:00:00+07:00';
  const end = '2026-08-01T00:00:00+07:00';
  const startISO = new Date(start).toISOString();
  const endISO = new Date(end).toISOString();

  console.log('Date range:', startISO, '->', endISO);

  // 1) Tổng doanh thu completed rentals
  const r1 = await pool.query(
    `SELECT COUNT(*)::int as rentals, COALESCE(SUM(total_price),0)::numeric as total_revenue
     FROM rentals WHERE status='completed' AND is_deleted=false
     AND returned_at >= $1::timestamptz AND returned_at < $2::timestamptz`,
    [startISO, endISO]
  );
  console.log('Completed rentals:', r1.rows[0]);

  // 2) Tổng commission từ ledger
  const r2 = await pool.query(
    `SELECT COUNT(*)::int as ledger_count, COALESCE(SUM(commission_amount),0)::numeric as total_commission
     FROM rental_commission_ledger l
     JOIN rentals r ON r.id = l.rental_id
     WHERE l.is_deleted = false AND r.status = 'completed' AND r.is_deleted = false
     AND r.returned_at >= $1::timestamptz AND r.returned_at < $2::timestamptz`,
    [startISO, endISO]
  );
  console.log('Ledger commission total:', r2.rows[0]);

  // 3) Payroll-style: managed_commission per user (sum of ledger entries per user on their rentals)
  const r3 = await pool.query(
    `SELECT COUNT(*)::int as user_count, COALESCE(SUM(managed_commission),0)::numeric as total_managed_commission FROM (
      SELECT u.id,
        COALESCE((
          SELECT SUM(
            CASE
              WHEN EXISTS (SELECT 1 FROM rental_commission_ledger l0 WHERE l0.rental_id = ren.id AND l0.is_deleted = false)
              THEN COALESCE((SELECT SUM(l.commission_amount) FROM rental_commission_ledger l WHERE l.rental_id = ren.id AND l.user_id = u.id AND l.is_deleted = false), 0)
              ELSE ren.total_price * COALESCE(u.commission_rate, 0)
            END
          )
          FROM rentals ren
          WHERE (ren.manager_id = u.id OR ren.user_id = u.id OR ren.handover_user_id = u.id)
            AND ren.status = 'completed' AND ren.is_deleted = false
            AND ren.returned_at >= $1::timestamptz AND ren.returned_at < $2::timestamptz
        ), 0) AS managed_commission
      FROM users u WHERE u.is_deleted = false
    ) sub`,
    [startISO, endISO]
  );
  console.log('Payroll managed_commission total:', r3.rows[0]);

  // 4) So sánh: có rental nào có manager nhưng user_id khác manager?
  const r4 = await pool.query(
    `SELECT COUNT(*)::int as cnt, COALESCE(SUM(ren.total_price),0)::numeric as total
     FROM rentals ren
     WHERE ren.manager_id IS NOT NULL AND ren.manager_id != ren.user_id
     AND ren.status = 'completed' AND ren.is_deleted = false
     AND ren.returned_at >= $1::timestamptz AND ren.returned_at < $2::timestamptz`,
    [startISO, endISO]
  );
  console.log('Rentals where manager != creator:', r4.rows[0]);

  // 5) Có rental nào có handover_user_id khác user_id?
  const r5 = await pool.query(
    `SELECT COUNT(*)::int as cnt, COALESCE(SUM(ren.total_price),0)::numeric as total
     FROM rentals ren
     WHERE ren.handover_user_id IS NOT NULL AND ren.handover_user_id != ren.user_id
     AND ren.status = 'completed' AND ren.is_deleted = false
     AND ren.returned_at >= $1::timestamptz AND ren.returned_at < $2::timestamptz`,
    [startISO, endISO]
  );
  console.log('Rentals where handover != creator:', r5.rows[0]);

  // 6) Kiểm tra legacy fallback: rentals không có ledger
  const r6 = await pool.query(
    `SELECT COUNT(*)::int as cnt, COALESCE(SUM(ren.total_price),0)::numeric as total
     FROM rentals ren
     WHERE ren.status = 'completed' AND ren.is_deleted = false
     AND ren.returned_at >= $1::timestamptz AND ren.returned_at < $2::timestamptz
     AND NOT EXISTS (SELECT 1 FROM rental_commission_ledger l0 WHERE l0.rental_id = ren.id AND l0.is_deleted = false)`,
    [startISO, endISO]
  );
  console.log('Rentals WITHOUT ledger (legacy fallback):', r6.rows[0]);

  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
