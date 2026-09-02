// utils/db.js
require('dotenv').config();
const { Pool } = require('pg');
const { v2: cloudinary } = require('cloudinary');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false')
    ? { rejectUnauthorized: false }
    : false,
  options: '-c search_path=public'
});

let cloudinaryConfigured = false;

const AUDIT_COLUMNS = `
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
`;

const IMAGE_ENTITY_SOURCES = [
  { entityType: 'branches', table: 'branches', columns: ['image_data'] },
  { entityType: 'customers', table: 'customers', columns: ['image_data'] },
  { entityType: 'equipment', table: 'equipment', columns: ['image_url', 'image_data'] },
  { entityType: 'rentals', table: 'rentals', columns: ['image_data'] }
];

const hasCloudinaryConfig = () => Boolean(
  process.env.CLOUDINARY_URL ||
  (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  )
);

const configureCloudinary = () => {
  if (cloudinaryConfigured) return;

  if (!hasCloudinaryConfig()) {
    throw new Error('Cloudinary is not configured');
  }

  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({ secure: true });
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
  }

  cloudinaryConfigured = true;
};

const isDataUri = (value) => /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
const isHttpUrl = (value) => /^https?:\/\//i.test(value);

const uploadLegacyImageToCloudinary = async (dataUri, entityType, entityId, sortOrder) => {
  configureCloudinary();

  const rootFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'camera-rental';
  const publicId = `${entityType}/${entityId}/${sortOrder}-${Date.now()}`;

  return cloudinary.uploader.upload(dataUri, {
    folder: `${rootFolder}/${entityType}/${entityId}`,
    public_id: publicId,
    resource_type: 'image'
  });
};

const parseLegacyImages = (value) => {
  if (!value || typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
      }
    } catch {
      return [trimmed];
    }
  }

  return [trimmed];
};

const cleanupLegacyImageColumns = async () => {
  const legacyColumns = [
    { table: 'branches', columns: ['image_data'] },
    { table: 'customers', columns: ['image_data'] },
    { table: 'equipment', columns: ['image_url', 'image_data'] },
    { table: 'rentals', columns: ['image_data'] }
  ];
  let droppedCount = 0;

  for (const { table, columns } of legacyColumns) {
    for (const column of columns) {
      const columnCheck = await pool.query(
        `
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        `,
        [table, column]
      );

      if (columnCheck.rows.length === 0) continue;

      try {
        await pool.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}"`);
        droppedCount += 1;
        console.log(`Dropped legacy image column ${table}.${column}`);
      } catch (err) {
        console.warn(`Could not drop legacy image column ${table}.${column}: ${err.message}`);
      }
    }
  }

  if (droppedCount === 0) {
    console.log('✓ No legacy image columns to drop (already clean)');
  }
};

