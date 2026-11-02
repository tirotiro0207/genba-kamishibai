-- 経路とカードのデータの形（019）。body はカードの JSON（守ること・なぜ・文と元の位置・動き・部品の経路）。
-- 状態の移り方は src/shared/card.ts で決め、ここでは名前だけを縛る。版は直すたびに 1 つ上がる
ALTER TABLE cards ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ai_draft', 'pending', 'ok', 'signed', 'stopped'));
ALTER TABLE cards ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cards ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
CREATE INDEX cards_status ON cards(tenant_id, status);
