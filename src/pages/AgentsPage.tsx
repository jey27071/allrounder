import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { listWisdom, setWisdomActive, triggerWisdomExtraction, type ExtractWisdomResult } from '@/lib/wisdom'
import type { AgentId, WisdomPrinciple } from '@/types/app'
import WisdomFormModal from '@/components/WisdomFormModal'

interface Agent {
  id: AgentId
  name: string
  role: string
  current_version: string
  system_prompt: string
  color_token: string
  updated_at: string
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
  const [includeInactive, setIncludeInactive] = useState(false)
  const [showWisdomForm, setShowWisdomForm] = useState(false)
  const [editingWisdom, setEditingWisdom] = useState<WisdomPrinciple | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState<ExtractWisdomResult | null>(null)

  useEffect(() => {
    void loadData()
  }, [includeInactive])

  async function loadData() {
    if (!supabase) {
      setError('Supabase 미초기화')
      setLoading(false)
      return
    }

    const [agentsRes, wisdomList] = await Promise.all([
      supabase.from('agents').select('*').order('id'),
      listWisdom(includeInactive),
    ])

    if (agentsRes.error) {
      setError(`agents 조회 실패: ${agentsRes.error.message}`)
    } else {
      const agentsData = (agentsRes.data ?? []) as Agent[]
      setAgents(agentsData)
      if (agentsData.length > 0 && !selectedId) {
        setSelectedId(agentsData[0].id)
      }
    }

    setWisdom(wisdomList)
    setLoading(false)
  }

  async function handleToggleActive(w: WisdomPrinciple) {
    const result = await setWisdomActive(w.id, !w.active)
    if (result.ok) {
      void loadData()
    } else {
      alert(`상태 변경 실패: ${result.error}`)
    }
  }

  function handleEdit(w: WisdomPrinciple) {
    setEditingWisdom(w)
    setShowWisdomForm(true)
  }

  function handleAdd() {
    setEditingWisdom(null)
    setShowWisdomForm(true)
  }

  function handleClosedForm() {
    setShowWisdomForm(false)
    setEditingWisdom(null)
  }

  function handleSavedForm() {
    void loadData()
  }

  async function handleExtract() {
    if (extracting) return
    if (!confirm('Jarvis가 누적된 다이어리를 분석하여 지혜 후보를 추출합니다. 진행할까요?')) return
    setExtracting(true)
    setExtractResult(null)
    const result = await triggerWisdomExtraction()
    setExtractResult(result)
    setExtracting(false)
    if (result.ok) {
      // 후보가 생성됐으면 비활성 지혜도 보이도록 전환
      if ((result.candidates_created ?? 0) > 0) {
        setIncludeInactive(true)
      }
      void loadData()
    }
  }

  if (loading) {
    return (
      <main className="flex-1 min-h-0 overflow-y-auto p-10">
        <h1 className="text-2xl font-bold mb-2">에이전트</h1>
        <p className="text-gray-500 text-sm">불러오는 중...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 min-h-0 overflow-y-auto p-10">
        <h1 className="text-2xl font-bold mb-2">에이전트</h1>
        <div className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning max-w-2xl">
          ⚠ {error}
        </div>
      </main>
    )
  }

