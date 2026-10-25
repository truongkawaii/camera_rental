-- Create tables for camera rental system

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE,
  order_number INTEGER,
  address TEXT,
  address_detail TEXT,
  phone VARCHAR(20),
  map_url TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(20) UNIQUE NOT NULL,
  description TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role_id INTEGER REFERENCES roles(id), -- kept for legacy; use user_roles for multi-role
  branch_id INTEGER REFERENCES branches(id),
  full_name VARCHAR(100),
  base_salary DECIMAL(12, 2) DEFAULT 0,
  commission_rate DECIMAL(5, 4) DEFAULT 0,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- User-Role mapping table (many-to-many)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, role_id)
);

-- User-Branch mapping table (many-to-many)
CREATE TABLE IF NOT EXISTS user_branches (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, branch_id)
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  id_number VARCHAR(20),
  total_rentals INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Equipment categories
CREATE TABLE IF NOT EXISTS equipment_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Equipment table
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
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Rentals table
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
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Commission rule sets
CREATE TABLE IF NOT EXISTS commission_rule_sets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(20) NOT NULL,
  rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Commission rule set — user assignments (per-role: saler/driver)
CREATE TABLE IF NOT EXISTS commission_rule_set_users (
  id          SERIAL PRIMARY KEY,
  rule_set_id INTEGER NOT NULL REFERENCES commission_rule_sets(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_name   VARCHAR(20) NOT NULL,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by  INTEGER,
  is_deleted  BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, role_name)  -- each user can have one saler assignment and one driver assignment
);

-- Collaborator hierarchy and upstream sharing rates
CREATE TABLE IF NOT EXISTS collaborator_hierarchy (
  id SERIAL PRIMARY KEY,
  child_user_id INTEGER NOT NULL REFERENCES users(id),
  parent_user_id INTEGER NOT NULL REFERENCES users(id),
  share_rate_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Commission ledger lines for each rental
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
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Images table for polymorphic image attachments
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
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Rental accessories mapping table
CREATE TABLE IF NOT EXISTS rental_accessories (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER REFERENCES rentals(id) ON DELETE CASCADE,
  equipment_id INTEGER REFERENCES equipment(id),
  unit_price DECIMAL(10, 2) NOT NULL,
  unit_price_session DECIMAL(10, 2),
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Equipment maintenance table
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  maintenance_type VARCHAR(100),
  description TEXT,
  maintenance_cost DECIMAL(10, 2),
  maintenance_date TIMESTAMPTZ DEFAULT NOW(),
  completed_date TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'pending',
  provider VARCHAR(255),
  notes TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(50) DEFAULT 'medium',
  assigned_to VARCHAR(255),
  due_date TIMESTAMPTZ,
  related_rental_id INTEGER REFERENCES rentals(id),
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Financial transactions table
CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  rental_id INTEGER REFERENCES rentals(id),
  transaction_type VARCHAR(50),
  amount DECIMAL(10, 2),
  payment_method VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Payroll snapshots table (chốt lương ngày 5 hàng tháng)
CREATE TABLE IF NOT EXISTS payroll_snapshots (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month             VARCHAR(7) NOT NULL,
  full_name         VARCHAR(100),
  username          VARCHAR(50),
  role_name         VARCHAR(50),
  branch_name       VARCHAR(100),
  base_salary       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  commission_rate   DECIMAL(5, 4)  NOT NULL DEFAULT 0,
  managed_revenue   DECIMAL(14, 2) NOT NULL DEFAULT 0,
  commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total_payable     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  saler_commission_amount   DECIMAL(12, 2) NOT NULL DEFAULT 0,
  driver_commission_amount  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  paid_to_upline            DECIMAL(12, 2) NOT NULL DEFAULT 0,
  received_from_downline    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  has_ledger_breakdown      BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_amount              DECIMAL(12, 2) NOT NULL DEFAULT 0,
  locked_by         INTEGER REFERENCES users(id),
  locked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  inserted_by       INTEGER,
  updated_by        INTEGER,
  is_deleted        BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, month)
);

-- Sale monthly commission overrides (chính sách thi đua doanh số: admin ghi đè % / thưởng cho 1 tháng)
CREATE TABLE IF NOT EXISTS sale_monthly_commission_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL,
  rate_percent DECIMAL(8, 4),
  bonus_amount DECIMAL(12, 2),
  notes TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_monthly_overrides_user_month
  ON sale_monthly_commission_overrides(user_id, month);
ALTER TABLE sale_monthly_commission_overrides ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id);

