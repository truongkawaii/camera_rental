-- Migration: Change transfer_date from DATE to TIMESTAMPTZ
-- Date: 2026-08-02
-- Description: Support datetime (date + time) for transfer records

ALTER TABLE sales_transfer_logs
ALTER COLUMN transfer_date TYPE TIMESTAMPTZ
USING transfer_date::timestamptz;

ALTER TABLE sales_transfer_logs
ALTER COLUMN transfer_date SET DEFAULT NOW();
