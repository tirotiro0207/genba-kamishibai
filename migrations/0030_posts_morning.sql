-- 発行の管理の続き（11/7 既定・作者の確認待ち）。どれも追記だけ（消すのはデータを戻す間だけ）。

-- card_posts: 署名済みのカードを貼った場所の表。カード・版・中身の指紋（署名の行の content_sha256）・場所・貼った人と時刻。
-- はがした時刻（removed_at / removed_by）だけは、まだはがしていない行に 1 回だけ入れられる。
-- 止めた・直したカードの貼った紙は、回収の知らせに「はがす紙」として並ぶ
CREATE TABLE card_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  card_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  place TEXT NOT NULL,
  posted_by TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  removed_at TEXT,
  removed_by TEXT
);
CREATE INDEX card_posts_card ON card_posts(tenant_id, card_id, id);
CREATE TRIGGER card_posts_no_update BEFORE UPDATE ON card_posts
WHEN NOT (OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL AND NEW.removed_by IS NOT NULL
  AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.card_id = OLD.card_id AND NEW.version = OLD.version
  AND NEW.content_sha256 = OLD.content_sha256 AND NEW.place = OLD.place AND NEW.posted_by = OLD.posted_by AND NEW.posted_at = OLD.posted_at)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER card_posts_no_delete BEFORE DELETE ON card_posts
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- sample_reviews: 週の抜き取りで選んだカードを、見直したという印。週・カード・版・見直した人・時刻・ひとこと
CREATE TABLE sample_reviews (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  week TEXT NOT NULL,
  card_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, week, card_id)
);
CREATE TRIGGER sample_reviews_no_update BEFORE UPDATE ON sample_reviews BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER sample_reviews_no_delete BEFORE DELETE ON sample_reviews
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;

-- morning_sets: 朝礼の組。その日の作業（言葉）に合わせて選んだ署名済みのカードの並び（id と版）。日付つきで残し、朝礼で使った回数を数える
CREATE TABLE morning_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  day TEXT NOT NULL,
  work TEXT NOT NULL,
  cards TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX morning_sets_tenant ON morning_sets(tenant_id, day, id);
CREATE TRIGGER morning_sets_no_update BEFORE UPDATE ON morning_sets BEGIN SELECT RAISE(ABORT, 'append only'); END;
CREATE TRIGGER morning_sets_no_delete BEFORE DELETE ON morning_sets
WHEN NOT EXISTS (SELECT 1 FROM resets WHERE tenant_id = OLD.tenant_id AND open = 1)
BEGIN SELECT RAISE(ABORT, 'append only'); END;
