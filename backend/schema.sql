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
  locked_by         INTEGER REFERENCES users(id),
  locked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  inserted_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  inserted_by       INTEGER,
  updated_by        INTEGER,
  is_deleted        BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, month)
);

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
CREATE INDEX IF NOT EXISTS idx_commission_rule_sets_active ON commission_rule_sets(is_active, effective_from, effective_to) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_child_active ON collaborator_hierarchy(child_user_id, is_active) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_collaborator_hierarchy_parent_active ON collaborator_hierarchy(parent_user_id, is_active) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_rental ON rental_commission_ledger(rental_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_user ON rental_commission_ledger(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_role ON rental_commission_ledger(source_role, line_type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_from_user ON rental_commission_ledger(from_user_id) WHERE is_deleted = false AND from_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rental_commission_ledger_inserted_at ON rental_commission_ledger(inserted_at);
