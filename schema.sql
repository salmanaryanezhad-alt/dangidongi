-- =============================================================
-- دنگی‌دنگی — طرح دیتابیس (۵ جدول)
-- یک‌بار روی MySQL اجرا کنید (مثلاً در phpMyAdmin یا:
--   mysql -u USER -p < schema.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS dangidongi
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_persian_ci;

USE dangidongi;

-- هر خونه با اسم و کد دعوت
CREATE TABLE IF NOT EXISTS houses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    invite_code CHAR(6) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_houses_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- اعضای هر خونه با یه توکن ساده
CREATE TABLE IF NOT EXISTS members (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    house_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    token CHAR(48) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_members_token (token),
    KEY idx_members_house (house_id),
    CONSTRAINT fk_members_house FOREIGN KEY (house_id)
        REFERENCES houses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- هر هزینه (نام، مبلغ، پرداخت‌کننده)
-- مبلغ BIGINT: عدد صحیح تومان، بدون اعشار
CREATE TABLE IF NOT EXISTS expenses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    house_id INT UNSIGNED NOT NULL,
    payer_member_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_expenses_house (house_id),
    KEY idx_expenses_payer (payer_member_id),
    CONSTRAINT fk_expenses_house FOREIGN KEY (house_id)
        REFERENCES houses (id) ON DELETE CASCADE,
    CONSTRAINT fk_expenses_payer FOREIGN KEY (payer_member_id)
        REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- ضریب و سهم هر عضو از هر هزینه
-- هم ضریب (0، 1، 2، ...) هم مبلغ نهایی سهم نگه داشته می‌شه
CREATE TABLE IF NOT EXISTS expense_shares (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    expense_id BIGINT UNSIGNED NOT NULL,
    member_id INT UNSIGNED NOT NULL,
    weight INT NOT NULL DEFAULT 0,
    share BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_shares_expense (expense_id),
    KEY idx_shares_member (member_id),
    CONSTRAINT fk_shares_expense FOREIGN KEY (expense_id)
        REFERENCES expenses (id) ON DELETE CASCADE,
    CONSTRAINT fk_shares_member FOREIGN KEY (member_id)
        REFERENCES members (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;

-- هر تغییر اینجا ثبت می‌شه، برای SSE
CREATE TABLE IF NOT EXISTS events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    house_id INT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    payload TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_events_house_id (house_id),
    CONSTRAINT fk_events_house FOREIGN KEY (house_id)
        REFERENCES houses (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_persian_ci;
