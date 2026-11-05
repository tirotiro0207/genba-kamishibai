-- 入口の画面で「@ のあと」に打つ名前（11/5 作者）。テナントの ID とは別に持ち、会社の名前をコードに書かずに DB にだけ置く。
-- 英小文字・数字・- だけ。無いテナントは入口から名前では入れない
ALTER TABLE tenants ADD COLUMN handle TEXT;
CREATE UNIQUE INDEX tenants_handle ON tenants (handle);
