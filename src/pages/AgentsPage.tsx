import { useEffect, useState } from 'react'
import { listWisdom, setWisdomActive, triggerWisdomExtraction, type ExtractWisdomResult } from '@/lib/wisdom'
import {
  listAgents,
  listAgentVersions,
  listKnowledge,
  listExamples,
  deleteAgent,
  deleteKnowledge,
  deleteExample,
  updateKnowledge,
  updateExample,
  rollbackAgentToVersion,
} from '@/lib/agents'
import { bgForToken } from '@/lib/agentColors'
import {
  listDesignSystems,
  setActiveDesignSystem,
  deleteDesignSystem,
} from '@/lib/designSystems'
import type {
  Agent,
  AgentId,
  AgentKnowledge,
  AgentExample,
  AgentVersion,
  AgentDesignSystem,
  WisdomPrinciple,
} from '@/types/app'
import WisdomFormModal from '@/components/WisdomFormModal'
import AgentFormModal from '@/components/AgentFormModal'
import KnowledgeFormModal from '@/components/KnowledgeFormModal'
import ExampleFormModal from '@/components/ExampleFormModal'
import PromptVersionModal from '@/components/PromptVersionModal'
import DesignSystemFormModal from '@/components/DesignSystemFormModal'

type Tab = 'prompt' | 'knowledge' | 'examples' | 'versions' | 'wisdom' | 'design'

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [wisdom, setWisdom] = useState<WisdomPrinciple[]>([])
  const [selectedId, setSelectedId] = useState<AgentId | null>(null)
  const [tab, setTab] = useState<Tab>('prompt')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState<ExtractWisdomResult | null>(null)

  // 모달
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false)
  const [editingKnowledge, setEditingKnowledge] = useState<AgentKnowledge | null>(null)
  const [showExampleForm, setShowExampleForm] = useState(false)
  const [editingExample, setEditingExample] = useState<AgentExample | null>(null)
  const [showWisdomForm, setShowWisdomForm] = useState(false)
  const [editingWisdom, setEditingWisdom] = useState<WisdomPrinciple | null>(null)
  const [showVersionForm, setShowVersionForm] = useState(false)

  // 탭 데이터
  const [knowledge, setKnowledge] = useState<AgentKnowledge[]>([])
  const [examples, setExamples] = useState<AgentExample[]>([])
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [designSystems, setDesignSystems] = useState<AgentDesignSystem[]>([])
  const [draftPrompt, setDraftPrompt] = useState('')

  // 디자인 시스템 모달
  const [showDesignForm, setShowDesignForm] = useState(false)
  const [editingDesign, setEditingDesign] = useState<AgentDesignSystem | null>(null)

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [agentList, wisdomList] = await Promise.all([
        listAgents(),
        listWisdom(includeInactive),
      ])
      setAgents(agentList)
      setWisdom(wisdomList)
      if (agentList.length > 0 && !selectedId) {
        setSelectedId(agentList[0].id)
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  async function loadDetail(agentId: AgentId) {
    const [ks, es, vs, ds] = await Promise.all([
      listKnowledge(agentId, true),
      listExamples(agentId, true),
      listAgentVersions(agentId),
      listDesignSystems(agentId),
    ])
    setKnowledge(ks)
    setExamples(es)
    setVersions(vs)
    setDesignSystems(ds)
    const a = agents.find((x) => x.id === agentId)
    if (a) setDraftPrompt(a.system_prompt)
  }

  async function refreshAgentsKeepingSelection() {
    const list = await listAgents()
    setAgents(list)
    if (selectedId) {
      const a = list.find((x) => x.id === selectedId)
      if (a) setDraftPrompt(a.system_prompt)
    }
  }

  async function handleDeleteAgent(a: Agent) {
    if (!a.is_custom) {
      alert('빌트인 에이전트는 삭제할 수 없습니다.')
      return
    }
    if (!confirm(`정말 "${a.name}"을(를) 삭제하시겠습니까?\n관련 지식·예시·버전·다이어리도 함께 삭제됩니다.`)) return
    const r = await deleteAgent(a.id)
    if (!r.ok) {
      alert('삭제 실패: ' + r.error)
      return
    }
    // 선택 갱신
    const remaining = agents.filter((x) => x.id !== a.id)
    setSelectedId(remaining[0]?.id ?? null)
    void loadAll()
  }

  async function handleExtract() {
    if (extracting) return
    if (!confirm('Jarvis가 누적된 다이어리를 분석하여 지혜 후보를 추출합니다. 진행할까요?')) return
    setExtracting(true)
    setExtractResult(null)
    const r = await triggerWisdomExtraction()
    setExtractResult(r)
    setExtracting(false)
    if (r.ok) {
      if ((r.candidates_created ?? 0) > 0) setIncludeInactive(true)
      void loadAll()
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
        <p className="text-gray-500 text-sm mt-2">시드된 에이전트가 없습니다. 미션 페이지에서 셋업 검증을 실행하세요.</p>
        <button
          onClick={() => setShowAgentForm(true)}
          className="mt-4 px-3 py-1.5 text-sm rounded bg-primary text-white"
        >
          + 직접 에이전트 추가
        </button>
        {showAgentForm && (
          <AgentFormModal
            initial={null}
            onClose={() => setShowAgentForm(false)}
            onSaved={() => void loadAll()}
          />
        )}
      </main>
    )
  }

  const selectedAgent = agents.find((a) => a.id === selectedId) ?? agents[0]
  const relatedWisdom = wisdom.filter((w) => w.applies_to.includes(selectedAgent.id))
  const promptDirty = draftPrompt !== selectedAgent.system_prompt

  return (
    <main className="flex-1 min-h-0 overflow-y-auto p-10">
      <div className="flex items-start justify-between mb-2 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">에이전트</h1>
          <p className="text-gray-500 text-sm mt-1">
            팀원을 추가하고 학습 자료·예시·프롬프트 버전을 관리합니다.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingAgent(null)
            setShowAgentForm(true)
          }}
          className="text-sm px-3 py-1.5 rounded bg-primary text-white hover:opacity-90"
        >
          + 에이전트 추가
        </button>
      </div>

      <div className="mb-6 max-w-6xl flex items-center justify-between">
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
            onClick={() => {
              setEditingWisdom(null)
              setShowWisdomForm(true)
            }}
            className="text-sm px-3 py-1.5 rounded border border-border bg-white hover:bg-gray-50"
          >
            + 지혜 추가
          </button>
        </div>
      </div>

      {extractResult && (
        <div className="mb-4 max-w-6xl">
          {extractResult.ok ? (
            <div className="p-3 bg-success/10 border border-success/30 rounded text-sm text-success">
              ✓ 추출 완료 · 후보 {extractResult.candidates_created ?? 0}건 생성
              {extractResult.note && <div className="mt-1 text-xs">{extractResult.note}</div>}
            </div>
          ) : (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded text-sm text-warning">
              ⚠ 추출 실패: {extractResult.error ?? '알 수 없는 오류'}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-[260px_1fr] gap-6 max-w-6xl">
        {/* Agent List — 부모 → 하위 들여쓰기 표시 */}
        <div className="flex flex-col gap-2">
          {(() => {
            const tops = agents.filter((a) => !a.parent_agent_id)
            const childrenOf = (parentId: AgentId) =>
              agents.filter((a) => a.parent_agent_id === parentId)
            const rows: { agent: Agent; depth: number }[] = []
            for (const t of tops) {
              rows.push({ agent: t, depth: 0 })
              for (const c of childrenOf(t.id)) rows.push({ agent: c, depth: 1 })
            }
            return rows.map(({ agent, depth }) => {
              const isSelected = selectedAgent.id === agent.id
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedId(agent.id)}
                  style={depth > 0 ? { marginLeft: 16 } : undefined}
                  className={`text-left p-3 border rounded-lg transition group ${
                    isSelected
                      ? 'border-primary bg-white'
                      : 'border-border bg-white hover:border-gray-400'
                  } ${depth > 0 ? 'border-dashed' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {depth > 0 && <span className="text-gray-300 text-xs">└</span>}
                    <span className={`w-2.5 h-2.5 rounded-full ${bgForToken(agent.color_token)}`} />
                    <span className="font-bold text-sm">{agent.name}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{agent.current_version}</span>
                    {agent.is_custom && (
                      <span className="text-[9px] px-1 rounded bg-primary/10 text-primary ml-auto">CUSTOM</span>
                    )}
                    {depth > 0 && !agent.is_custom && (
                      <span className="text-[9px] px-1 rounded bg-gray-100 text-gray-500 ml-auto">SUB</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{agent.role}</div>
                  {agent.description && (
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">{agent.description}</div>
                  )}
                </button>
              )
            })
          })()}
        </div>

        {/* Agent Detail */}
        <div className="border border-border rounded-lg bg-white flex flex-col min-h-0">
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${bgForToken(selectedAgent.color_token)}`} />
            <div className="flex-1">
              <div className="font-bold">{selectedAgent.name}</div>
              <div className="text-xs text-gray-500">
                {selectedAgent.role} · {selectedAgent.current_version}
                {selectedAgent.model && ` · ${selectedAgent.model}`}
              </div>
            </div>
            <button
              onClick={() => {
                setEditingAgent(selectedAgent)
                setShowAgentForm(true)
              }}
              className="text-xs px-2 py-1 rounded border border-border hover:bg-gray-50"
            >
              메타 편집
            </button>
            {selectedAgent.is_custom && (
              <button
                onClick={() => void handleDeleteAgent(selectedAgent)}
                className="text-xs px-2 py-1 rounded border border-warning/40 text-warning hover:bg-warning/5"
              >
                삭제
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="px-5 pt-3 border-b border-border flex items-center gap-1">
            <TabButton current={tab} value="prompt" onClick={setTab}>
              프롬프트
            </TabButton>
            <TabButton current={tab} value="knowledge" onClick={setTab} count={knowledge.length}>
              지식
            </TabButton>
            <TabButton current={tab} value="examples" onClick={setTab} count={examples.length}>
              예시
            </TabButton>
            <TabButton current={tab} value="versions" onClick={setTab} count={versions.length}>
              버전
            </TabButton>
            <TabButton current={tab} value="wisdom" onClick={setTab} count={relatedWisdom.length}>
              지혜
            </TabButton>
            <TabButton current={tab} value="design" onClick={setTab} count={designSystems.length}>
              디자인 시스템
            </TabButton>
          </div>

          <div className="p-5">
            {/* PROMPT TAB */}
            {tab === 'prompt' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-gray-500">
                    시스템 프롬프트 (현재 {selectedAgent.current_version})
                  </div>
                  <div className="flex items-center gap-2">
                    {promptDirty && (
                      <button
                        onClick={() => setDraftPrompt(selectedAgent.system_prompt)}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-gray-50"
                      >
                        변경 취소
                      </button>
                    )}
                    <button
                      onClick={() => setShowVersionForm(true)}
                      disabled={!promptDirty || !draftPrompt.trim()}
                      className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
                      title={promptDirty ? '새 버전으로 저장' : '변경된 내용 없음'}
                    >
                      {promptDirty ? '새 버전 저장' : '저장됨'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draftPrompt}
                  onChange={(e) => setDraftPrompt(e.target.value)}
                  rows={22}
                  className="w-full border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary resize-y"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  편집 후 "새 버전 저장"을 누르면 agent_versions에 기록되고 메인 프롬프트가 갱신됩니다.
                </p>
              </div>
            )}

            {/* KNOWLEDGE TAB */}
            {tab === 'knowledge' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-gray-500">
                    학습 자료 ({knowledge.length}개) — 활성 항목은 호출 시 자동 첨부
                  </div>
                  <button
                    onClick={() => {
                      setEditingKnowledge(null)
                      setShowKnowledgeForm(true)
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90"
                  >
                    + 지식 추가
                  </button>
                </div>
                {knowledge.length === 0 ? (
                  <EmptyState text="등록된 지식이 없습니다." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {knowledge.map((k) => (
                      <div
                        key={k.id}
                        className={`border rounded p-3 ${k.active ? 'border-border bg-white' : 'border-border bg-gray-50 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {k.title}
                            {!k.active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded">비활성</span>}
                            {k.source && <span className="text-[10px] text-gray-400">· {k.source}</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingKnowledge(k)
                                setShowKnowledgeForm(true)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              편집
                            </button>
                            <button
                              onClick={async () => {
                                const r = await updateKnowledge(k.id, { active: !k.active })
                                if (r.ok && selectedId) void loadDetail(selectedId)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              {k.active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('이 지식 항목을 삭제하시겠습니까?')) return
                                const r = await deleteKnowledge(k.id)
                                if (r.ok && selectedId) void loadDetail(selectedId)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 text-warning hover:bg-warning/5"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans line-clamp-6">{k.content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* EXAMPLES TAB */}
            {tab === 'examples' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-gray-500">
                    few-shot 예시 ({examples.length}개)
                  </div>
                  <button
                    onClick={() => {
                      setEditingExample(null)
                      setShowExampleForm(true)
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90"
                  >
                    + 예시 추가
                  </button>
                </div>
                {examples.length === 0 ? (
                  <EmptyState text="등록된 예시가 없습니다." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {examples.map((ex) => (
                      <div
                        key={ex.id}
                        className={`border rounded p-3 ${ex.active ? 'border-border bg-white' : 'border-border bg-gray-50 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {ex.label ?? '(라벨 없음)'}
                            {!ex.active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded">비활성</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingExample(ex)
                                setShowExampleForm(true)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              편집
                            </button>
                            <button
                              onClick={async () => {
                                const r = await updateExample(ex.id, { active: !ex.active })
                                if (r.ok && selectedId) void loadDetail(selectedId)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              {ex.active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm('이 예시를 삭제하시겠습니까?')) return
                                const r = await deleteExample(ex.id)
                                if (r.ok && selectedId) void loadDetail(selectedId)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 text-warning hover:bg-warning/5"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <div className="text-[10px] uppercase text-gray-400 mb-0.5">입력</div>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans line-clamp-5">{ex.input}</pre>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase text-gray-400 mb-0.5">출력</div>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans line-clamp-5">{ex.output}</pre>
                          </div>
                        </div>
                        {ex.notes && (
                          <div className="text-[10px] text-gray-400 mt-2">📝 {ex.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VERSIONS TAB */}
            {tab === 'versions' && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-3">
                  프롬프트 버전 히스토리 ({versions.length}개)
                </div>
                {versions.length === 0 ? (
                  <EmptyState text="히스토리가 비어 있습니다. 프롬프트를 수정해 새 버전으로 저장해보세요." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {versions.map((v) => {
                      const isCurrent = v.version === selectedAgent.current_version
                      return (
                        <div
                          key={v.id}
                          className={`border rounded p-3 ${isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">{v.version}</span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-primary text-white rounded">현재</span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                {new Date(v.created_at).toLocaleString('ko-KR')}
                              </span>
                            </div>
                            {!isCurrent && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`${v.version}으로 되돌리시겠습니까? 현재 프롬프트가 교체됩니다.`)) return
                                  const r = await rollbackAgentToVersion(selectedAgent.id, v.version)
                                  if (!r.ok) {
                                    alert('롤백 실패: ' + r.error)
                                    return
                                  }
                                  await refreshAgentsKeepingSelection()
                                  if (selectedId) void loadDetail(selectedId)
                                }}
                                className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-gray-100"
                              >
                                이 버전으로 롤백
                              </button>
                            )}
                          </div>
                          {v.changelog && (
                            <div className="text-xs text-gray-600">{v.changelog}</div>
                          )}
                          <details className="mt-2">
                            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                              프롬프트 보기
                            </summary>
                            <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-64 overflow-y-auto">
                              {v.system_prompt}
                            </pre>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* WISDOM TAB */}
            {tab === 'wisdom' && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-3">
                  적용되는 인공 지혜 ({relatedWisdom.length}개)
                </div>
                {relatedWisdom.length === 0 ? (
                  <EmptyState text="이 에이전트에 적용되는 원리 없음" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {relatedWisdom.map((w) => (
                      <div
                        key={w.id}
                        className={`border rounded p-3 ${w.active ? 'border-border bg-white' : 'border-border bg-gray-50 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {w.title}
                            <span className="text-[10px] text-gray-400">{w.version}</span>
                            {!w.active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 rounded">비활성</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingWisdom(w)
                                setShowWisdomForm(true)
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              편집
                            </button>
                            <button
                              onClick={async () => {
                                const r = await setWisdomActive(w.id, !w.active)
                                if (r.ok) void loadAll()
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                            >
                              {w.active ? '비활성화' : '활성화'}
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{w.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DESIGN SYSTEM TAB */}
            {tab === 'design' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-medium text-gray-500">
                    디자인 시스템 ({designSystems.length}개) — 활성 1개만 시안 생성 시 첨부됨
                  </div>
                  <button
                    onClick={() => {
                      setEditingDesign(null)
                      setShowDesignForm(true)
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-primary text-white hover:opacity-90"
                  >
                    + 디자인 시스템 추가
                  </button>
                </div>
                {designSystems.length === 0 ? (
                  <EmptyState text="등록된 디자인 시스템이 없습니다. JSON으로 paste하거나 폼으로 입력하세요." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {designSystems.map((ds) => {
                      // deno-lint-ignore no-explicit-any
                      const tokens = (ds.tokens ?? {}) as any
                      const colorEntries = tokens.colors ? Object.entries(tokens.colors).slice(0, 8) : []
                      return (
                        <div
                          key={ds.id}
                          className={`border rounded p-3 ${ds.active ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <div className="font-medium text-sm flex items-center gap-2">
                                {ds.name}
                                {ds.active && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-primary text-white rounded">활성</span>
                                )}
                              </div>
                              {ds.description && (
                                <div className="text-xs text-gray-500 mt-0.5">{ds.description}</div>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingDesign(ds)
                                  setShowDesignForm(true)
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                              >
                                편집
                              </button>
                              {!ds.active && (
                                <button
                                  onClick={async () => {
                                    if (!selectedId) return
                                    const r = await setActiveDesignSystem(selectedId, ds.id)
                                    if (r.ok) void loadDetail(selectedId)
                                    else alert('활성화 실패: ' + r.error)
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-gray-100"
                                >
                                  이걸 활성으로
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  if (!confirm('이 디자인 시스템을 삭제하시겠습니까?')) return
                                  const r = await deleteDesignSystem(ds.id)
                                  if (r.ok && selectedId) void loadDetail(selectedId)
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-warning/40 text-warning hover:bg-warning/5"
                              >
                                삭제
                              </button>
                            </div>
                          </div>

                          {/* 색상 미리보기 */}
                          {colorEntries.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {colorEntries.map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex items-center gap-1.5 border border-border rounded px-1.5 py-0.5"
                                  title={`${k}: ${String(v)}`}
                                >
                                  <span
                                    className="w-3 h-3 rounded-sm border border-border"
                                    style={{ backgroundColor: typeof v === 'string' ? v : '' }}
                                  />
                                  <span className="text-[10px] font-mono">{k}</span>
                                </div>
                              ))}
                              {Object.keys(tokens.colors ?? {}).length > colorEntries.length && (
                                <span className="text-[10px] text-gray-400 self-center">
                                  +{Object.keys(tokens.colors).length - colorEntries.length}
                                </span>
                              )}
                            </div>
                          )}

                          <details className="mt-2">
                            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                              전체 토큰·컴포넌트 보기
                            </summary>
                            <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-64 overflow-y-auto">
                              {JSON.stringify({ tokens: ds.tokens, components: ds.components, principles: ds.principles }, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAgentForm && (
        <AgentFormModal
          initial={editingAgent}
          onClose={() => {
            setShowAgentForm(false)
            setEditingAgent(null)
          }}
          onSaved={() => {
            void loadAll()
            if (selectedId) void loadDetail(selectedId)
          }}
        />
      )}
      {showKnowledgeForm && selectedAgent && (
        <KnowledgeFormModal
          agentId={selectedAgent.id}
          initial={editingKnowledge}
          onClose={() => {
            setShowKnowledgeForm(false)
            setEditingKnowledge(null)
          }}
          onSaved={() => selectedId && loadDetail(selectedId)}
        />
      )}
      {showExampleForm && selectedAgent && (
        <ExampleFormModal
          agentId={selectedAgent.id}
          initial={editingExample}
          onClose={() => {
            setShowExampleForm(false)
            setEditingExample(null)
          }}
          onSaved={() => selectedId && loadDetail(selectedId)}
        />
      )}
      {showVersionForm && selectedAgent && (
        <PromptVersionModal
          agentId={selectedAgent.id}
          currentVersion={selectedAgent.current_version}
          draftPrompt={draftPrompt}
          onClose={() => setShowVersionForm(false)}
          onSaved={async () => {
            await refreshAgentsKeepingSelection()
            if (selectedId) void loadDetail(selectedId)
          }}
        />
      )}
      {showWisdomForm && (
        <WisdomFormModal
          initial={editingWisdom}
          onClose={() => {
            setShowWisdomForm(false)
            setEditingWisdom(null)
          }}
          onSaved={() => void loadAll()}
        />
      )}
      {showDesignForm && selectedAgent && (
        <DesignSystemFormModal
          agentId={selectedAgent.id}
          initial={editingDesign}
          onClose={() => {
            setShowDesignForm(false)
            setEditingDesign(null)
          }}
          onSaved={() => selectedId && loadDetail(selectedId)}
        />
      )}
    </main>
  )
}

interface TabButtonProps {
  current: Tab
  value: Tab
  onClick: (v: Tab) => void
  count?: number
  children: React.ReactNode
}

function TabButton({ current, value, onClick, count, children }: TabButtonProps) {
  const active = current === value
  return (
    <button
      onClick={() => onClick(value)}
      className={`text-xs px-3 py-2 border-b-2 -mb-px transition ${
        active ? 'border-primary text-primary font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'
      }`}
    >
      {children}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-1 text-[10px] text-gray-400">({count})</span>
      )}
    </button>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-gray-400 text-center py-8 border border-dashed border-border rounded">
      {text}
    </div>
  )
}
