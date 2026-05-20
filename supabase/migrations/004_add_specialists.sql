-- ============================================================
-- Migration 004 — Add 6 Specialist Agents
-- ============================================================
-- 프라이데이·타스·에코·키트·에씨카·QA봇 추가
-- ============================================================

-- 1. agents.id 제약 확장
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_id_check;
ALTER TABLE agents ADD CONSTRAINT agents_id_check
  CHECK (id IN ('jarvis', 'lumi', 'aki', 'joi', 'friday', 'tars', 'echo', 'kitt', 'ethica', 'qa_bot'));

-- 2. messages.sender 제약 확장
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_check
  CHECK (sender IN ('director', 'jarvis', 'lumi', 'aki', 'joi', 'friday', 'tars', 'echo', 'kitt', 'ethica', 'qa_bot', 'system'));

-- 3. deliverables.type 제약 확장 (specialist 산출물 추가)
ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_type_check;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_type_check
  CHECK (type IN (
    'opportunity_map', 'product_blueprint', 'screen_designs',
    'business_model', 'frontend_code', 'a11y_audit', 'legal_review', 'ethics_review', 'test_suite'
  ));

-- ============================================================
-- 완료. Specialist 시드 데이터는 앱이 자동 INSERT (seedDatabase()).
-- ============================================================