-- Ads costs table
CREATE TABLE IF NOT EXISTS ads_costs (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  start_date DATE,
  end_date DATE,
  branch_id INTEGER REFERENCES branches(id),
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  platform VARCHAR(50),
  notes TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Miscellaneous costs table (chi phí phát sinh)
CREATE TABLE IF NOT EXISTS misc_costs (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  start_date DATE,
  end_date DATE,
  branch_id INTEGER REFERENCES branches(id),
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  category VARCHAR(100),
  notes TEXT,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(20) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  description TEXT NOT NULL,
  details JSONB,
  is_suspicious BOOLEAN DEFAULT FALSE,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Blacklist table
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  reason TEXT,
  blacklisted_at TIMESTAMPTZ DEFAULT NOW(),
  unblacklisted_at TIMESTAMPTZ,
  blacklisted_by INTEGER,
  unblacklisted_by INTEGER,
  inserted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  inserted_by INTEGER,
  updated_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rentals_customer ON rentals(customer_id);
CREATE INDEX IF NOT EXISTS idx_rentals_equipment ON rentals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_rentals_branch ON rentals(branch_id);
CREATE INDEX IF NOT EXISTS idx_rentals_user ON rentals(user_id);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON rentals(status);
CREATE INDEX IF NOT EXISTS idx_rentals_is_deleted ON rentals(is_deleted);
CREATE INDEX IF NOT EXISTS idx_rentals_pickup_branch ON rentals(pickup_branch_id);
CREATE INDEX IF NOT EXISTS idx_rentals_return_branch ON rentals(return_branch_id);
CREATE INDEX IF NOT EXISTS idx_rentals_dates ON rentals(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_customer ON blacklist(customer_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_active ON blacklist(customer_id, is_deleted) WHERE is_deleted = false AND unblacklisted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_ads_costs_date ON ads_costs(date);
CREATE INDEX IF NOT EXISTS idx_ads_costs_range ON ads_costs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_misc_costs_date ON misc_costs(date);
CREATE INDEX IF NOT EXISTS idx_misc_costs_range ON misc_costs(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_entity_images_lookup ON entity_images(entity_type, entity_id, is_deleted, sort_order);
CREATE INDEX IF NOT EXISTS idx_entity_images_public_id ON entity_images(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_images_one_primary
  ON entity_images(entity_type, entity_id)
  WHERE is_primary = true AND is_deleted = false;

-- Photobooth workspace. All records and foreign keys are intentionally isolated
-- from camera rentals, payroll, equipment and their reports.
CREATE TABLE IF NOT EXISTS pb_services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('shoot', 'print', 'other')),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_gifts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  sku VARCHAR(80),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_gift_movements (
  id BIGSERIAL PRIMARY KEY,
  gift_id INTEGER NOT NULL REFERENCES pb_gifts(id),
  delta INTEGER NOT NULL,
  reason VARCHAR(80) NOT NULL,
  transaction_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_assets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  code VARCHAR(80),
  kind VARCHAR(80) NOT NULL DEFAULT 'Thiết bị',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'offline')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_staff (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'Nhân viên',
  phone VARCHAR(30),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_incidents (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES pb_assets(id),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title VARCHAR(240) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_shifts (
  id SERIAL PRIMARY KEY,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  staff_id INTEGER NOT NULL REFERENCES pb_staff(id),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'working', 'done')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_tasks (
  id SERIAL PRIMARY KEY,
  work_date DATE NOT NULL,
  title VARCHAR(240) NOT NULL,
  staff_id INTEGER REFERENCES pb_staff(id),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pb_transactions (
  id SERIAL PRIMARY KEY,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_id INTEGER NOT NULL REFERENCES pb_services(id),
  service_name VARCHAR(160) NOT NULL,
  category VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card')),
  staff_id INTEGER REFERENCES pb_staff(id),
  customer_source VARCHAR(30) CHECK (customer_source IN ('walk_in', 'social', 'referral', 'other')),
  customer_count INTEGER NOT NULL DEFAULT 1 CHECK (customer_count >= 0),
  gift_id INTEGER REFERENCES pb_gifts(id),
  gift_quantity INTEGER NOT NULL DEFAULT 0 CHECK (gift_quantity >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pb_transactions_happened_at ON pb_transactions(happened_at);
CREATE INDEX IF NOT EXISTS idx_pb_shifts_work_date ON pb_shifts(work_date);
CREATE INDEX IF NOT EXISTS idx_pb_tasks_work_date ON pb_tasks(work_date);
CREATE INDEX IF NOT EXISTS idx_pb_gift_movements_gift ON pb_gift_movements(gift_id);
CREATE INDEX IF NOT EXISTS idx_pb_incidents_asset ON pb_incidents(asset_id, reported_at DESC);

-- Insphoto order and finance workflow. Existing Photobooth sales remain valid;
-- columns are added without touching camera-rental tables.
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS sale_date DATE;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS customer_name VARCHAR(160);
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS cash_received NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS transfer_received NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS cash_in_drawer NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS change_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS shift_label VARCHAR(40);
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE pb_transactions ADD COLUMN IF NOT EXISTS source_mode VARCHAR(24) NOT NULL DEFAULT 'counter';
ALTER TABLE pb_transactions DROP CONSTRAINT IF EXISTS pb_transactions_source_mode_check;
ALTER TABLE pb_transactions ADD CONSTRAINT pb_transactions_source_mode_check CHECK (source_mode IN ('counter','machine_self','machine_exchange'));
ALTER TABLE pb_shifts ADD COLUMN IF NOT EXISTS label VARCHAR(40);
ALTER TABLE pb_shifts DROP CONSTRAINT IF EXISTS pb_shifts_status_check;
ALTER TABLE pb_shifts ADD CONSTRAINT pb_shifts_status_check CHECK (status IN ('scheduled','working','done','cancelled'));
UPDATE pb_transactions SET sale_date=(happened_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date WHERE sale_date IS NULL;
UPDATE pb_transactions SET cash_received=total_amount, cash_in_drawer=total_amount WHERE payment_method='cash' AND cash_received=0 AND transfer_received=0;
UPDATE pb_transactions SET transfer_received=total_amount WHERE payment_method='transfer' AND cash_received=0 AND transfer_received=0;
ALTER TABLE pb_transactions DROP CONSTRAINT IF EXISTS pb_transactions_payment_method_check;
ALTER TABLE pb_transactions ADD CONSTRAINT pb_transactions_payment_method_check CHECK (payment_method IN ('cash','transfer','card','mixed'));
CREATE INDEX IF NOT EXISTS idx_pb_transactions_sale_date ON pb_transactions(sale_date, status);
CREATE INDEX IF NOT EXISTS idx_pb_transactions_phone ON pb_transactions(customer_phone) WHERE customer_phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS pb_cash_movements (
  id SERIAL PRIMARY KEY,
  movement_date DATE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('opening','in','out','exchange')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  staff_id INTEGER REFERENCES pb_staff(id),
  note TEXT,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pb_cash_movements_date ON pb_cash_movements(movement_date);
ALTER TABLE pb_cash_movements ADD COLUMN IF NOT EXISTS shift_label VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_cash_one_shift_opening ON pb_cash_movements(movement_date,shift_label) WHERE type='opening' AND voided_at IS NULL AND shift_label IS NOT NULL;
CREATE TABLE IF NOT EXISTS pb_cash_closures (
  id SERIAL PRIMARY KEY,
  close_date DATE NOT NULL,
  expected_amount NUMERIC(12,2) NOT NULL,
  actual_amount NUMERIC(12,2) NOT NULL CHECK (actual_amount >= 0),
  difference_amount NUMERIC(12,2) NOT NULL,
  staff_id INTEGER REFERENCES pb_staff(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pb_cash_closures_date ON pb_cash_closures(close_date);
ALTER TABLE pb_cash_closures ADD COLUMN IF NOT EXISTS shift_label VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_cash_one_shift_closure ON pb_cash_closures(close_date,shift_label) WHERE shift_label IS NOT NULL;
CREATE TABLE IF NOT EXISTS pb_machine_movements (
  id SERIAL PRIMARY KEY,
  movement_date DATE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('opening','collect')),
  destination VARCHAR(20) CHECK (destination IN ('counter','bank')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  staff_id INTEGER REFERENCES pb_staff(id),
  note TEXT,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((type='opening' AND destination IS NULL) OR (type='collect' AND destination IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_machine_one_opening ON pb_machine_movements(movement_date) WHERE type='opening' AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pb_machine_movements_date ON pb_machine_movements(movement_date);
ALTER TABLE pb_machine_movements ADD COLUMN IF NOT EXISTS shift_label VARCHAR(40);
CREATE TABLE IF NOT EXISTS pb_machine_counts (
  id SERIAL PRIMARY KEY,
  count_date DATE NOT NULL,
  expected_amount NUMERIC(12,2) NOT NULL,
  actual_amount NUMERIC(12,2) NOT NULL CHECK (actual_amount >= 0),
  difference_amount NUMERIC(12,2) NOT NULL,
  staff_id INTEGER REFERENCES pb_staff(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pb_machine_counts_date ON pb_machine_counts(count_date);
CREATE TABLE IF NOT EXISTS pb_expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('other','ads','rent','salary')),
  staff_id INTEGER REFERENCES pb_staff(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT NOT NULL,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash','transfer')),
  recorded_by VARCHAR(160),
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pb_expenses_date ON pb_expenses(expense_date);
CREATE TABLE IF NOT EXISTS pb_attendance (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES pb_staff(id),
  work_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','half_day','leave','absent')),
  check_in TIME,
  check_out TIME,
  note TEXT,
  recorded_by VARCHAR(160),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, work_date),
  CHECK (check_in IS NULL OR check_out IS NULL OR check_out > check_in)
);
CREATE INDEX IF NOT EXISTS idx_pb_attendance_date ON pb_attendance(work_date);
ALTER TABLE pb_expenses ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES pb_staff(id);
ALTER TABLE pb_expenses DROP CONSTRAINT IF EXISTS pb_expenses_category_check;
ALTER TABLE pb_expenses ADD CONSTRAINT pb_expenses_category_check CHECK (category IN ('other','ads','rent','salary'));
CREATE TABLE IF NOT EXISTS pb_user_access (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commission_rule_sets_active ON commission_rule_sets(is_active, effective_from, effective_to) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_child_active ON collaborator_hierarchy(child_user_id, is_active) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_parent_active ON collaborator_hierarchy(parent_user_id, is_active) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_rental ON rental_commission_ledger(rental_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_user ON rental_commission_ledger(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_role ON rental_commission_ledger(source_role, line_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_from_user ON rental_commission_ledger(from_user_id) WHERE is_deleted = false AND from_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_inserted_at ON rental_commission_ledger(inserted_at);

-- Weekly availability is reviewed before becoming an official pb_shifts schedule.
CREATE TABLE IF NOT EXISTS pb_shift_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  slots JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO pb_shift_settings(id,slots) VALUES(1,'[{"key":"morning","label":"Ca sáng","start":"09:00","end":"13:00"},{"key":"afternoon","label":"Ca chiều","start":"13:00","end":"17:00"},{"key":"evening","label":"Ca tối","start":"17:00","end":"22:00"}]') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pb_shift_registrations (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES pb_staff(id),
  week_start DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start)=1),
  selections JSONB NOT NULL CHECK (jsonb_typeof(selections)='array'),
  note TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 1,
  submitted_by TEXT,
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id,week_start)
);
CREATE INDEX IF NOT EXISTS idx_pb_shift_registrations_week ON pb_shift_registrations(week_start,status);
