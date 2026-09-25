-- Migration 0024: Enhanced Incentives Management System (Multi-Type, Amounts, Recipients, Payment Channels, Vouchers)
ALTER TABLE incentives
    ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 10000.00 AFTER attendance_rate,
    ADD COLUMN payment_method ENUM('bank_transfer','mobile_money','cash_agent','voucher') NOT NULL DEFAULT 'cash_agent' AFTER payment_status,
    ADD COLUMN recipient_name VARCHAR(200) NULL AFTER payment_method,
    ADD COLUMN recipient_phone VARCHAR(20) NULL AFTER recipient_name,
    ADD COLUMN reconciliation_status ENUM('unreconciled','reconciled','flagged') NOT NULL DEFAULT 'unreconciled' AFTER disbursement_reference,
    ADD COLUMN reconciled_at DATETIME NULL AFTER reconciliation_status,
    ADD COLUMN reconciled_by CHAR(26) NULL AFTER reconciled_at,
    ADD COLUMN batch_reference VARCHAR(100) NULL AFTER reconciled_by,
    ADD COLUMN ward_id CHAR(26) NULL AFTER batch_reference,
    ADD COLUMN community_id CHAR(26) NULL AFTER ward_id;

-- Add index for fast querying
CREATE INDEX idx_inc_comm_month ON incentives (community_id, month);
CREATE INDEX idx_inc_ward_month ON incentives (ward_id, month);
CREATE INDEX idx_inc_batch ON incentives (batch_reference);

-- Backfill ward_id, community_id, and recipient information from children and households
UPDATE incentives i
INNER JOIN children c ON c.id = i.child_id
LEFT JOIN households h ON h.id = c.household_id
SET 
    i.ward_id = COALESCE(h.ward_id, c.ward_id),
    i.community_id = h.community_id,
    i.recipient_name = COALESCE(NULLIF(h.mother_name, ''), NULLIF(h.father_name, ''), CONCAT(c.first_name, ' Guardian')),
    i.recipient_phone = COALESCE(NULLIF(c.guardian_phone, ''), NULLIF(h.phone_number, ''))
WHERE i.ward_id IS NULL;
