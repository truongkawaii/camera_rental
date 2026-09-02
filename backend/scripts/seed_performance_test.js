const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/camera_rental'
});

async function seedTest() {
  const client = await pool.connect();
  try {
    console.log('🧪 Seeding performance test data...');
    
    // 1. Find Admin user
    const userRes = await client.query("SELECT id, username, full_name, branch_id FROM users WHERE username = 'admin'");
    if (userRes.rows.length === 0) {
      console.error('❌ User admin not found. Please run seed_realistic.js first.');
      return;
    }
    const admin = userRes.rows[0];

    // 2. Create a snapshot for April 2026 (Month with different salary/commission)
    console.log('📝 Creating April 2026 snapshot for admin...');
    await client.query(`
      INSERT INTO payroll_snapshots 
        (user_id, month, full_name, username, role_name, branch_name, 
         base_salary, commission_rate, managed_revenue, commission_amount, 
         total_payable, locked_by, locked_at, inserted_by, updated_by)
      VALUES 
        ($1, '2026-04', $2, 'admin', 'admin', 'Chi nhánh Quận 1', 
         4000000, 0.02, 10000000, 200000, 
         4200000, $1, '2026-05-05 10:00:00+07', $1, $1)
      ON CONFLICT DO NOTHING
    `, [admin.id, admin.full_name]);

    // 3. Ensure some rentals exist for April and May for the admin
    // April Rental
    await client.query(`
      INSERT INTO rentals (customer_id, equipment_id, user_id, start_date, end_date, total_price, status, inserted_at)
      SELECT 
        (SELECT id FROM customers LIMIT 1),
        (SELECT id FROM equipment LIMIT 1),
        $1, 
        '2026-04-10 10:00:00+07', '2026-04-12 10:00:00+07', 
        1000000, 'completed', '2026-04-10 10:00:00+07'
      LIMIT 1
    `, [admin.id]);

    // May Rental
    await client.query(`
      INSERT INTO rentals (customer_id, equipment_id, user_id, start_date, end_date, total_price, status, inserted_at)
      SELECT 
        (SELECT id FROM customers LIMIT 1),
        (SELECT id FROM equipment LIMIT 1),
        $1, 
        '2026-05-01 10:00:00+07', '2026-05-03 10:00:00+07', 
        2000000, 'completed', '2026-05-01 10:00:00+07'
      LIMIT 1
    `, [admin.id]);

    console.log('✅ Performance test data seeded successfully!');
    console.log('---');
    console.log('Test Scenario:');
    console.log('- April 2026: Salary 4M, Commission 2% (from snapshot)');
    console.log('- May 2026 (Current): Salary 15M, Commission 5% (from users table)');
  } catch (err) {
    console.error('❌ Error seeding test data:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedTest();
