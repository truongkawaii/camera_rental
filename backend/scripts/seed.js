#!/usr/bin/env node

/**
 * Seed Database with Sample Data
 * Run this to populate the database with test data
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sampleData = {
  customers: [
    { name: 'Nguyễn Văn A', email: 'nguyenvana@email.com', phone: '0901234567', address: 'Quận 1, TP.HCM' },
    { name: 'Trần Thị B', email: 'tranthib@email.com', phone: '0912345678', address: 'Quận 3, TP.HCM' },
    { name: 'Phạm Minh C', email: 'phamminhc@email.com', phone: '0923456789', address: 'Quận Bình Thạnh, TP.HCM' },
    { name: 'Hoàng Quốc D', email: 'hoangquocd@email.com', phone: '0934567890', address: 'Hải Châu, Đà Nẵng' },
    { name: 'Lê Hoàng Nam', email: 'nam.le@gmail.com', phone: '0987654321', address: 'Quận Cầu Giấy, Hà Nội' },
    { name: 'Đặng Thu Thảo', email: 'thao.dang@outlook.com', phone: '0977889900', address: 'Quận 7, TP.HCM' },
    { name: 'Vũ Minh Tuấn', email: 'tuan.vu@yahoo.com', phone: '0911223344', address: 'Quận Long Biên, Hà Nội' },
    { name: 'Ngô Mỹ Linh', email: 'linh.ngo@gmail.com', phone: '0944556677', address: 'Thành Phố Thủ Đức, TP.HCM' },
    { name: 'Bùi Anh Đức', email: 'duc.bui@fpt.com.vn', phone: '0966778899', address: 'Sơn Trà, Đà Nẵng' },
    { name: 'Lý Kim Hoa', email: 'hoa.ly@hotmail.com', phone: '0955443322', address: 'Quận Ninh Kiều, Cần Thơ' }
  ],
  equipment: [
    // Canon EOS R5 units
    { name: 'Canon EOS R5', category: 'Camera', code: 'CAM-R5-001', price_per_day: 500000, condition: 'good' },
    { name: 'Canon EOS R5', category: 'Camera', code: 'CAM-R5-002', price_per_day: 500000, condition: 'good' },
    { name: 'Canon EOS R5', category: 'Camera', code: 'CAM-R5-003', price_per_day: 500000, condition: 'good' },
    
    // Sony A7IV units
    { name: 'Sony A7IV', category: 'Camera', code: 'CAM-A74-001', price_per_day: 450000, condition: 'good' },
    { name: 'Sony A7IV', category: 'Camera', code: 'CAM-A74-002', price_per_day: 450000, condition: 'good' },
    { name: 'Sony A7IV', category: 'Camera', code: 'CAM-A74-003', price_per_day: 450000, condition: 'good' },
    
    // Lens units
    { name: 'RF 24-70mm F2.8', category: 'Lens', code: 'LNS-2470-001', price_per_day: 200000, condition: 'good' },
    { name: 'RF 24-70mm F2.8', category: 'Lens', code: 'LNS-2470-002', price_per_day: 200000, condition: 'good' },
    { name: 'RF 70-200mm F2.8', category: 'Lens', code: 'LNS-7020-001', price_per_day: 300000, condition: 'good' },
    
    // Lighting
    { name: 'Godox SL-60W', category: 'Lighting', code: 'LGT-SL60-001', price_per_day: 150000, condition: 'good' },
    { name: 'Godox SL-60W', category: 'Lighting', code: 'LGT-SL60-002', price_per_day: 150000, condition: 'good' },
    
    // Stabilizer
    { name: 'DJI Ronin 4D', category: 'Stabilizer', code: 'STB-R4D-001', price_per_day: 800000, condition: 'good' }
  ]
};

async function seedDatabase() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    console.log('Cleaning up existing data...');
    await client.query('TRUNCATE rentals, equipment, customers RESTART IDENTITY CASCADE');

    // Insert customers
    console.log('Adding customers...');
    const customerIds = [];
    for (const customer of sampleData.customers) {
      const res = await client.query(
        'INSERT INTO customers (name, email, phone, address) VALUES ($1, $2, $3, $4) RETURNING id',
        [customer.name, customer.email, customer.phone, customer.address]
      );
      customerIds.push(res.rows[0].id);
    }

    // Insert equipment
    console.log('Adding equipment...');
    const equipmentIds = [];
    for (const item of sampleData.equipment) {
      const res = await client.query(
        `INSERT INTO equipment (name, category, price_per_day, code, condition)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [item.name, item.category, item.price_per_day, item.code, item.condition]
      );
      equipmentIds.push(res.rows[0].id);
    }

    // Insert some rentals
    console.log('Adding sample rentals...');
    
    // 1. Active rental (Sony A7IV unit 1)
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 5);
    
    await client.query(
      `INSERT INTO rentals (customer_id, equipment_id, start_date, end_date, total_price, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'active', 'Phỏng vấn dự án mới')`,
      [customerIds[0], equipmentIds[3], today, nextWeek, 2250000]
    );

    // 2. Future rental (Canon R5 unit 1)
    const nextMonth = new Date();
    nextMonth.setDate(today.getDate() + 15);
    const endNextMonth = new Date();
    endNextMonth.setDate(nextMonth.getDate() + 3);

    await client.query(
      `INSERT INTO rentals (customer_id, equipment_id, start_date, end_date, total_price, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'active', 'Quay đám cưới')`,
      [customerIds[1], equipmentIds[0], nextMonth, endNextMonth, 1500000]
    );

    // 3. Completed rental (Sony A7IV unit 2)
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 10);
    const endLastWeek = new Date();
    endLastWeek.setDate(lastWeek.getDate() + 2);

    await client.query(
      `INSERT INTO rentals (customer_id, equipment_id, start_date, end_date, total_price, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'completed', 'Dự án phim ngắn')`,
      [customerIds[2], equipmentIds[4], lastWeek, endLastWeek, 900000]
    );

    console.log('✓ Database seeding completed successfully!');
    console.log('');
    console.log('Sample data added:');
    console.log(`  • ${sampleData.customers.length} customers`);
    console.log(`  • ${sampleData.equipment.length} individual equipment units`);
    console.log(`  • 3 sample rentals (1 active, 1 future, 1 completed)`);
  } catch (error) {
    console.error('✗ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase();
