-- Migration 0023: User Community Assignments for Mobilizers
CREATE TABLE IF NOT EXISTS user_community_assignments (
    id CHAR(26) PRIMARY KEY,
    user_id CHAR(26) NOT NULL,
    community_id CHAR(26) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_uca_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uca_community FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_community (user_id, community_id),
    INDEX idx_uca_user (user_id),
    INDEX idx_uca_community (community_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
