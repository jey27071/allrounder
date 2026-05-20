-- 미션 보관(아카이브) 기능
-- archived = TRUE인 미션은 기본 목록에서 숨김. 디렉터가 명시적으로 복구하거나 영구 삭제 가능.

ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_missions_archived ON missions(archived) WHERE archived = TRUE;
