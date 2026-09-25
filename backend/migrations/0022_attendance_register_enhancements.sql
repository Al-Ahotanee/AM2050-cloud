-- Migration 0022: Attendance Register Enhancements (Notes, Recorded By, Class/Date Indexes)
ALTER TABLE attendance
    ADD COLUMN notes VARCHAR(255) NULL AFTER attendance_status,
    ADD COLUMN recorded_by CHAR(26) NULL AFTER scanned_by;

-- Performance index for daily class register lookups and month matrices
CREATE INDEX idx_att_class_month ON attendance(class_id, date, attendance_status);