const migrateLegacyImages = async () => {
  let migratedCount = 0;

  for (const source of IMAGE_ENTITY_SOURCES) {
    const columnResult = await pool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)
      `,
      [source.table, source.columns]
    );
    const existingColumns = columnResult.rows.map((row) => row.column_name);
    if (existingColumns.length === 0) continue;

    const selectColumns = ['id', ...existingColumns].map((column) => `"${column}"`).join(', ');
    const legacyRows = await pool.query(
      `SELECT ${selectColumns} FROM ${source.table} WHERE is_deleted = false`
    );

    for (const row of legacyRows.rows) {
      const existing = await pool.query(
        `
          SELECT 1
          FROM entity_images
          WHERE entity_type = $1 AND entity_id = $2 AND is_deleted = false
          LIMIT 1
        `,
        [source.entityType, row.id]
      );
      if (existing.rows.length > 0) continue;

      const imageUrls = [];
      for (const column of existingColumns) {
        imageUrls.push(...parseLegacyImages(row[column]));
      }

      const uniqueImageUrls = [...new Set(imageUrls)];
      for (let index = 0; index < uniqueImageUrls.length; index += 1) {
        const imageValue = uniqueImageUrls[index];
        let imageUrl = imageValue;
        let secureUrl = imageValue;
        let publicId = null;
        let provider = 'legacy';
        let resourceType = 'image';
        let format = null;
        let width = null;
        let height = null;
        let bytes = null;
        const metadata = {
          migrated_from: source.table
        };

        if (isHttpUrl(imageValue)) {
          provider = 'remote';
        } else if (isDataUri(imageValue)) {
          const uploadResult = await uploadLegacyImageToCloudinary(imageValue, source.entityType, row.id, index);
          imageUrl = uploadResult.secure_url || uploadResult.url;
          secureUrl = uploadResult.secure_url || uploadResult.url;
          publicId = uploadResult.public_id;
          provider = 'cloudinary';
          resourceType = uploadResult.resource_type || 'image';
          format = uploadResult.format || null;
          width = uploadResult.width || null;
          height = uploadResult.height || null;
          bytes = uploadResult.bytes || null;
          metadata.original_filename = uploadResult.original_filename || null;
          metadata.asset_id = uploadResult.asset_id || null;
        }

        await pool.query(
          `
            INSERT INTO entity_images (
              entity_type, entity_id, image_url, secure_url, public_id, provider,
              resource_type, format, width, height, bytes, sort_order, is_primary,
              metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
          `,
          [
            source.entityType,
            row.id,
            imageUrl,
            secureUrl,
            publicId,
            provider,
            resourceType,
            format,
            width,
            height,
            bytes,
            index,
            index === 0,
            JSON.stringify(metadata)
          ]
        );
        migratedCount += 1;
      }
    }
  }

  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} legacy image(s) into entity_images`);
  } else {
    console.log('No legacy image columns with data to migrate (tables already clean)');
  }

  return migratedCount;
};

