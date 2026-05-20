-- ============================================================
-- Allrounder Multi-Agent Orchestrator
-- Initial Schema Migration
-- ============================================================
-- Supabase Dashboard → SQL Editor 에 통째로 붙여넣고 실행하세요.
-- ============================================================

-- 1. missions
CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  domain TEXT NOT NULL,
  charter TEXT NOT NULL,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'paused', 'completed', 'error')),
  current_state TEXT NOT NULL DEFAULT 'MISSION_CREATED'
    CHECK (current_state IN (
      'MISSION_CREATED', 'LUMI_WORKING', 'AKI_REVIEWING', 'LUMI_RESUBMITTING',
      'WAITING_CP1', 'AKI_DESIGNING', 'WAITING_CP2', 'AKI_REVISING',
      'COMPLETED', 'ERROR_STATE'
    )),
  reject_cycle INTEGER NOT NULL DEFAULT 0,
  selected_candidate_index INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_created_at ON missions(created_at DESC);

-- 2. agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY CHECK (id IN ('jarvis', 'lumi', 'aki')),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  current_version TEXT NOT NULL DEFAULT 'v1.0',
  system_prompt TEXT NOT NULL,
  color_token TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. agent_versions
CREATE TABLE agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  changelog TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, version)
);

-- 4. messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL
    CHECK (sender IN ('director', 'jarvis', 'lumi', 'aki', 'system')),
  recipient TEXT,
  cc TEXT[],
  re TEXT,
  type TEXT NOT NULL
    CHECK (type IN (
      'Deliverable', 'Reject', 'Question', 'Approval',
      'Escalation', 'UserInput', 'StatusUpdate'
    )),
  cycle TEXT,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_mission_created ON messages(mission_id, created_at);

-- 5. deliverables
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('opportunity_map', 'product_blueprint')),
  version TEXT NOT NULL,
  data JSONB NOT NULL,
  raw_markdown TEXT,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  review_score INTEGER,
  review_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'revised', 'final')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliverables_mission_type ON deliverables(mission_id, type);

-- 6. diaries
CREATE TABLE diaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  context_label TEXT,
  difficulty TEXT,
  insight TEXT,
  next_try TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. wisdom_principles
CREATE TABLE wisdom_principles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  applies_to TEXT[] NOT NULL,
  source_diary_ids UUID[],
  version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- MVP는 단일 사용자라 모든 작업 허용
-- ============================================================

ALTER TABLE missions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables      ENABLE ROW LEVEL SECURITY;
ALTER TABLE diaries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wisdom_principles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for MVP" ON missions          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON agents            FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON agent_versions    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON messages          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON deliverables      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON diaries           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for MVP" ON wisdom_principles FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- updated_at 자동 갱신 트리거 (missions, agents)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER missions_set_updated_at
  BEFORE UPDATE ON missions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER agents_set_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Supabase Realtime 활성화 (프론트엔드 실시간 구독용)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE missions;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE deliverables;

-- ============================================================
-- 완료. 다음: 002_seed_agents.sql 에서 에이전트 시드 데이터 삽입
-- ============================================================
