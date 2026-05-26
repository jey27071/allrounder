# Allrounder — Multi-Agent Orchestrator

자비스(오케스트레이터) + 루미(리서치) + 아키(설계) 3인 에이전트 팀을
1인 디자이너가 지휘하는 멀티 에이전트 앱.

## 첫 실행

```bash
cd ~/Desktop/allrounder
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속.

## 빌드

```bash
npm run build
npm run preview
```

## 기술 스택

- Vite + React 18 + TypeScript
- TailwindCSS (디자인 토큰: Pretendard, agent colors)
- Supabase (DB + Edge Functions + Realtime)
- Anthropic Claude API (Edge Functions 경유)

## 디렉토리

```
src/
├─ App.tsx           메인 컴포넌트 (3-컬럼 레이아웃)
├─ main.tsx          진입점
├─ index.css         Tailwind base
├─ components/       UI 컴포넌트 (예정)
├─ lib/              유틸·클라이언트 (예정)
└─ types/            타입 정의 (예정)
```

## 마이그레이션 적용

`supabase/migrations/*.sql` 파일을 순서대로 Supabase Dashboard → SQL Editor에 붙여넣어 실행합니다. 최신은 `006_agents_customization.sql` (에이전트 추가·학습 자료·예시·프롬프트 버전).

## 에이전트 메뉴

- **추가**: 사이드바의 "에이전트" → 우측 상단 "+ 에이전트 추가"
- **학습**: 에이전트 선택 후 [지식] / [예시] 탭에서 항목 추가. 활성화된 항목은 호출 시 시스템 프롬프트 뒤에 자동 첨부됩니다.
- **프롬프트 버전**: [프롬프트] 탭에서 수정 → "새 버전 저장" → [버전] 탭에서 과거 버전으로 롤백 가능
- 커스텀 에이전트는 미션 화면의 "팀원 호출" 패널에도 자동 노출되어 호출 가능합니다.

## 다음 단계 (아이디어)

- ☐ 커스텀 에이전트 전용 출력 포맷 템플릿 (현재는 JSON 자유 형식)
- ☐ 지식 파일 업로드 (현재는 텍스트 직접 붙여넣기만)
- ☐ 사용자가 추가한 에이전트도 Wisdom 적용 대상에 노출
