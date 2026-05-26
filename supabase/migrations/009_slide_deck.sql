-- ============================================================
-- Migration 009 — slide_deck deliverable type (Phase 18)
-- ============================================================
-- 루미가 Opportunity Map을 슬라이드 형태로 변환하여 저장하기 위한 type 추가.
-- ============================================================

ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_type_check;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_type_check
  CHECK (type IN (
    'opportunity_map', 'product_blueprint', 'screen_designs',
    'business_model', 'frontend_code', 'a11y_audit',
    'legal_review', 'ethics_review', 'test_suite',
    'custom_report',
    'slide_deck'
  ));

-- ============================================================
-- 완료. slide_deck data 구조 예시:
--   { slides: [{ title, layout, content, speaker_notes }] }
-- ============================================================
