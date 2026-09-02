-- Migration: Add commission breakdown columns to payroll_snapshots
-- Date: 2026-07-07
-- Description: Add columns for saler/driver commission breakdown and upline/downline sharing

ALTER TABLE payroll_snapshots
ADD COLUMN IF NOT EXISTS saler_commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS driver_commission_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS paid_to_upline DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS received_from_downline DECIMAL(12, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_ledger_breakdown BOOLEAN NOT NULL DEFAULT FALSE;
