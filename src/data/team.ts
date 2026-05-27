import type { AgentId, MissionState } from '@/types/database'

/**
 * 9명 동격 팀원 구조.
 * - orchestrator: Jarvis. 사용자가 직접 호출하지 않고, 시스템이 자동 라우팅.
 * - workflow: state machine으로 자동 트리거되는 에이전트 (Lumi/Aki/Joi).
 * - invoke: 디렉터가 언제든 직접 호출하는 에이전트 (Friday/TARS/Echo/KITT/Ethica/QA봇).
 */
export type AgentKind = 'orchestrator' | 'workflow' | 'invoke'

export interface AgentMeta {
  id: AgentId
  name: string
  label: string
  description: string
  kind: AgentKind
  workflowStates?: MissionState[]
}

export const AGENT_TEAM: AgentMeta[] = [
  {
    id: 'jarvis',
    name: 'Jarvis',
    label: '오케스트레이터',
    description: '미션 분석·라우팅·전체 흐름 조율',
    kind: 'orchestrator',
  },
  {
    id: 'lumi',
    name: '루미',
    label: '리서치·전략',
    description: '기회 지도·후보 발굴·시장 분석',
    kind: 'workflow',
    workflowStates: ['LUMI_WORKING', 'LUMI_RESUBMITTING'],
  },
  {
    id: 'aki',
    name: '아키',
    label: '설계·검수',
    description: 'Blueprint 작성·후보 품질 검수',
    kind: 'workflow',
    workflowStates: ['AKI_REVIEWING', 'AKI_DESIGNING', 'AKI_REVISING'],
  },
  {
    id: 'joi',
    name: '조이',
    label: '비주얼 디자인',
    description: '화면 시안·디자인 시스템',
    kind: 'workflow',
    workflowStates: ['JOI_DESIGNING', 'JOI_REVISING'],
  },
  {
    id: 'friday',
    name: '프라이데이',
    label: '사업화 검증',
    description: 'BM·GTM·시장 분석',
    kind: 'invoke',
  },
  {
    id: 'tars',
    name: '타스',
    label: 'React 코드 변환',
    description: '조이 HTML → React 컴포넌트',
    kind: 'invoke',
  },
  {
    id: 'echo',
    name: '에코',
    label: '접근성 검수',
    description: 'WCAG AA 준수 점검',
    kind: 'invoke',
  },
  {
    id: 'kitt',
    name: '키트',
    label: '법무 1차 검토',
    description: '개인정보·약관·IP 리스크',
    kind: 'invoke',
  },
  {
    id: 'ethica',
    name: '에씨카',
    label: '윤리 검토',
    description: '편향·사회 영향·공정성',
    kind: 'invoke',
  },
  {
    id: 'qa_bot',
    name: 'QA봇',
    label: '테스트 케이스',
    description: 'P0 기능별 테스트 케이스 생성',
    kind: 'invoke',
  },
  {
    id: 'wordy',
    name: '워디',
    label: 'UX 라이팅',
    description: '마이크로 카피 검수·개선',
    kind: 'invoke',
  },
]

export const AGENT_COLORS: Record<AgentId, string> = {
  jarvis: 'bg-agent-jarvis',
  lumi: 'bg-agent-lumi',
  aki: 'bg-agent-aki',
  joi: 'bg-agent-joi',
  friday: 'bg-agent-friday',
  tars: 'bg-agent-tars',
  echo: 'bg-agent-echo',
  kitt: 'bg-agent-kitt',
  ethica: 'bg-agent-ethica',
  qa_bot: 'bg-agent-qa',
  wordy: 'bg-agent-wordy',
}

/**
 * 디렉터가 직접 호출 가능한 9명 (Jarvis 제외).
 */
export const INVOKABLE_AGENTS = AGENT_TEAM.filter((a) => a.kind !== 'orchestrator')
