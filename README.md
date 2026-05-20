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

## 다음 단계

1. ☐ Supabase 클라이언트 연결
2. ☐ 7개 테이블 마이그레이션
3. ☐ Agents 시드 데이터
4. ☐ 메인 채팅 UI
5. ☐ Orchestrate Edge Function
6. ☐ HITL 모달 (CP1·CP2·Reject)