  if (agents.length === 0) {
    return (
      <main className="flex-1 min-h-0 overflow-y-auto p-10">
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
      <div className="flex items-start justify-between mb-2 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">에이전트</h1>
          <p className="text-gray-500 text-sm mt-1">
            팀의 페르소나·시스템 프롬프트·누적 지혜를 관리합니다.
          </p>
        </div>
      </div>

      <div className="mb-8 max-w-5xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">지혜 표시:</span>
          <button
            onClick={() => setIncludeInactive(false)}
            className={`text-xs px-2 py-1 rounded border ${
              !includeInactive ? 'border-primary bg-primary text-white' : 'border-border bg-white text-gray-700'
            }`}
          >
            활성만
          </button>
          <button
            onClick={() => setIncludeInactive(true)}
            className={`text-xs px-2 py-1 rounded border ${
              includeInactive ? 'border-primary bg-primary text-white' : 'border-border bg-white text-gray-700'
            }`}
          >
            전체
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleExtract()}
            disabled={extracting}
            className="text-sm px-3 py-1.5 rounded border border-border bg-white hover:bg-gray-50 disabled:opacity-50"
            title="Jarvis가 누적 다이어리에서 지혜 후보를 추출합니다"
          >
            {extracting ? '⏳ 추출 중...' : '🔍 다이어리에서 추출'}
          </button>
          <button
            onClick={handleAdd}
            className="text-sm px-3 py-1.5 rounded bg-primary text-white hover:opacity-90"
          >
            + 지혜 추가
          </button>
        </div>
      </div>

      {extractResult && (
        <div className="mb-4 max-w-5xl">
          {extractResult.ok ? (
            <div className="p-3 bg-success/10 border border-success/30 rounded text-sm text-success">
              ✓ 추출 완료 · 후보 {extractResult.candidates_created ?? 0}건 생성
              {extractResult.total_diaries_considered != null &&
                ` · 분석 다이어리 ${extractResult.total_diaries_considered}개`}
              {extractResult.raw_candidates != null &&
                extractResult.raw_candidates > (extractResult.candidates_created ?? 0) &&
                ` (검증 실패 ${extractResult.raw_candidates - (extractResult.candidates_created ?? 0)}건 제외)`}
              {extractResult.note && <div className="mt-1 text-xs">{extractResult.note}</div>}
              {(extractResult.candidates_created ?? 0) > 0 && (
                <div className="mt-1 text-xs">
                  ⚠ 후보는 비활성 상태로 저장됩니다. "전체" 필터로 검토 후 "활성화"하세요.
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning">
              ⚠ 추출 실패: {extractResult.error ?? '알 수 없는 오류'}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[240px_1fr] gap-6 max-w-5xl">
        {/* Agent List */}
        <div className="flex flex-col gap-2">
          {agents.map((agent) => {
            const count = wisdom.filter((w) => w.applies_to.includes(agent.id)).length
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedId(agent.id)}
                className={`text-left p-4 border rounded-lg transition ${
                  selectedAgent.id === agent.id
                    ? 'border-primary bg-white'
                    : 'border-border bg-white hover:border-gray-400'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${COLOR_CLASS[agent.id]}`} />
                  <span className="font-bold">{agent.name}</span>
                  <span className="text-xs text-gray-400">{agent.current_version}</span>
                </div>
                <div className="text-xs text-gray-500">{agent.role}</div>
                {count > 0 && (
                  <div className="text-[10px] text-gray-400 mt-1">📜 지혜 {count}건</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Agent Detail */}
        <div className="border border-border rounded-lg bg-white">
          <div className="p-5 border-b border-border flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${COLOR_CLASS[selectedAgent.id]}`} />
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
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-medium text-gray-500">
                적용되는 인공 지혜 ({relatedWisdom.length}개)
              </div>
            </div>
            {relatedWisdom.length === 0 ? (
              <div className="text-xs text-gray-400">이 에이전트에 적용되는 원리 없음</div>
            ) : (
              <div className="flex flex-col gap-3">
                {relatedWisdom.map((w) => (
                  <div
                    key={w.id}
                    className={`border rounded p-3 ${
                      w.active ? 'border-border bg-white' : 'border-border bg-gray-50 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {w.title}
                          <span className="text-[10px] text-gray-400">{w.version}</span>
                          {!w.active && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
                              비활성
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleEdit(w)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => void handleToggleActive(w)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                        >
                          {w.active ? '비활성화' : '활성화'}
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                      {w.description}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-2">
                      적용: {w.applies_to.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showWisdomForm && (
        <WisdomFormModal initial={editingWisdom} onClose={handleClosedForm} onSaved={handleSavedForm} />
      )}
    </main>
  )
}
