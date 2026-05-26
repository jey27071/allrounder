-- ============================================================
-- Migration 008 — Agent Design Systems (Phase 17)
-- ============================================================
-- 목적
--   에이전트별 "디자인 시스템"을 구조화된 형태로 저장.
--   조이(또는 비주얼 작업 에이전트)가 시안 생성 시 활성 디자인 시스템을
--   시스템 프롬프트에 첨부하고, 산출물 검증에도 사용.
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_design_systems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  -- 구조화된 토큰: color/font/spacing/radius 등
  tokens      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 컴포넌트 카탈로그 (재사용 패턴)
  components  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 자유 텍스트 원칙 (보이스·톤·금기사항 등)
  principles  TEXT,
  -- 원본 JSON paste 보존 (사용자 입력 그대로)
  source_raw  TEXT,
  active      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_design_systems_agent
  ON agent_design_systems(agent_id, active);

-- 한 에이전트당 동시에 활성은 하나만. 부분 인덱스로 강제.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_design_systems_active_per_agent
  ON agent_design_systems(agent_id)
  WHERE active = TRUE;

COMMENT ON TABLE agent_design_systems IS
  '에이전트별 디자인 시스템. 활성 항목은 시스템 프롬프트에 자동 첨부.';
COMMENT ON COLUMN agent_design_systems.tokens IS
  '{ colors: {...}, typography: {...}, spacing: {...}, radius: {...} } 형태 JSON';
COMMENT ON COLUMN agent_design_systems.components IS
  '[{ name, purpose, props, example }] 컴포넌트 카탈로그';

-- RLS
ALTER TABLE agent_design_systems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for MVP" ON agent_design_systems;
CREATE POLICY "Allow all for MVP" ON agent_design_systems FOR ALL USING (true) WITH CHECK (true);

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS agent_design_systems_set_updated_at ON agent_design_systems;
CREATE TRIGGER agent_design_systems_set_updated_at
  BEFORE UPDATE ON agent_design_systems
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 완료. 적용 후 앱에서 에이전트별 디자인 시스템 등록·활성화 가능.
-- ============================================================
