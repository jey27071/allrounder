-- ============================================================
-- Migration 012 — Physical Product Workflow (Phase 25)
-- ============================================================
-- missions.mission_type 컬럼 + 새 deliverable types (산업디자인·기구·코스트·패키징).
-- UI 디자인(현재) vs 물리 제품 분기를 위한 인프라.
-- ============================================================

-- 1) missions.mission_type
ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS mission_type TEXT NOT NULL DEFAULT 'ui_design';

ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_mission_type_check;
ALTER TABLE missions ADD CONSTRAINT missions_mission_type_check
  CHECK (mission_type IN ('ui_design', 'physical_product'));

COMMENT ON COLUMN missions.mission_type IS
  'ui_design = 기존 UI 디자인 워크플로우 (조이). physical_product = 물리 제품 (이지·메카·포지·파코).';

-- 2) deliverables.type 확장
ALTER TABLE deliverables DROP CONSTRAINT IF EXISTS deliverables_type_check;
ALTER TABLE deliverables ADD CONSTRAINT deliverables_type_check
  CHECK (type IN (
    'opportunity_map', 'product_blueprint', 'screen_designs',
    'business_model', 'frontend_code', 'a11y_audit',
    'legal_review', 'ethics_review', 'test_suite',
    'custom_report',
    'slide_deck',
    -- Phase 25: 물리 제품 산출물
    'industrial_design',
    'mechanical_spec',
    'cost_estimate',
    'packaging_spec'
  ));

-- ============================================================
-- 완료. 이후 페르소나(이지/메카/포지/파코)는 앱 seed가 자동 INSERT.
-- ============================================================
