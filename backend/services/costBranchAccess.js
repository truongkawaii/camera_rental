const { hasRole } = require('../middleware/auth');
async function costBranchAccess(db, user, requested) {
  if (requested != null && requested !== '' && (!/^\d+$/.test(String(requested)) || !Number.isSafeInteger(Number(requested)) || Number(requested) <= 0)) {
    throw Object.assign(new Error('Cơ sở không hợp lệ.'), { status: 400 });
  }
  const admin = hasRole(user, 'admin');
  const branches = await db.query(`SELECT b.id,b.name FROM branches b WHERE b.is_deleted=false
    ${admin ? '' : 'AND EXISTS (SELECT 1 FROM equipment e WHERE e.branch_id=b.id AND e.owner_id=$1 AND e.is_deleted=false)'} ORDER BY b.name`, admin ? [] : [user.id]);
  const ids = branches.rows.map(row => Number(row.id));
  if (requested && !ids.includes(Number(requested))) throw Object.assign(new Error('Bạn không có quyền xem chi phí của cơ sở này.'), { status: 403 });
  return { branches: branches.rows, ids: requested ? [Number(requested)] : ids, admin, filtered: Boolean(requested) || !admin };
}
function branchTotals(rows, branches) {
  const totals = branches.map(branch => ({ branch_id: branch.id, branch_name: branch.name, amount: 0, count: 0 }));
  for (const row of rows) {
    let item = totals.find(item => Number(item.branch_id) === Number(row.branch_id));
    if (!item) { item = { branch_id: row.branch_id, branch_name: row.branch_name || 'Chưa gắn cơ sở', amount: 0, count: 0 }; totals.push(item); }
    item.amount += Number(row.amount || 0); item.count++;
  }
  return totals;
}
module.exports = { costBranchAccess, branchTotals };
