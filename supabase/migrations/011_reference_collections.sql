-- ============================================================
-- Migration 011 — Reference Collections (Phase 22)
-- ============================================================
-- 에이전트별 참고 이미지를 컬렉션(폴더·그룹)으로 분류.
-- 한 에이전트가 여러 컬렉션 보유, 한 이미지는 0~1개 컬렉션 소속.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_reference_collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,          -- 선택: 컬렉션 색상(시각 구분), Tailwind 토큰 또는 hex
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ref_collections_agent
  ON agent_reference_collections(agent_id, sort_order);

ALTER TABLE agent_reference_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for MVP" ON agent_reference_collections;
CREATE POLICY "Allow all for MVP" ON agent_reference_collections FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS ref_collections_set_updated_at ON agent_reference_collections;
CREATE TRIGGER ref_collections_set_updated_at
  BEFORE UPDATE ON agent_reference_collections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- agent_visual_references에 collection_id 추가
-- 컬렉션 삭제 시 이미지는 남고 collection_id만 NULL이 됨 (미분류)
-- ============================================================

ALTER TABLE agent_visual_references
  ADD COLUMN IF NOT EXISTS collection_id UUID
    REFERENCES agent_reference_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visual_refs_collection
  ON agent_visual_references(collection_id);

COMMENT ON COLUMN agent_visual_references.collection_id IS
  'NULL이면 미분류 컬렉션. 컬렉션 삭제 시 자동으로 NULL.';

-- ============================================================
-- 완료.
-- ============================================================
