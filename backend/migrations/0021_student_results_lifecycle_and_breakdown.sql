-- Migration 0021: Student Results Lifecycle (Draft / Submitted / Published), CA + Exam Breakdown, and Report Cards
ALTER TABLE student_results
    ADD COLUMN ca_score DECIMAL(5,2) NULL AFTER score,
    ADD COLUMN exam_score DECIMAL(5,2) NULL AFTER ca_score,
    ADD COLUMN status ENUM('draft', 'submitted', 'published') NOT NULL DEFAULT 'published' AFTER grade,
    ADD COLUMN submitted_by CHAR(26) NULL AFTER recorded_by,
    ADD COLUMN submitted_at DATETIME NULL AFTER submitted_by,
    ADD COLUMN published_by CHAR(26) NULL AFTER submitted_at,
    ADD COLUMN published_at DATETIME NULL AFTER published_by,
    ADD COLUMN published_note VARCHAR(255) NULL AFTER published_at;

-- Ensure existing legacy / UAT records are marked as published with timestamp
UPDATE student_results SET status = 'published', published_at = NOW() WHERE published_at IS NULL;

-- Composite indexes for high-speed term/class ledger queries
CREATE INDEX idx_student_results_term_status ON student_results(term_id, status);
CREATE INDEX idx_student_results_enr_term ON student_results(enrollment_id, term_id);
