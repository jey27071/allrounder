/**
 * Supabase Database 타입 정의
 * 향후 supabase gen types 로 자동 생성도 가능
 */

export type MissionStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'error'

export type MissionState =
  | 'MISSION_CREATED'
  | 'LUMI_WORKING'
  | 'AKI_REVIEWING'
  | 'LUMI_RESUBMITTING'
  | 'WAITING_CP1'
  | 'AKI_DESIGNING'
  | 'WAITING_CP2'
  | 'AKI_REVISING'
  | 'JOI_DESIGNING'
  | 'WAITING_CP3'
  | 'JOI_REVISING'
  | 'COMPLETED'
  | 'ERROR_STATE'

/**
 * Built-in 에이전트 ID (시드되는 10명).
 * 커스텀 에이전트는 임의의 문자열 ID를 가질 수 있으므로
 * 일반 코드에서는 AgentId(=string)를 사용한다.
 */
export type BuiltinAgentId =
  | 'jarvis' | 'lumi' | 'aki' | 'joi'
  | 'friday' | 'tars' | 'echo' | 'kitt' | 'ethica' | 'qa_bot'

/**
 * 일반 에이전트 ID — 빌트인 + 사용자가 추가한 커스텀 에이전트.
 * DB 측 CHECK는 형식만 강제(/^[a-z][a-z0-9_]{1,31}$/).
 */
export type AgentId = BuiltinAgentId | (string & {})

export type MessageSender = 'director' | 'system' | AgentId

export type MessageType =
  | 'Deliverable'
  | 'Reject'
  | 'Question'
  | 'Approval'
  | 'Escalation'
  | 'UserInput'
  | 'StatusUpdate'

export type DeliverableType =
  | 'opportunity_map' | 'product_blueprint' | 'screen_designs'
  | 'business_model' | 'frontend_code' | 'a11y_audit' | 'legal_review' | 'ethics_review' | 'test_suite'
  | 'custom_report'

export type DeliverableStatus = 'pending' | 'approved' | 'rejected' | 'revised' | 'final'

export type Database = {
  public: {
    Tables: {
      missions: {
        Relationships: []
        Row: {
          id: string
          title: string
          domain: string
          charter: string
          context: string | null
          status: MissionStatus
          current_state: MissionState
          reject_cycle: number
          selected_candidate_index: number | null
          archived: boolean
          archived_at: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          title: string
          domain: string
          charter: string
          context?: string | null
          status?: MissionStatus
          current_state?: MissionState
          reject_cycle?: number
          selected_candidate_index?: number | null
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['missions']['Insert']>
      }
      agents: {
        Row: {
          id: AgentId
          name: string
          role: string
          current_version: string
          system_prompt: string
          color_token: string
          is_custom: boolean
          description: string | null
          model: string | null
          deliverable_type: string | null
          parent_agent_id: AgentId | null
          updated_at: string
        }
        Insert: {
          id: AgentId
          name: string
          role: string
          current_version?: string
          system_prompt: string
          color_token: string
          is_custom?: boolean
          description?: string | null
          model?: string | null
          deliverable_type?: string | null
          parent_agent_id?: AgentId | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['agents']['Insert']>
      }
      agent_versions: {
        Row: {
          id: string
          agent_id: AgentId
          version: string
          system_prompt: string
          changelog: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agent_id: AgentId
          version: string
          system_prompt: string
          changelog?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['agent_versions']['Insert']>
      }
      agent_knowledge: {
        Row: {
          id: string
          agent_id: AgentId
          title: string
          content: string
          source: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agent_id: AgentId
          title: string
          content: string
          source?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['agent_knowledge']['Insert']>
      }
      agent_examples: {
        Row: {
          id: string
          agent_id: AgentId
          label: string | null
          input: string
          output: string
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agent_id: AgentId
          label?: string | null
          input: string
          output: string
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['agent_examples']['Insert']>
      }
      messages: {
        Row: {
          id: string
          mission_id: string
          sender: MessageSender
          recipient: string | null
          cc: string[] | null
          re: string | null
          type: MessageType
          cycle: string | null
          content: string
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          sender: MessageSender
          recipient?: string | null
          cc?: string[] | null
          re?: string | null
          type: MessageType
          cycle?: string | null
          content: string
          metadata?: Record<string, unknown> | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      deliverables: {
        Row: {
          id: string
          mission_id: string
          type: DeliverableType
          version: string
          data: Record<string, unknown>
          raw_markdown: string | null
          created_by: string
          reviewed_by: string | null
          review_score: number | null
          review_notes: string | null
          status: DeliverableStatus
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          type: DeliverableType
          version: string
          data: Record<string, unknown>
          raw_markdown?: string | null
          created_by: string
          reviewed_by?: string | null
          review_score?: number | null
          review_notes?: string | null
          status?: DeliverableStatus
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['deliverables']['Insert']>
      }
      diaries: {
        Row: {
          id: string
          mission_id: string
          agent_id: AgentId
          context_label: string | null
          difficulty: string | null
          insight: string | null
          next_try: string | null
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          agent_id: AgentId
          context_label?: string | null
          difficulty?: string | null
          insight?: string | null
          next_try?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['diaries']['Insert']>
      }
      wisdom_principles: {
        Row: {
          id: string
          title: string
          description: string
          applies_to: AgentId[]
          source_diary_ids: string[] | null
          version: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description: string
          applies_to: AgentId[]
          source_diary_ids?: string[] | null
          version: string
          active?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['wisdom_principles']['Insert']>
      }
    }
  }
}
