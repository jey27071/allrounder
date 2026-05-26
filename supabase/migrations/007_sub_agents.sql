-- ============================================================
-- Migration 007 — Sub-Agents (Phase 13)
-- ============================================================
-- 목적
--   1. agents 테이블에 parent_agent_id 컬럼 추가 (NULL이면 최상위)
--   2. 부모-자식 조회용 인덱스
--   3. is_custom 디폴트 검증 (006에서 추가됨)
--   * 4명의 하위 에이전트 시드 자체는 앱이 자동 처리(seed.ts).
-- ============================================================

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS parent_agent_id TEXT
    REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_parent
  ON agents(parent_agent_id);

COMMENT ON COLUMN agents.parent_agent_id IS
  'NULL이면 최상위 에이전트. 값이 있으면 그 부모의 하위팀 멤버. 부모 호출 시 자동으로 병렬 실행됨.';

-- ============================================================
-- 완료. 적용 후 앱을 새로고침하면 seedDatabase()가 4명의 하위
-- 에이전트(lumi_data, lumi_scout, aki_ia, aki_flow)를 자동 INSERT.
-- ============================================================
