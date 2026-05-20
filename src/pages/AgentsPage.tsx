import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AgentId } from '@/types/database'

interface Agent {
  id: AgentId
  name: string
  role: string
  current_version: string
  system_prompt: string
  color_token: string
  updated_at: string
}

interface WisdomPrinciple {
  id: string
  title: string
  description: string
  applies_to: AgentId[]
  version: string
  active: boolean
}

const COLOR_CLASS: Record<AgentId, string> = {
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
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [wisdom, setWisdom] = useState<WisdomPrinciple[]>([])
  const [selectedId, setSelectedId] = useState<AgentId | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    if (!supabase) {
      setError('Supabase 미초기화')
      setLoading(false)
      return
    }

    const [agentsRes, wisdomRes] = await Promise.all([
      supabase.from('agents').select('*').order('id'),
      supabase.from('wisdom_principles').select('*').eq('active', true).order('created_at'),
    ])

    if (agentsRes.error) {
      setError(`agents 조회 실패: ${agentsRes.error.message}`)
    } else {
      setAgents(agentsRes.data ?? [])
      if ((agentsRes.data?.length ?? 0) > 0 && !selectedId) {
        setSelectedId(agentsRes.data![0].id as AgentId)
      }
    }

    if (wisdomRes.error) {
      console.error('wisdom 조회 실패:', wisdomRes.error)
    } else {
      setWisdom(wisdomRes.data ?? [])
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold mb-2">에이전트</h1>
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold mb-2">에이전트</h1>
        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning max-w-2xl">
          ⚠ {error}
        </div>
      </main>
    )
  }

  if (agents.length === 0) {
    return (
      <main className="p-10">
        <h1 className="text-2xl font-bold mb-2">에이전트</h1>
        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning max-w-2xl">
          ⚠ 시드되지 않았습니다. 미션 페이지로 돌아가 셋업 검증을 실행하세요.
        </div>
      </main>
    )
  }

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? agents[0]
  const relatedWisdom = wisdom.filter((w) => w.applies_to.includes(selectedAgent.id))

  return (
    <main className="flex-1 min-h-0 overflow-y-auto p-10">
      <h1 className="text-2xl font-bold mb-2">에이전트</h1>
      <p className="text-gray-500 text-sm mb-8">
        팀의 페르소나·시스템 프롬프트·누적 지혜를 관리합니다.
      </p>

      <div className="grid grid-cols-[240px_1fr] gap-6 max-w-5xl">
        {/* Agent List */}
        <div className="flex flex-col gap-2">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedId(agent.id as AgentId)}
              className={`text-left p-4 border rounded-lg transition ${
                selectedAgent.id === agent.id
                  ? 'border-primary bg-white'
                  : 'border-border bg-white hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${COLOR_CLASS[agent.id as AgentId]}`} />
                <span className="font-bold">{agent.name}</span>
                <span className="text-xs text-gray-400">{agent.current_version}</span>
              </div>
              <div className="text-xs text-gray-500">{agent.role}</div>
            </button>
          ))}
        </div>

        {/* Agent Detail */}
        <div className="border border-border rounded-lg bg-white">
          <div className="p-5 border-b border-border flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${COLOR_CLASS[selectedAgent.id as AgentId]}`} />
            <div>
              <div className="font-bold">{selectedAgent.name}</div>
              <div className="text-xs text-gray-500">
                {selectedAgent.role} · {selectedAgent.current_version}
              </div>
            </div>
          </div>

          <div className="p-5 border-b border-border">
            <div className="text-xs font-medium text-gray-500 mb-2">시스템 프롬프트</div>
            <pre className="font-mono text-xs whitespace-pre-wrap text-gray-700 max-h-96 overflow-y-auto p-3 bg-gray-50 rounded">
              {selectedAgent.system_prompt}
            </pre>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium text-gray-500 mb-3">
              적용되는 인공 지혜 ({relatedWisdom.length}개)
            </div>
            {relatedWisdom.length === 0 ? (
              <div className="text-xs text-gray-400">이 에이전트에 적용되는 원리 없음</div>
            ) : (
              <div className="flex flex-col gap-3">
                {relatedWisdom.map((w) => (
                  <div key={w.id} className="border border-border rounded p-3">
                    <div className="font-medium text-sm mb-1">{w.title}</div>
                    <div className="text-xs text-gray-600 leading-relaxed">{w.description}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
