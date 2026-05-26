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

## 5. 다음 단계 (Phase 14+ 후보)

- ☐ **하위팀 확장**: 각 부모 아래 3~5명으로 확대, 도메인별 sub-agent 추가
- ☐ **커스텀 에이전트 출력 템플릿**: 현재는 JSON 자유 형식, 구조화된 템플릿 도입
- ☐ **지식 파일 업로드**: 현재 텍스트 직접 입력만 가능, PDF/이미지 업로드 지원
- ☐ **에이전트 간 직접 협업**: 커스텀 에이전트가 다른 에이전트의 산출물을 참조하는 워크플로우
- ☐ **하위팀 옵션화**: 미션마다 "깊이 모드"(하위팀 실행) vs "속도 모드"(부모만 단독)를 디렉터가 선택

---

## 6. 새 세션 시작 시 권장 프롬프트

```
~/Desktop/allrounder 프로젝트 이어서 작업할 거야. 먼저
docs/00_Project_Charter_v1.0.md 와 README.md 를 읽어서 컨텍스트
복원해줘. 그 다음 git log 로 최근 작업을 확인하고, 나에게
다음에 뭘 할지 물어봐줘.
```
