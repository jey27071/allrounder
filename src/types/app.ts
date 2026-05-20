/**
 * 앱 내부에서 사용하는 데이터 타입 (DB 타입과 분리)
 */

import type { Database, MissionStatus, MissionState, AgentId, MessageSender, MessageType } from './database'

export type Mission = Database['public']['Tables']['missions']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Agent = Database['public']['Tables']['agents']['Row']
export type Deliverable = Database['public']['Tables']['deliverables']['Row']
export type Diary = Database['public']['Tables']['diaries']['Row']
export type WisdomPrinciple = Database['public']['Tables']['wisdom_principles']['Row']

export type { MissionStatus, MissionState, AgentId, MessageSender, MessageType }

/**
 * 워크플로우 단계의 시각화 정의
 */
export interface WorkflowStep {
  key: string
  label: string
  agent?: AgentId
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'CP0', label: 'CP0 미션 부여' },
  { key: 'LUMI', label: '루미 — 후보 발굴', agent: 'lumi' },
  { key: 'AKI_REVIEW', label: '아키 — 검수', agent: 'aki' },
  { key: 'CP1', label: 'CP1 후보 선택' },
  { key: 'AKI_DESIGN', label: '아키 — 설계', agent: 'aki' },
  { key: 'CP2', label: 'CP2 최종 검토' },
]

/**
 * 미션의 current_state를 워크플로우 단계의 인덱스로 매핑
 */
export function stateToStepIndex(state: MissionState): number {
  switch (state) {
    case 'MISSION_CREATED':
      return 0
    case 'LUMI_WORKING':
    case 'LUMI_RESUBMITTING':
      return 1
    case 'AKI_REVIEWING':
      return 2
    case 'WAITING_CP1':
      return 3
    case 'AKI_DESIGNING':
    case 'AKI_REVISING':
      return 4
    case 'WAITING_CP2':
      return 5
    case 'COMPLETED':
      return 6
    case 'ERROR_STATE':
      return -1
    default:
      return 0
  }
}
