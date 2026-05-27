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

## 시안 작업 흐름 (Phase 19)

미션이 조이 단계까지 가면 산출물 패널에서 **디자인 시안** 클릭 → 모달에서:

- **디바이스 토글** — 📱 375 / 📟 768 / 💻 1280 / Full
- **이 화면만 수정** 4 모드:
  - **🎯 자연어 patch** — "이 카드 색만 #f00으로" → Gemini Flash 1회, 최소 변경
  - **🔄 재생성** — 화면 하나만 다시 만들기, Gemini Pro 1회
  - **✏️ HTML 편집** — textarea + 즉시 미리보기, LLM 호출 없이 저장
- **export** — 단일 .html, 통합 .html, JSON 백업, Figma Tokens Studio JSON

### Figma 연계 (Tokens Studio plugin)

1. Figma에 "Tokens Studio for Figma" plugin 설치 (무료)
2. 에이전트 메뉴 → 조이 → 디자인 시스템 탭 → **🎨 Figma용 export** 클릭
3. 다운로드된 .json을 Tokens Studio plugin > Settings > Tools > Load from JSON에 paste
4. 색상·폰트·간격이 Figma styles로 자동 생성

## 다음 단계 (아이디어)

- ☐ Allrounder MCP server (Claude Desktop/Cursor 통합)
- ☐ Hermes 모델 라우팅 (토큰 비용 절감)
- ☐ 시안 PDF/PNG 캡처 export
- ☐ 지식 파일 업로드 (PDF/이미지)