// Database initialization function (moved from server.js)
const initDB = async () => {
  console.log('--- Starting Database Initialization ---');
  try {
    // Core Tables
    await pool.query(`CREATE TABLE IF NOT EXISTS activity_logs (id SERIAL PRIMARY KEY, action VARCHAR(20) NOT NULL, entity_type VARCHAR(50) NOT NULL, entity_id INTEGER, description TEXT NOT NULL, ${AUDIT_COLUMNS})`);
    await pool.query(`CREATE TABLE IF NOT EXISTS blacklist (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), reason TEXT, blacklisted_at TIMESTAMPTZ DEFAULT NOW(), unblacklisted_at TIMESTAMPTZ, blacklisted_by INTEGER, unblacklisted_by INTEGER, ${AUDIT_COLUMNS})`);
    await pool.query(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, name VARCHAR(20) UNIQUE NOT NULL, description TEXT, ${AUDIT_COLUMNS})`);

    // Seed roles
    const rolesExist = await pool.query('SELECT COUNT(*) FROM roles');
    if (parseInt(rolesExist.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO roles (name, description) VALUES 
        ('admin', 'Quản trị viên'), 
        ('saler', 'Bán hàng'), 
        ('camera_manager', 'Quản lý Camera'),
        ('investor', 'Nhà đầu tư'),
        ('driver', 'Giao nhận')
      `);
      console.log('✓ Roles seeded');
    }
    await pool.query(`
      INSERT INTO roles (name, description)
      VALUES ('investor', 'Nhà đầu tư'), ('driver', 'Giao nhận')
      ON CONFLICT (name) DO UPDATE
        SET description = EXCLUDED.description,
            is_deleted = false,
            updated_at = NOW()
    `);

    // Branches table
    await pool.query(`CREATE TABLE IF NOT EXISTS branches (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, code VARCHAR(50) UNIQUE, order_number INTEGER, address TEXT, address_detail TEXT, phone VARCHAR(20), map_url TEXT, ${AUDIT_COLUMNS})`);
    await pool.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE`);

    // Users table
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role_id INTEGER REFERENCES roles(id), branch_id INTEGER REFERENCES branches(id), full_name VARCHAR(100), base_salary DECIMAL(12, 2) DEFAULT 0, commission_rate DECIMAL(5, 4) DEFAULT 0, ${AUDIT_COLUMNS})`);

    // User-Role mapping table (many-to-many)
    await pool.query(`CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE, ${AUDIT_COLUMNS}, PRIMARY KEY (user_id, role_id))`);

    // User-Branch mapping table (many-to-many)
    await pool.query(`CREATE TABLE IF NOT EXISTS user_branches (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE, ${AUDIT_COLUMNS}, PRIMARY KEY (user_id, branch_id))`);

    // Customers table
    await pool.query(`CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(255), phone VARCHAR(20), address TEXT, id_number VARCHAR(20), total_rentals INTEGER DEFAULT 0, total_spent DECIMAL(10, 2) DEFAULT 0, ${AUDIT_COLUMNS})`);

    // Equipment categories
    await pool.query(`CREATE TABLE IF NOT EXISTS equipment_categories (id SERIAL PRIMARY KEY, name VARCHAR(100) UNIQUE NOT NULL, description TEXT, ${AUDIT_COLUMNS})`);

    // Equipment table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        brand VARCHAR(100),
        model VARCHAR(100),
        description TEXT,
        price_per_day DECIMAL(10, 2) NOT NULL,
        price_per_session DECIMAL(10, 2),
        price_per_day_discount DECIMAL(10, 2),
        discount_day_threshold INTEGER DEFAULT NULL,
        code VARCHAR(50) UNIQUE,
        condition VARCHAR(50) DEFAULT 'good',
        purchase_date DATE,
        purchase_price DECIMAL(10, 2),
        branch_id INTEGER REFERENCES branches(id),
        owner_id INTEGER REFERENCES users(id),
        ${AUDIT_COLUMNS}
      )
    `);

    // Rentals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rentals (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        equipment_id INTEGER REFERENCES equipment(id),
        branch_id INTEGER REFERENCES branches(id),
        user_id INTEGER REFERENCES users(id),
        handover_user_id INTEGER REFERENCES users(id),
        manager_id INTEGER REFERENCES users(id),
        start_date TIMESTAMPTZ NOT NULL,
        start_period VARCHAR(20) DEFAULT 'sáng',
        end_date TIMESTAMPTZ NOT NULL,
        end_period VARCHAR(20) DEFAULT 'chiều',
        status VARCHAR(50) DEFAULT 'pending',
        total_price DECIMAL(10, 2) NOT NULL,
        unit_price DECIMAL(10, 2),
        unit_price_session DECIMAL(10, 2),
        applied_day_price DECIMAL(10, 2),
        used_discount_day_price BOOLEAN DEFAULT false,
        discount_day_price DECIMAL(10, 2),
        discount_day_threshold_snapshot INTEGER,
        deposit_amount DECIMAL(10, 2),
        damage_fee DECIMAL(10, 2) DEFAULT 0,
        notes TEXT,
        pickup_time TIMESTAMPTZ,
        return_time TIMESTAMPTZ,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        discount_type VARCHAR(20) DEFAULT 'fixed',
        returned_at TIMESTAMPTZ,
        picked_up_at TIMESTAMPTZ,
        code VARCHAR(50),
        order_number INTEGER,
        pickup_branch_id INTEGER REFERENCES branches(id),
        return_branch_id INTEGER REFERENCES branches(id),
        ${AUDIT_COLUMNS}
      )
    `);

    // Commission rule sets
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rule_sets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        rule_type VARCHAR(20) NOT NULL,
        rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT FALSE,
        effective_from TIMESTAMPTZ,
        effective_to TIMESTAMPTZ,
        ${AUDIT_COLUMNS}
      )
    `);

    // Commission rule set — user assignments (per-role: saler/driver)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_rule_set_users (
        id SERIAL PRIMARY KEY,
        rule_set_id INTEGER NOT NULL REFERENCES commission_rule_sets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_name VARCHAR(20) NOT NULL,
        ${AUDIT_COLUMNS},
        UNIQUE (user_id, role_name)
      )
    `);

    // Collaborator hierarchy
    await pool.query(`
      CREATE TABLE IF NOT EXISTS collaborator_hierarchy (
        id SERIAL PRIMARY KEY,
        child_user_id INTEGER NOT NULL REFERENCES users(id),
        parent_user_id INTEGER NOT NULL REFERENCES users(id),
        share_rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
        effective_from TIMESTAMPTZ,
        effective_to TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE,
        ${AUDIT_COLUMNS}
      )
    `);

    // Rental commission ledger
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rental_commission_ledger (
        id SERIAL PRIMARY KEY,
        rental_id INTEGER NOT NULL REFERENCES rentals(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        source_role VARCHAR(20) NOT NULL,
        line_type VARCHAR(20) NOT NULL,
        rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
        base_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        from_user_id INTEGER REFERENCES users(id),
        ${AUDIT_COLUMNS}
      )
    `);

    // Images are stored separately from business tables.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entity_images (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        secure_url TEXT,
        public_id VARCHAR(255),
        provider VARCHAR(50) DEFAULT 'cloudinary',
        resource_type VARCHAR(20) DEFAULT 'image',
        format VARCHAR(50),
        width INTEGER,
        height INTEGER,
        bytes INTEGER,
        sort_order INTEGER DEFAULT 0,
        is_primary BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'::jsonb,
        ${AUDIT_COLUMNS}
      )
    `);

    // Rental accessories
    await pool.query(`CREATE TABLE IF NOT EXISTS rental_accessories (id SERIAL PRIMARY KEY, rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE, equipment_id INTEGER REFERENCES equipment(id), unit_price DECIMAL(10, 2) NOT NULL, unit_price_session DECIMAL(10, 2), ${AUDIT_COLUMNS})`);

    // Equipment maintenance
    await pool.query(`CREATE TABLE IF NOT EXISTS equipment_maintenance (id SERIAL PRIMARY KEY, equipment_id INTEGER NOT NULL REFERENCES equipment(id), maintenance_type VARCHAR(100), description TEXT, maintenance_cost DECIMAL(10, 2), maintenance_date TIMESTAMPTZ DEFAULT NOW(), completed_date TIMESTAMPTZ, status VARCHAR(50) DEFAULT 'pending', ${AUDIT_COLUMNS})`);

    // Tasks
    await pool.query(`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, description TEXT, status VARCHAR(50) DEFAULT 'pending', priority VARCHAR(50) DEFAULT 'medium', assigned_to VARCHAR(255), due_date TIMESTAMPTZ, related_rental_id INTEGER REFERENCES rentals(id), ${AUDIT_COLUMNS})`);

    // Financial transactions
    await pool.query(`CREATE TABLE IF NOT EXISTS financial_transactions (id SERIAL PRIMARY KEY, rental_id INTEGER REFERENCES rentals(id), transaction_type VARCHAR(50), amount DECIMAL(10, 2), payment_method VARCHAR(100), status VARCHAR(50) DEFAULT 'pending', notes TEXT, ${AUDIT_COLUMNS})`);

    // Sales transfer ledger for sale → admin cash flow
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_transfer_logs (
        id SERIAL PRIMARY KEY,
        month VARCHAR(7) NOT NULL,
        sale_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        admin_user_id INTEGER NOT NULL REFERENCES users(id),
        transfer_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        notes TEXT,
        ${AUDIT_COLUMNS}
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sales_transfer_logs_month ON sales_transfer_logs(month) WHERE is_deleted = false');

    // Payroll snapshots
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_snapshots (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        full_name VARCHAR(100),
        username VARCHAR(50),
        role_name VARCHAR(50),
        branch_name VARCHAR(100),
        base_salary DECIMAL(12, 2) NOT NULL DEFAULT 0,
        commission_rate DECIMAL(5, 4) NOT NULL DEFAULT 0,
        managed_revenue DECIMAL(14, 2) NOT NULL DEFAULT 0,
        commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        total_payable DECIMAL(12, 2) NOT NULL DEFAULT 0,
        locked_by INTEGER REFERENCES users(id),
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ${AUDIT_COLUMNS},
        UNIQUE (user_id, month)
      )
    `);

    // Ads costs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ads_costs (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        start_date DATE,
        end_date DATE,
        branch_id INTEGER REFERENCES branches(id),
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        platform VARCHAR(50),
        notes TEXT,
        ${AUDIT_COLUMNS}
      )
    `);
    await pool.query(`ALTER TABLE ads_costs ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);
    await pool.query(`ALTER TABLE ads_costs ADD COLUMN IF NOT EXISTS start_date DATE`);
    await pool.query(`ALTER TABLE ads_costs ADD COLUMN IF NOT EXISTS end_date DATE`);
    await pool.query(`UPDATE ads_costs SET start_date = date WHERE start_date IS NULL`);
    await pool.query(`UPDATE ads_costs SET end_date = date WHERE end_date IS NULL`);

    // Misc costs (chi phí phát sinh)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS misc_costs (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        start_date DATE,
        end_date DATE,
        branch_id INTEGER REFERENCES branches(id),
        amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
        category VARCHAR(100),
        notes TEXT,
        ${AUDIT_COLUMNS}
      )
    `);
    await pool.query(`ALTER TABLE misc_costs ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);
    await pool.query(`ALTER TABLE misc_costs ADD COLUMN IF NOT EXISTS start_date DATE`);
    await pool.query(`ALTER TABLE misc_costs ADD COLUMN IF NOT EXISTS end_date DATE`);
    await pool.query(`UPDATE misc_costs SET start_date = date WHERE start_date IS NULL`);
    await pool.query(`UPDATE misc_costs SET end_date = date WHERE end_date IS NULL`);

    // Dynamic Migration for existing tables to ensure they have audit columns
    const tables = [
      'branches', 'roles', 'users', 'user_roles', 'user_branches', 'customers', 'equipment_categories',
      'equipment', 'rentals', 'rental_accessories', 'equipment_maintenance',
      'tasks', 'financial_transactions', 'sales_transfer_logs', 'payroll_snapshots', 'activity_logs', 'ads_costs', 'misc_costs', 'entity_images',
      'commission_rule_sets', 'commission_rule_set_users', 'collaborator_hierarchy', 'rental_commission_ledger'
    ];

    for (const table of tables) {
      try {
        // Check for created_at to rename
        const hasCreatedAt = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name='created_at'`, [table]);
        if (hasCreatedAt.rows.length > 0) {
          await pool.query(`ALTER TABLE ${table} RENAME COLUMN created_at TO inserted_at`);
        }

        // Add missing columns
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW()`);
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS inserted_by INTEGER`);
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS updated_by INTEGER`);
        await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
      } catch (err) {
        // Silently skip if table doesn't exist yet
      }
    }

    // Existing migrations (keep for compatibility and ensure columns exist)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary DECIMAL(12, 2) DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5, 4) DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);

    await pool.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS code VARCHAR(50) UNIQUE`);
    await pool.query(`ALTER TABLE branches ADD COLUMN IF NOT EXISTS order_number INTEGER`);

    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS id_number VARCHAR(20)`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_rentals INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10, 2) DEFAULT 0`);

    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS brand VARCHAR(100)`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS model VARCHAR(100)`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS price_per_session DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS price_per_day_discount DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS discount_day_threshold INTEGER DEFAULT NULL`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_date DATE`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)`);

    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS handover_user_id INTEGER REFERENCES users(id)`);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rentals' AND column_name = 'delivery_user_id'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rentals' AND column_name = 'receiver_user_id'
        ) THEN
          EXECUTE 'UPDATE rentals SET handover_user_id = COALESCE(delivery_user_id, receiver_user_id) WHERE handover_user_id IS NULL';
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rentals' AND column_name = 'delivery_user_id'
        ) THEN
          EXECUTE 'UPDATE rentals SET handover_user_id = delivery_user_id WHERE handover_user_id IS NULL';
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'rentals' AND column_name = 'receiver_user_id'
        ) THEN
          EXECUTE 'UPDATE rentals SET handover_user_id = receiver_user_id WHERE handover_user_id IS NULL';
        END IF;
      END $$;
    `);
    await pool.query(`DROP INDEX IF EXISTS idx_rentals_delivery_user`);
    await pool.query(`DROP INDEX IF EXISTS idx_rentals_receiver_user`);
    await pool.query(`ALTER TABLE rentals DROP COLUMN IF EXISTS delivery_user_id`);
    await pool.query(`ALTER TABLE rentals DROP COLUMN IF EXISTS receiver_user_id`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS unit_price_session DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS applied_day_price DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS used_discount_day_price BOOLEAN DEFAULT false`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS discount_day_price DECIMAL(10, 2)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS discount_day_threshold_snapshot INTEGER`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS start_period VARCHAR(20) DEFAULT 'sáng'`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS end_period VARCHAR(20) DEFAULT 'chiều'`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS notes TEXT`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_time TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'fixed'`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS code VARCHAR(50)`);
    await pool.query(`ALTER TABLE rentals DROP CONSTRAINT IF EXISTS rentals_code_key`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS order_number INTEGER`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS pickup_branch_id INTEGER REFERENCES branches(id)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS return_branch_id INTEGER REFERENCES branches(id)`);
    await pool.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10, 2) DEFAULT 0`);
    await pool.query(`ALTER TABLE rentals DROP COLUMN IF EXISTS deposit_type`);

    // Migration: Drop commission_snapshot column (data now lives in rental_commission_ledger)
    await pool.query(`ALTER TABLE rentals DROP COLUMN IF EXISTS commission_snapshot`);
    await pool.query(`DROP INDEX IF EXISTS idx_rentals_commission_snapshot_gin`);

    // Migration: Move rate_percent from commission_role_rates to commission_rule_sets
    await pool.query(`ALTER TABLE commission_rule_sets ADD COLUMN IF NOT EXISTS rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0`);
    const hasOldTable = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'commission_role_rates'
      LIMIT 1
    `);
    if (hasOldTable.rows.length > 0) {
      await pool.query(`
        UPDATE commission_rule_sets rs
        SET rate_percent = COALESCE(
          (SELECT rr.rate_percent
           FROM commission_role_rates rr
           WHERE rr.rule_set_id = rs.id
             AND rr.is_deleted = false
           LIMIT 1),
          0
        )
        WHERE EXISTS (
          SELECT 1 FROM commission_role_rates rr
          WHERE rr.rule_set_id = rs.id AND rr.is_deleted = false
        )
      `);
      await pool.query(`DROP TABLE IF EXISTS commission_role_rates`);
    }

    await pool.query(`ALTER TABLE collaborator_hierarchy ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`);
    await pool.query(`ALTER TABLE rental_commission_ledger ADD COLUMN IF NOT EXISTS from_user_id INTEGER REFERENCES users(id)`);
    await pool.query(`ALTER TABLE rental_commission_ledger DROP COLUMN IF EXISTS meta_json`);
    await pool.query(`ALTER TABLE payroll_snapshots ADD COLUMN IF NOT EXISTS saler_commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE payroll_snapshots ADD COLUMN IF NOT EXISTS driver_commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE payroll_snapshots ADD COLUMN IF NOT EXISTS paid_to_upline DECIMAL(12, 2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE payroll_snapshots ADD COLUMN IF NOT EXISTS received_from_downline DECIMAL(12, 2) NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE payroll_snapshots ADD COLUMN IF NOT EXISTS has_ledger_breakdown BOOLEAN NOT NULL DEFAULT FALSE`);

    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS secure_url TEXT`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS public_id VARCHAR(255)`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'cloudinary'`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS resource_type VARCHAR(20) DEFAULT 'image'`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS format VARCHAR(50)`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS width INTEGER`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS height INTEGER`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS bytes INTEGER`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE entity_images ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`);
    
    // Migration: Set pickup_branch_id to branch_id for existing records
    await pool.query(`UPDATE rentals SET pickup_branch_id = branch_id WHERE pickup_branch_id IS NULL AND branch_id IS NOT NULL`);
    await pool.query(`UPDATE rentals SET return_branch_id = COALESCE(pickup_branch_id, branch_id) WHERE return_branch_id IS NULL AND COALESCE(pickup_branch_id, branch_id) IS NOT NULL`);

    // Migration: Migrate deposit_amount to paid_amount for existing records
    await pool.query(`UPDATE rentals SET paid_amount = deposit_amount WHERE deposit_amount IS NOT NULL AND deposit_amount > 0 AND (paid_amount IS NULL OR paid_amount = 0)`);

    await migrateLegacyImages();
    await cleanupLegacyImageColumns();

    // Indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_customer ON rentals(customer_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_equipment ON rentals(equipment_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_is_deleted ON rentals(is_deleted)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_pickup_branch ON rentals(pickup_branch_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_return_branch ON rentals(return_branch_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_handover_user ON rentals(handover_user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ads_costs_date ON ads_costs(date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ads_costs_range ON ads_costs(start_date, end_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_misc_costs_date ON misc_costs(date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_misc_costs_range ON misc_costs(start_date, end_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entity_images_lookup ON entity_images(entity_type, entity_id, is_deleted, sort_order)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_entity_images_public_id ON entity_images(public_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_equipment_owner ON equipment(owner_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_commission_rule_sets_active ON commission_rule_sets(is_active, effective_from, effective_to) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_child_active ON collaborator_hierarchy(child_user_id, is_active) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_parent_active ON collaborator_hierarchy(parent_user_id, is_active) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_rental ON rental_commission_ledger(rental_id) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_user ON rental_commission_ledger(user_id) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_role ON rental_commission_ledger(source_role, line_type) WHERE is_deleted = false');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_inserted_at ON rental_commission_ledger(inserted_at)');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_images_one_primary
      ON entity_images(entity_type, entity_id)
      WHERE is_primary = true AND is_deleted = false
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_branch ON rentals(branch_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_user ON rentals(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rentals_dates ON rentals(start_date, end_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_blacklist_customer ON blacklist(customer_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_blacklist_active ON blacklist(customer_id, is_deleted) WHERE is_deleted = false AND unblacklisted_at IS NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_from_user ON rental_commission_ledger(from_user_id) WHERE is_deleted = false AND from_user_id IS NOT NULL');

    // Migration: Insert existing branch assignments from users table into user_branches
    await pool.query(`
      INSERT INTO user_branches (user_id, branch_id, inserted_by, updated_by)
      SELECT id, branch_id, inserted_by, updated_by
      FROM users
      WHERE branch_id IS NOT NULL AND is_deleted = false
      ON CONFLICT (user_id, branch_id) DO NOTHING
    `);

    console.log('--- Database Initialization Successful ---');
  } catch (err) {
    console.error('Critical DB Init Error:', err);
    if (process.env.DB_INIT_THROW === 'true' || require.main === module) {
      throw err;
    }
  }
};

// Initialize DB when this module is loaded by the app, or run it as a standalone migration script.
if (require.main === module) {
  initDB()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
} else if (process.env.DB_AUTO_INIT !== 'false') {
  initDB();
}

module.exports = { pool, initDB, migrateLegacyImages, cleanupLegacyImageColumns };
