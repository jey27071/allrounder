-- ============================================================
-- Migration 003 — Add Joi (Visual Design Agent)
-- ============================================================
-- Supabase SQL Editor에 통째로 붙여넣고 실행.
-- ============================================================

-- 1. agents.id 제약 확장
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_id_check;
ALTER TABLE agents ADD CONSTRAINT agents_id_check
  CHECK (id IN ('jarvis', 'lumi', 'aki', 'joi'));

-- 2. messages.sender 제약 확장
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_check
  CHECK (sender IN ('director', 'jarvis', 'lumi', 'aki', 'joi', 'system'));

-- 3. deliverables.type 제약 확장 (screen_designs 추가)
ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_type_check;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_type_check
  CHECK (type IN ('opportunity_map', 'product_blueprint', 'screen_designs'));

-- 4. missions.current_state 제약 확장 (Joi 관련 상태 추가)
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_current_state_check;
ALTER TABLE missions ADD CONSTRAINT missions_current_state_check
  CHECK (current_state IN (
    'MISSION_CREATED',
    'LUMI_WORKING', 'LUMI_RESUBMITTING',
    'AKI_REVIEWING',
    'WAITING_CP1',
    'AKI_DESIGNING', 'AKI_REVISING',
    'WAITING_CP2',
    'JOI_DESIGNING', 'JOI_REVISING',
    'WAITING_CP3',
    'COMPLETED', 'ERROR_STATE'
  ));

-- ============================================================
-- 완료. Joi 시드 데이터는 앱이 자동 INSERT (seedDatabase()).
-- ============================================================
