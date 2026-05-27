-- ============================================================
-- Migration 010 — Agent Visual References (Phase 20)
-- ============================================================
-- 에이전트에 이미지로 학습 자료 제공.
-- 실제 이미지는 Supabase Storage bucket('agent-references')에,
-- DB엔 path와 메타만 저장.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_visual_references (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  storage_path TEXT NOT NULL,   -- agent-references bucket 내 경로 (예: 'joi/{uuid}.png')
  mime_type    TEXT NOT NULL,   -- 'image/png' | 'image/jpeg' | 'image/webp' ...
  file_size    INTEGER,         -- bytes
  width        INTEGER,
  height       INTEGER,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visual_refs_agent
  ON agent_visual_references(agent_id, active);

ALTER TABLE agent_visual_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for MVP" ON agent_visual_references;
CREATE POLICY "Allow all for MVP" ON agent_visual_references FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS visual_refs_set_updated_at ON agent_visual_references;
CREATE TRIGGER visual_refs_set_updated_at
  BEFORE UPDATE ON agent_visual_references
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Storage bucket은 SQL이 아닌 Dashboard에서 만들어야 합니다.
--   Dashboard > Storage > New bucket
--     - Name: agent-references
--     - Public: OFF (private, signed URL로 접근)
--
-- 또는 아래 SQL로 생성 (관리자 권한 필요):
-- ============================================================

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('agent-references', 'agent-references', false)
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Storage RLS — 인증 없이도 모두 읽기/쓰기 허용 (MVP 단일 사용자 가정)
-- 실제 운영에선 사용자별 격리 필요.
-- ============================================================

-- Dashboard > Storage > Policies > New policy 에서 또는 아래 SQL:

-- CREATE POLICY "Allow anon read agent-references"
--   ON storage.objects FOR SELECT TO anon
--   USING (bucket_id = 'agent-references');

-- CREATE POLICY "Allow anon write agent-references"
--   ON storage.objects FOR INSERT TO anon
--   WITH CHECK (bucket_id = 'agent-references');

-- CREATE POLICY "Allow anon update agent-references"
--   ON storage.objects FOR UPDATE TO anon
--   USING (bucket_id = 'agent-references');

-- CREATE POLICY "Allow anon delete agent-references"
--   ON storage.objects FOR DELETE TO anon
--   USING (bucket_id = 'agent-references');

-- ============================================================
-- 완료. 적용 후 UI에서 이미지 업로드 가능.
-- ============================================================
