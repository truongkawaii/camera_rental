#!/usr/bin/env node

/**
 * Realistic Database Seeder
 * Generates varied, realistic data for testing analytics, performance, and daily operations.
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper to get random item from array
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Helper to get random integer between min and max
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Helper to add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Helper to subtract days from a date
const subDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
};

const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  const passwordHash = await bcrypt.hash('password123', 10);
  try {
    console.log('🚀 Starting realistic database seeding...');

    await client.query('BEGIN');

    // 1. Clear existing data
    console.log('🧹 Cleaning up existing tables...');
    await client.query(`
      TRUNCATE 
        activity_logs, 
        financial_transactions, 
        tasks, 
        equipment_maintenance, 
        rental_accessories, 
        rentals, 
        equipment, 
        equipment_categories, 
        customers, 
        user_roles, 
        users, 
        roles, 
        branches 
      RESTART IDENTITY CASCADE
    `);

    // 2. Insert Branches
    console.log('🏢 Creating branches...');
    const branchNames = [
      { name: 'Chi nhánh Quận 1', code: 'CNQ1', address: '123 Lê Lợi, Quận 1, TP.HCM' },
      { name: 'Chi nhánh Quận 3', code: 'CNQ3', address: '45 Võ Văn Tần, Quận 3, TP.HCM' },
      { name: 'Chi nhánh Bình Thạnh', code: 'CNBT', address: '78 Phan Đăng Lưu, Bình Thạnh, TP.HCM' }
    ];
    const branchIds = [];
    for (const b of branchNames) {
      const res = await client.query(
        'INSERT INTO branches (name, code, address) VALUES ($1, $2, $3) RETURNING id',
        [b.name, b.code, b.address]
      );
      branchIds.push(res.rows[0].id);
    }

    // 3. Insert Roles
    console.log('🔑 Creating roles...');
    const roles = [
      { name: 'admin', description: 'Quản trị viên' },
      { name: 'camera_manager', description: 'Quản lý thiết bị' },
      { name: 'investor', description: 'Nhà đầu tư' },
      { name: 'saler', description: 'Nhân viên bán hàng' },
      { name: 'driver', description: 'Giao nhận' }
    ];
    const roleMap = {};
    for (const r of roles) {
      const res = await client.query(
        'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id',
        [r.name, r.description]
      );
      roleMap[r.name] = res.rows[0].id;
    }

    // 4. Insert Users (Staff)
    console.log('👥 Creating staff users...');
    const staff = [
      { username: 'admin', full_name: 'Trần Minh Admin', role: 'admin', salary: 15000000, commission: 0.05 },
      { username: 'manager_hcm', full_name: 'Nguyễn Thiết Bị', role: 'camera_manager', salary: 10000000, commission: 0.03 },
      { username: 'sale_huy', full_name: 'Lê Quang Huy', role: 'saler', salary: 7000000, commission: 0.02 },
      { username: 'sale_an', full_name: 'Phạm Thành An', role: 'saler', salary: 7000000, commission: 0.02 },
      { username: 'sale_linh', full_name: 'Võ Mỹ Linh', role: 'saler', salary: 7500000, commission: 0.025 },
      { username: 'driver_tuan', full_name: 'Đặng Minh Tuấn', role: 'driver', salary: 6500000, commission: 0 }
    ];
    const userIds = [];
    const salerIds = [];
    for (const s of staff) {
      const res = await client.query(
        `INSERT INTO users (username, password, full_name, base_salary, commission_rate, branch_id) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [s.username, passwordHash, s.full_name, s.salary, s.commission, randomItem(branchIds)]
      );
      const uid = res.rows[0].id;
      userIds.push(uid);
      if (s.role === 'saler') salerIds.push(uid);

      // Mapping role
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [uid, roleMap[s.role]]);
    }

    // 5. Insert Customers
    console.log('👤 Creating customers...');
    const customerNames = [
      'Nguyễn Văn A', 'Trần Thị B', 'Phạm Minh C', 'Lê Hoàng D', 'Vũ Thu E',
      'Đặng Văn F', 'Bùi Thị G', 'Lý Văn H', 'Ngô Thị I', 'Hoàng Văn K',
      'Trịnh Thu L', 'Đỗ Minh M', 'Phan Văn N', 'Hồ Thị O', 'Dương Văn P',
      'Lương Thị Q', 'Võ Văn R', 'Mai Thị S', 'Đào Văn T', 'Hà Thị U'
    ];
    const customerIds = [];
    for (const name of customerNames) {
      const res = await client.query(
        'INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3) RETURNING id',
        [name, '09' + randomInt(10000000, 99999999), 'Địa chỉ ' + name]
      );
      customerIds.push(res.rows[0].id);
    }

    // 6. Insert Equipment Categories
    console.log('📦 Creating categories...');
    const cats = ['Camera Body', 'Lens', 'Lighting', 'Stabilizer', 'Audio'];
    for (const c of cats) {
      await client.query('INSERT INTO equipment_categories (name) VALUES ($1)', [c]);
    }

    // 7. Insert Equipment
    console.log('📷 Creating 10 equipment records...');
    const equipmentItems = [
      { name: 'Sony A7IV', category: 'Camera Body', price: 450000 },
      { name: 'Lens 24-70mm f2.8 GM', category: 'Lens', price: 350000 },
      { name: 'DJI RS3 Pro', category: 'Stabilizer', price: 200000 },
      { name: 'Aputure 300d II', category: 'Lighting', price: 300000 },
      { name: 'Rode Wireless Go II', category: 'Audio', price: 120000 }
    ];
    const equipmentIds = [];
    const equipPriceMap = {};
    for (let i = 0; i < equipmentItems.length; i++) {
      const item = equipmentItems[i];
      const units = 2;
      for (let u = 1; u <= units; u++) {
        const res = await client.query(
          `INSERT INTO equipment (name, category, price_per_day, code, branch_id, condition) 
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [item.name, item.category, item.price, `${item.name.replace(/\s+/g, '')}-${u}`, randomItem(branchIds), 'good']
        );
        const eid = res.rows[0].id;
        equipmentIds.push(eid);
        equipPriceMap[eid] = item.price;
      }
    }

    // 8. Insert Rentals (The core part)
    console.log('📝 Generating 10 realistic rentals...');
    const statuses = ['completed', 'completed', 'completed', 'active', 'pending', 'cancelled', 'overdue'];
    const periods = ['sáng', 'chiều', 'tối'];
    const notesOptions = [
      'Khách quen, cẩn thận thiết bị',
      'Cần kiểm tra kỹ cảm biến trước khi giao',
      'Khách thuê đi quay sự kiện ở Đà Lạt',
      'Đã thanh toán trước 50%',
      'Yêu cầu thêm 2 pin dự phòng',
      'Khách mới, cần hướng dẫn sử dụng',
      'Ưu đãi sinh nhật khách hàng',
      null, null, null 
    ];
    
    const now = new Date('2026-05-10T12:00:00Z'); 
    const todayStr = '2026-05-10';

    // 8a. Explicitly create data for TODAY'S Dashboard (Action Panels)
    console.log('🎯 Creating specific records for Today\'s Dashboard...');
    
    // 3 Pickups Today
    for (let i = 1; i <= 3; i++) {
      const customerId = randomItem(customerIds);
      const equipmentId = randomItem(equipmentIds);
      const userId = randomItem(salerIds);
      const start = new Date(`${todayStr}T08:00:00Z`);
      const end = addDays(start, 2);
      const code = `PU-TODAY-${i}`;
      const unitPrice = equipPriceMap[equipmentId];
      await client.query(
        `INSERT INTO rentals (customer_id, equipment_id, branch_id, user_id, start_date, end_date, status, total_price, unit_price, code, order_number, inserted_at, pickup_time, return_time, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $11, $12, $7, $8, $9, $10, $13, $14)`,
        [customerId, equipmentId, randomItem(branchIds), userId, start, end, code, 200 + i, subDays(start, 1), start, unitPrice * 2, unitPrice, end, unitPrice]
      );
    }

    // 3 Returns Today
    for (let i = 1; i <= 3; i++) {
      const customerId = randomItem(customerIds);
      const equipmentId = randomItem(equipmentIds);
      const userId = randomItem(salerIds);
      const end = new Date(`${todayStr}T15:00:00Z`);
      const start = subDays(end, 2);
      const code = `RE-TODAY-${i}`;
      const unitPrice = equipPriceMap[equipmentId];
      await client.query(
        `INSERT INTO rentals (customer_id, equipment_id, branch_id, user_id, start_date, end_date, status, total_price, unit_price, code, order_number, inserted_at, picked_up_at, pickup_time, return_time, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $11, $12, $7, $8, $9, $10, $10, $6, $13)`,
        [customerId, equipmentId, randomItem(branchIds), userId, start, end, code, 300 + i, subDays(start, 1), start, unitPrice * 2, unitPrice, unitPrice]
      );
    }

    // 2 Overdue
    for (let i = 1; i <= 2; i++) {
      const customerId = randomItem(customerIds);
      const equipmentId = randomItem(equipmentIds);
      const userId = randomItem(salerIds);
      const end = subDays(now, randomInt(1, 10)); 
      const start = subDays(end, 2);
      const code = `OV-DUE-${i}`;
      const unitPrice = equipPriceMap[equipmentId];
      await client.query(
        `INSERT INTO rentals (customer_id, equipment_id, branch_id, user_id, start_date, end_date, status, total_price, unit_price, code, order_number, inserted_at, picked_up_at, pickup_time, return_time, deposit_amount)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $11, $12, $7, $8, $9, $10, $10, $6, $13)`,
        [customerId, equipmentId, randomItem(branchIds), userId, start, end, code, 400 + i, subDays(start, 1), start, unitPrice * 2, unitPrice, unitPrice]
      );
    }

    // 8b. Generate other historical/future data
    console.log('📅 Generating 2 other rentals...');
    const startDateRange = subDays(now, 90); 
    const endDateRange = addDays(now, 30);   

    for (let i = 1; i <= 2; i++) {
      const customerId = randomItem(customerIds);
      const equipmentId = randomItem(equipmentIds);
      const branchId = randomItem(branchIds);
      const userId = randomItem(salerIds);
      const managerId = randomItem(userIds);
      
      const start = new Date(startDateRange.getTime() + Math.random() * (endDateRange.getTime() - startDateRange.getTime()));
      const duration = randomInt(1, 7);
      const end = addDays(start, duration);
      
      const unitPrice = equipPriceMap[equipmentId];
      const unitPriceSession = Math.round(unitPrice * 0.4);
      const totalPrice = unitPrice * duration;
      const deposit = Math.round(totalPrice * 0.5);
      const discount = Math.random() > 0.8 ? Math.round(totalPrice * 0.1) : 0;
      const damageFee = (Math.random() > 0.95 && end < now) ? randomInt(100, 500) * 1000 : 0;
      const finalPrice = totalPrice - discount + damageFee;
      
      let status = randomItem(statuses);
      
      if (status === 'cancelled') {
      } else if (start > now) {
        status = 'pending';
      } else if (end < now) {
        status = Math.random() > 0.1 ? 'completed' : 'overdue';
      } else {
        status = 'active';
      }

      const insertedAt = subDays(start, randomInt(0, 3));
      const orderNumber = 500 + i;
      const code = `OD${String(orderNumber).padStart(7, '0')}`;

      await client.query(
        `INSERT INTO rentals (
          customer_id, equipment_id, branch_id, user_id, manager_id,
          start_date, start_period, end_date, end_period,
          status, total_price, unit_price, unit_price_session, 
          deposit_amount, damage_fee, notes,
          discount_amount, discount_type, code, order_number, 
          inserted_at, updated_at, picked_up_at, returned_at,
          pickup_time, return_time, inserted_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
        [
          customerId, equipmentId, branchId, userId, managerId,
          start, randomItem(periods), end, randomItem(periods),
          status, finalPrice, unitPrice, unitPriceSession,
          deposit, damageFee, randomItem(notesOptions),
          discount, 'fixed', code, orderNumber, 
          insertedAt, insertedAt,
          (status === 'active' || status === 'completed' || status === 'overdue') ? start : null,
          (status === 'completed') ? end : null,
          start, end,
          userId, userId
        ]
      );
    }
    // 9. No maintenance records (Reset to 0)
    console.log('🔧 Skipping maintenance records...');

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', e);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
