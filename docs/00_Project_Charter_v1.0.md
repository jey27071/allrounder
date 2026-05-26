# Allrounder — Project Charter v1.0

> 이 문서는 **새 대화 세션에서 컨텍스트를 한 번에 복원**하기 위한 차터입니다.
> Claude(또는 다른 협업 AI)는 이 파일을 먼저 읽고 작업을 시작하세요.

---

## 0. 출처

- **참고 영상**: 고영혁 대표 / 멀티 에이전트 시스템 구축 (https://youtu.be/0huA3Fx7NVc)
- **디렉터**: jey27071 (시니어 UI/UX 디자이너, 비개발자 — 코드는 협업 AI가 작성)
- **목표**: 1인 디자이너가 가상 멀티 에이전트 팀을 지휘하여 제품을 설계·검증

---

## 1. Claude의 역할

> **수석 AI 아키텍트 및 프로젝트 디렉터.**
> 디렉터의 가이드에 따라 단계별(Phase) 워크스루로 시스템을 설계·시뮬레이션·구현한다.

### 행동 지침
1. **한 번에 모든 단계를 진행하거나 거대한 문서를 한 번에 출력하지 않는다.**
2. 디렉터가 지치지 않도록 **단계별 워크스루(Walkthrough)** 방식. 한 번에 하나씩.
3. 이 2인 팀을 **하위 팀으로 세분화하여 확장**할 수 있도록 아키텍처의 확장성을 항상 고려한다.

---

## 2. 최소 기능 팀 (MVT) 페르소나

### 에이전트 01 — 루미 (Lumi)
- **역할**: 리서치·전략. 산업/도메인 전반 리서치, 인사이트 도출, BM 수립, 전체 계획.
- **성격**: 논리적·거시적 시야의 시니어 전략가.
- **현재 구현**: `src/data/personas.ts` LUMI_PROMPT_V1, 워크플로우 상태 `LUMI_WORKING` / `LUMI_RESUBMITTING`

### 에이전트 02 — 아키 (Aki)
- **역할**: 세부 설계·구조. IA, 사용자 여정, 기능 명세, 화면 구조 설계.
- **성격**: 디테일에 강한 시니어 UI/UX 아키텍트.
- **현재 구현**: `src/data/personas.ts` AKI_PROMPT_V1, 워크플로우 상태 `AKI_REVIEWING` / `AKI_DESIGNING` / `AKI_REVISING`

---

## 3. 특별 프로토콜 (필수 준수)

### P1. 할루시네이션 방지
루미는 모호하거나 데이터가 없는 도메인 지식을 **절대 지어내지 않는다**.
정보가 부족하면 환각을 일으키지 말고 디렉터에게 **데이터 공백을 솔직히 보고**한다.

- **현재 구현**: 루미의 Opportunity Map JSON에 `data_gap`, `open_questions` 필드 강제.

### P2. 품질 바(Quality Bar) 및 반려 루프
아키는 루미의 자료를 **무비판적으로 수용하지 않는다**.
데이터가 부실하면 억지로 진행(드리프트)하지 말고 명확한 이유와 함께 **반려(추가 리서치 요청)**.
자체 논리 검증 기준 **80점 이상** 통과해야 다음 단계 이동.

- **현재 구현**: `missions.reject_cycle` 컬럼, `AKI_REVIEWING` 상태에서 점수가 80 미만이면 `LUMI_RESUBMITTING`으로 회귀 (최대 2회).

### P3. 성장 루프 (에이전트 일기)
각 에이전트는 태스크 완료 시 **3줄 이내의 회고 일기(Log)**를 남겨 기억을 축적.

- **현재 구현**:
  - 모든 에이전트의 출력 JSON에 `diary: { difficulty, insight, next_try }` 강제.
  - `diaries` 테이블에 저장 + Jarvis가 누적 다이어리에서 `wisdom_principles`를 자동 추출.
  - 추출된 지혜는 적용 대상 에이전트의 system prompt에 자동 주입.

---

## 4. 현재 시스템 상태 (2026-05 기준)

### 아키텍처
- **프론트엔드**: Vite + React + TypeScript + Tailwind, Vercel 호스팅 (https://allrounder-pi.vercel.app)
- **백엔드**: Supabase (Postgres + Edge Functions + Realtime)
- **LLM**: Gemini 2.5 Flash/Pro (Edge Function 경유)

### 에이전트 팀 (MVT에서 확장됨)
- **오케스트레이터**: 자비스 (시스템 자동 라우팅)
- **워크플로우(자동)**: 루미·아키·조이(비주얼 디자인)
- **루미 하위팀(자동 병렬 호출)**: 루미·데이터(`lumi_data`), 루미·스카웃(`lumi_scout`) — Phase 13에서 추가
- **아키 하위팀(자동 병렬 호출)**: 아키·IA(`aki_ia`), 아키·여정(`aki_flow`) — Phase 13에서 추가
- **조이 하위팀(자동 병렬 호출)**: 조이·팔레트(`joi_palette`), 조이·타이포(`joi_type`) — Phase 14에서 추가
- **타스 하위팀(자동 병렬 호출)**: 타스·마크업(`tars_markup`), 타스·로직(`tars_logic`) — Phase 14
- **QA봇 하위팀(자동 병렬 호출)**: QA·해피(`qa_happy`), QA·엣지(`qa_edge`), QA·에러(`qa_error`) — Phase 14
- **호출형(invoke)**: 프라이데이·타스·에코·키트·에씨카·QA봇 — 디렉터가 미션 화면에서 직접 호출
- **커스텀(사용자 추가)**: 사용자가 에이전트 메뉴에서 직접 추가 가능 (Phase 12에서 추가)

### 메인 워크플로우 (8단계)
`CP0 미션 부여 → 루미(후보 발굴) → 아키(검수) → CP1 후보 선택 → 아키(설계) → CP2 Blueprint 검토 → 조이(디자인 시안) → CP3 최종 검토`

### 완료된 Phase (요약)
- **Phase 1–10**: MVT 정의, DB 스키마, Edge Function, 워크플로우 상태머신, CP1/CP2/CP3 모달, Joi 추가, specialist 6명 추가, History·Mission detail UI
- **Phase 11**: Wisdom 시스템 (수동 추가 + 다이어리에서 자동 추출)
- **Phase 12**: 커스텀 에이전트 — 사용자가 UI로 에이전트 추가/학습(지식·예시)/프롬프트 버전 관리/롤백
  - 마이그레이션: `supabase/migrations/006_agents_customization.sql`
  - 라이브러리: `src/lib/agents.ts`
  - 모달: `AgentFormModal`, `KnowledgeFormModal`, `ExampleFormModal`, `PromptVersionModal`
  - Edge Function `loadAgentPrompt`가 wisdom + knowledge + examples를 자동 합성
- **Phase 13**: 하위팀 — 루미·아키 아래 각 2명의 하위 에이전트를 두고 부모 호출 시 자동 병렬 실행
  - 설계 원칙: **전문가 분업(Specialization) + 교차 검증(Cross-check)**.
    하위 에이전트는 서로 다른 영역(루미: 정량·정성, 아키: IA·여정)을 맡고, 부모는 종합 단계에서 모순·공백·할루시네이션을 명시적으로 점검.
  - 마이그레이션: `supabase/migrations/007_sub_agents.sql` (agents에 `parent_agent_id` 추가)
  - 페르소나: `src/data/sub_agents.ts` (lumi_data, lumi_scout, aki_ia, aki_flow)
  - Edge Function: `runSubAgents()` + `formatSubAgentContext()` 헬퍼. 후자는 부모에게 4가지 교차 검증(모순·공백·신뢰도·할루시네이션)을 강제하고 `cross_check` 필드 추가를 권장.
  - 디렉터 UX 변화 없음 — 워크플로우 상태는 그대로, 채팅에 하위팀 결과가 메시지로 누적됨
  - AgentsPage: 하위 에이전트를 부모 아래에 들여쓰기로 표시(SUB 뱃지)

---

- **Phase 18**: 루미(리서치) 고도화 — 요약 뷰 + 슬라이드 변환
  - 마이그레이션: `supabase/migrations/009_slide_deck.sql` (deliverables.type에 'slide_deck' 추가)
  - 루미 출력 JSON에 `tldr` 필드 강제 (Edge Function user prompt 수정, DB 재시드 불필요)
  - `OpportunityMapSummary` 컴포넌트: 채팅의 Opportunity Map 메시지 위에 TL;DR + 5개 후보 점수 시각화 카드 표시
  - Edge Function `handleGenerateSlides`: 액션 `generate_slides`로 호출, 현재 Opportunity Map을 8~12장 슬라이드 deck JSON으로 변환 (Gemini Pro)
  - `SlideDeckViewer` 컴포넌트: 인앱 뷰어 (좌우 키 / 스페이스 네비, N 발표자 노트, P 인쇄→PDF, ESC 닫기). 6개 layout 지원(title, bullets, two_column, quote, metrics, comparison). `@media print` 로 PDF export 친화
  - 트리거: 요약 카드의 "📊 슬라이드로 변환" 버튼 → 생성 완료되면 채팅에 slide_deck 메시지 + "슬라이드 보기" 버튼 추가

- **Phase 17**: 에이전트별 디자인 시스템 학습·반영 (조이 우선)
  - 마이그레이션: `supabase/migrations/008_agent_design_systems.sql`
  - 라이브러리: `src/lib/designSystems.ts` (parseDesignTokensJson 포함)
  - UI: `DesignSystemFormModal` (구조화 폼 + JSON paste 모드), AgentsPage에 "디자인 시스템" 탭
  - Edge Function: `loadAgentPrompt`에 활성 디자인 시스템 첨부 + `validateAgainstDesignSystem` 헬퍼로 조이 시안에서 hex 색상·폰트 추출 → 시스템 외 값 사용 시 시스템 메시지로 검증 결과 자동 보고
  - 에이전트당 활성 디자인 시스템 1개만 (부분 UNIQUE INDEX로 강제)

- **Phase 14**: 조이·타스·QA봇 하위팀 추가 (총 7명)
  - 페르소나: `src/data/sub_agents_phase14.ts`
  - 조이 하위(`joi_palette`, `joi_type`)는 비주얼 시스템 정의, 조이는 HTML 시안에 적용
  - 타스 하위(`tars_markup`, `tars_logic`)는 마크업/로직 분업, 타스가 통합
  - QA봇 하위(`qa_happy`, `qa_edge`, `qa_error`)는 테스트 패턴별 분업, QA봇이 우선순위 매김
  - Edge Function: `handleJoiDesigning`과 `handleSpecialistInvocation`에 `runSubAgents` 적용
  - 모델: 현재 모두 Gemini Flash, Phase 15 이후 Hermes 전환 대상

---

## 5. 모델 라우팅 전략 (Phase 15+에서 구현 예정)

**원칙**: 통합 판단·창의성은 Gemini Pro 유지, 구조화된 영역 작업은 Hermes로 전환.

| 분류 | 에이전트 | 모델 (전환 후) |
|---|---|---|
| 부모(조정자) | 루미, 아키, 조이, 자비스, 에씨카, 프라이데이 | Gemini Pro / Flash 유지 |
| 모든 하위 | lumi_*, aki_*, joi_*, tars_*, qa_* | **Hermes 전환** |
| 단독 specialist | 에코, 키트 | **Hermes 전환** |

**구현 단계 (Phase 15)**:
1. `agents.model` 컬럼 활용 (Phase 12에서 추가됨 ✓)
2. Edge Function의 `callGemini()`를 `callLLM(model, ...)`로 추상화
3. Hermes API 클라이언트 추가 (OpenRouter 경유 권장)
4. `llm_calls` 테이블로 호출별 비용·시간 로깅
5. 환경변수: `HERMES_API_KEY` (또는 `OPENROUTER_API_KEY`)

**Phase 16**: 실제 전환 — 하위 에이전트들의 `model` 컬럼 일괄 업데이트, 산출물 품질 A/B 비교.

---

## 6. 다음 단계 (Phase 15+ 후보)

- ☐ **Phase 15 — Hermes 인프라**: `callLLM` 추상화, Hermes 클라이언트, 비용 로깅
- ☐ **Phase 16 — 실제 전환**: 하위 에이전트 model 일괄 변경, 품질 비교
- ☐ **2순위 하위팀 추가**: 키트(법무 3분야), 프라이데이(BM/GTM)
- ☐ **하위팀 옵션화**: 미션마다 "깊이 모드"(하위팀 실행) vs "속도 모드"(부모만 단독) 선택
- ☐ **지식 파일 업로드**: PDF/이미지 업로드 지원
- ☐ **에이전트 간 직접 협업**: 커스텀 에이전트 산출물 참조 워크플로우

---

## 7. 새 세션 시작 시 권장 프롬프트

```
~/Desktop/allrounder 프로젝트 이어서 작업할 거야. 먼저
docs/00_Project_Charter_v1.0.md 와 README.md 를 읽어서 컨텍스트
복원해줘. 그 다음 git log 로 최근 작업을 확인하고, 나에게
다음에 뭘 할지 물어봐줘.
```
