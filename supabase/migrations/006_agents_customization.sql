-- ============================================================
-- Migration 006 — Agent Customization
-- ============================================================
-- 목적
--   1. agents.id 화이트리스트 CHECK 제거 → 사용자가 임의 에이전트 추가 가능
--   2. messages.sender CHECK 동시 완화 (커스텀 에이전트가 메시지 작성 가능)
--   3. agents 테이블에 커스텀 메타 컬럼 추가 (is_custom, description, model,
--      deliverable_type)
--   4. agent_knowledge 테이블: 에이전트별 학습 자료(텍스트 스니펫)
--   5. agent_examples  테이블: few-shot 입력/출력 예시
--   6. deliverables.type 에 'custom_report' 추가 (사용자 정의 에이전트의
--      산출물 저장용)
--   7. RLS 정책 / updated_at 트리거 / Realtime publication
-- ============================================================

-- 1) agents.id 화이트리스트 제거
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_id_check;

-- 안전장치: 형식만 강제(소문자/숫자/언더스코어, 2~32자, 영문 시작)
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_id_format;
ALTER TABLE agents ADD CONSTRAINT agents_id_format
  CHECK (id ~ '^[a-z][a-z0-9_]{1,31}$');

-- 2) messages.sender 화이트리스트 제거 + 형식 제약
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_format;
ALTER TABLE messages ADD CONSTRAINT messages_sender_format
  CHECK (
    sender IN ('director', 'system')
    OR sender ~ '^[a-z][a-z0-9_]{1,31}$'
  );

-- 3) agents 메타 컬럼 추가
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_custom        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description      TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS model            TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deliverable_type TEXT;

COMMENT ON COLUMN agents.is_custom        IS 'TRUE이면 사용자가 UI로 추가한 커스텀 에이전트';
COMMENT ON COLUMN agents.model            IS 'NULL이면 Edge Function 기본값 사용 (gemini-2.5-flash)';
COMMENT ON COLUMN agents.deliverable_type IS '커스텀 에이전트의 산출물 타입. NULL이면 ''custom_report''';

-- 4) agent_knowledge — 에이전트별 학습 자료
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  source     TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent
  ON agent_knowledge(agent_id, active);

-- 5) agent_examples — few-shot 예시
CREATE TABLE IF NOT EXISTS agent_examples (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  label      TEXT,
  input      TEXT NOT NULL,
  output     TEXT NOT NULL,
  notes      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_examples_agent
  ON agent_examples(agent_id, active);

-- 6) deliverables.type 확장 — 커스텀 에이전트의 산출물
ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_type_check;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_type_check
  CHECK (type IN (
    'opportunity_map', 'product_blueprint', 'screen_designs',
    'business_model', 'frontend_code', 'a11y_audit',
    'legal_review', 'ethics_review', 'test_suite',
    'custom_report'
  ));

-- 7) RLS + 트리거 + Realtime
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_examples  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for MVP" ON agent_knowledge;
DROP POLICY IF EXISTS "Allow all for MVP" ON agent_examples;
CREATE POLICY "Allow all for MVP" ON agent_knowledge FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON agent_examples  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS agent_knowledge_set_updated_at ON agent_knowledge;
CREATE TRIGGER agent_knowledge_set_updated_at
  BEFORE UPDATE ON agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS agent_examples_set_updated_at ON agent_examples;
CREATE TRIGGER agent_examples_set_updated_at
  BEFORE UPDATE ON agent_examples
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 완료. 적용 후 앱에서 에이전트 추가/학습/프롬프트 버전 관리 가능.
-- ============================================================
