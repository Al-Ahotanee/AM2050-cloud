ALTER TABLE users
  ADD COLUMN signature_data MEDIUMTEXT NULL AFTER photo_data;

ALTER TABLE enrollments
  ADD COLUMN receiving_school_id CHAR(26) NULL AFTER receiving_school_name;

ALTER TABLE enrollments
  ADD COLUMN approved_signature_data MEDIUMTEXT NULL AFTER approved_at;

ALTER TABLE enrollments
  ADD COLUMN transition_signature_data MEDIUMTEXT NULL AFTER transitioned_at;

ALTER TABLE enrollments
  ADD CONSTRAINT fk_enr_receiving_school FOREIGN KEY (receiving_school_id) REFERENCES schools(id);

CREATE TABLE IF NOT EXISTS guardian_certificate_alerts (
  id CHAR(26) NOT NULL PRIMARY KEY,
  guardian_user_id CHAR(26) NOT NULL,
  child_id CHAR(26) NOT NULL,
  enrollment_id CHAR(26) NOT NULL,
  certificate_type ENUM('transfer','withdrawal') NOT NULL,
  title VARCHAR(180) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_by CHAR(26) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guardian_certificate_alert (guardian_user_id,enrollment_id,certificate_type),
  KEY idx_guardian_alert_inbox (guardian_user_id,is_read,created_at),
  CONSTRAINT fk_gca_guardian FOREIGN KEY (guardian_user_id) REFERENCES users(id),
  CONSTRAINT fk_gca_child FOREIGN KEY (child_id) REFERENCES children(id),
  CONSTRAINT fk_gca_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  CONSTRAINT fk_gca_actor FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
