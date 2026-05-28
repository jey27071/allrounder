import { useState } from 'react'
import type { Deliverable, AgentId } from '@/types/app'
import ScreenPreview from './ScreenPreview'
import {
  downloadScreenHtml,
  downloadScreenDesignsJson,
  downloadScreensCombinedHtml,
  downloadScreenTokensAsTokensStudio,
} from '@/lib/screenExport'
import { regenerateScreen, patchScreen, patchAllScreens, updateScreenHtml } from '@/lib/orchestrate'
import ScreensCanvas from './ScreensCanvas'

interface DeliverableViewerModalProps {
  deliverable: Deliverable
  missionTitle: string
  onClose: () => void
}

const DELIVERABLE_LABEL: Record<string, string> = {
  opportunity_map: '기회 지도',
  product_blueprint: 'Blueprint',
  screen_designs: '디자인 시안',
  business_model: '사업화 검증',
  frontend_code: 'React 코드',
  a11y_audit: '접근성 검수',
  legal_review: '법무 검토',
  ethics_review: '윤리 검토',
  test_suite: '테스트 케이스',
}

const AGENT_LABEL: Record<AgentId, string> = {
  jarvis: 'Jarvis',
  lumi: 'Lumi',
  aki: 'Aki',
  joi: 'Joi',
  friday: 'Friday',
  tars: 'TARS',
  echo: 'Echo',
  kitt: 'KITT',
  ethica: 'Ethica',
  qa_bot: 'QA봇',
}

interface ScreenItem {
  name: string
  purpose: string
  html?: string
  html_tailwind?: string
  design_notes?: string
}

interface ScreenDesignsData {
  design_intent?: string
  design_tokens?: Record<string, string>
  screens?: ScreenItem[]
  interaction_notes?: string
}

export default function DeliverableViewerModal({
  deliverable,
  missionTitle,
  onClose,
}: DeliverableViewerModalProps) {
  const label = DELIVERABLE_LABEL[deliverable.type] ?? deliverable.type
  const agent = AGENT_LABEL[deliverable.created_by as AgentId] ?? deliverable.created_by

  const isScreenDesigns = deliverable.type === 'screen_designs'
  const data = deliverable.data as ScreenDesignsData

  const [activeScreen, setActiveScreen] = useState(0)
  const screens = isScreenDesigns ? data?.screens ?? [] : []
  const current = screens[activeScreen]

  // Phase 19-C: 편집·재생성·patch 상태
  const [editMode, setEditMode] = useState<'view' | 'html' | 'patch' | 'regen'>('view')
  const [draftHtml, setDraftHtml] = useState('')
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [opMessage, setOpMessage] = useState<string | null>(null)

  // Phase 19-D: 풀스크린 / 캔버스 모드
  const [fullscreen, setFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<'single' | 'canvas'>('single')

  // Phase 24-B2: 전체 일괄 patch
  const [showBulk, setShowBulk] = useState(false)
  const [bulkInstruction, setBulkInstruction] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  async function handlePatchAll() {
    if (bulkBusy || !bulkInstruction.trim()) return
    if (!confirm(`전체 ${screens.length}개 화면에 다음 patch를 일괄 적용합니다.\n\n"${bulkInstruction}"\n\nGemini Flash ${screens.length}회 호출 (병렬). 진행할까요?`)) return
    setBulkBusy(true)
    const r = await patchAllScreens(deliverable.mission_id, bulkInstruction.trim())
    setBulkBusy(false)
    if (!r.ok) {
      alert('일괄 patch 실패: ' + (r.error ?? r.detail ?? ''))
      return
    }
    setBulkInstruction('')
    setShowBulk(false)
    alert(`완료. ${r.note ?? ''}\n모달을 닫았다가 다시 열면 반영된 시안이 보입니다.`)
  }

  function openInNewWindow() {
    const url = `${window.location.origin}/?view=screens&did=${deliverable.id}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function startHtmlEdit() {
    setDraftHtml(current?.html ?? current?.html_tailwind ?? '')
    setEditMode('html')
    setOpMessage(null)
  }

  async function handleSaveHtmlEdit() {
    if (busy) return
    setBusy(true)
    setOpMessage(null)
    const r = await updateScreenHtml(deliverable.mission_id, activeScreen, draftHtml)
    setBusy(false)
    if (!r.ok) {
      setOpMessage('⚠ 저장 실패: ' + (r.error ?? r.detail ?? ''))
      return
    }
    setOpMessage('✓ 저장됨. 모달을 닫았다가 다시 열면 반영됩니다.')
    // 로컬 데이터도 즉시 반영
    if (current) (current as ScreenItem).html = draftHtml
    setEditMode('view')
  }

  async function handlePatch() {
    if (busy || !instruction.trim()) return
    if (!confirm(`이 화면에 다음 patch를 적용합니다.\n\n"${instruction}"\n\nGemini Flash 1회 호출. 진행할까요?`)) return
    setBusy(true)
    setOpMessage(null)
    const r = await patchScreen(deliverable.mission_id, activeScreen, instruction.trim())
    setBusy(false)
    if (!r.ok) {
      setOpMessage('⚠ patch 실패: ' + (r.error ?? r.detail ?? ''))
      return
    }
    setOpMessage('✓ patch 완료. 모달을 닫았다가 다시 열면 새 시안이 보입니다.')
    setInstruction('')
    setEditMode('view')
  }

  async function handleRegenerate() {
    if (busy) return
    if (!confirm(`#${activeScreen + 1}번 "${current?.name ?? ''}" 화면을 다시 만듭니다. Gemini Pro 1회 호출, 30~60초.\n진행할까요?`)) return
    setBusy(true)
    setOpMessage(null)
    const r = await regenerateScreen(deliverable.mission_id, activeScreen, instruction.trim() || undefined)
    setBusy(false)
    if (!r.ok) {
      setOpMessage('⚠ 재생성 실패: ' + (r.error ?? r.detail ?? ''))
      return
    }
    setOpMessage('✓ 재생성 완료. 모달을 닫았다가 다시 열면 새 화면이 보입니다.')
    setInstruction('')
    setEditMode('view')
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className={`bg-white shadow-lg flex flex-col ${
          fullscreen
            ? 'w-screen h-screen rounded-none'
            : 'w-full max-w-7xl max-h-[95vh] rounded-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold">{label}</span>
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                v{deliverable.version}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  deliverable.status === 'approved' || deliverable.status === 'final'
                    ? 'bg-success/20 text-success'
                    : deliverable.status === 'rejected'
                      ? 'bg-warning/20 text-warning'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {deliverable.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 truncate">
              {agent} · {missionTitle}
              {deliverable.review_score != null && ` · 점수 ${deliverable.review_score}/20`}
            </div>
          </div>

          {/* Phase 19-D: 뷰 모드 + 풀스크린 + 디태치 */}
          {isScreenDesigns && screens.length > 0 && (
            <>
              <div className="flex items-center gap-1 border border-border rounded">
                <button
                  onClick={() => setViewMode('single')}
                  className={`text-xs px-3 py-1 ${viewMode === 'single' ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}
                  title="한 화면씩 보기"
                >
                  📱 단일
                </button>
                <button
                  onClick={() => setViewMode('canvas')}
                  className={`text-xs px-3 py-1 ${viewMode === 'canvas' ? 'bg-primary text-white' : 'bg-white text-gray-700'}`}
                  title="아트보드(캔버스)에 모두 펼치기"
                >
                  🗺 캔버스
                </button>
              </div>
              <button
                onClick={() => setShowBulk((v) => !v)}
                className={`text-xs px-2 py-1 rounded border ${
                  showBulk ? 'border-primary bg-primary text-white' : 'border-border hover:bg-gray-50'
                }`}
                title="모든 화면에 동일 지시로 일괄 patch"
              >
                🎯 전체 일괄 patch
              </button>
              <button
                onClick={() => setFullscreen((v) => !v)}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-gray-50"
                title={fullscreen ? '원래 크기' : '풀스크린'}
              >
                {fullscreen ? '⤧ 원래 크기' : '⛶ 풀스크린'}
              </button>
              <button
                onClick={openInNewWindow}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-gray-50"
                title="새 창에서 풀화면으로 열기 (보조 모니터 추천)"
              >
                ↗ 새 창
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* Phase 24-B2: 전체 일괄 patch 입력 (헤더 아래 토글) */}
        {showBulk && isScreenDesigns && screens.length > 0 && (
          <div className="px-4 py-3 border-b border-border bg-primary/5">
            <div className="text-xs font-medium text-gray-700 mb-2">
              🎯 전체 {screens.length}개 화면에 동일 지시로 일괄 patch
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={bulkInstruction}
                onChange={(e) => setBulkInstruction(e.target.value)}
                placeholder={'예: 모든 버튼의 카피를 "-요" 톤으로 통일 / 전체적으로 여백을 더 넓게 / 다크모드 톤으로'}
                className="flex-1 border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:border-primary"
                disabled={bulkBusy}
              />
              <button
                onClick={() => void handlePatchAll()}
                disabled={bulkBusy || !bulkInstruction.trim()}
                className="text-sm px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
              >
                {bulkBusy ? `⏳ ${screens.length}개 patch 중...` : `전체 적용 (Flash ${screens.length}회)`}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              모든 화면에 동일한 지시가 전달됩니다. 각 화면별로 조이가 최소한의 변경으로 patch.
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden flex">
          {isScreenDesigns && screens.length > 0 && viewMode === 'canvas' ? (
            <ScreensCanvas screens={screens} />
          ) : isScreenDesigns && screens.length > 0 ? (
            <>
              <div className="w-56 border-r border-border overflow-y-auto p-4 space-y-2 shrink-0 bg-gray-50">
                <div className="text-xs font-medium text-gray-500 mb-2">화면 ({screens.length})</div>
                {screens.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveScreen(i)}
                    className={`w-full text-left p-3 rounded border transition ${
                      i === activeScreen
                        ? 'border-agent-joi bg-white font-medium'
                        : 'border-border bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="text-sm">{s.name}</div>
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">{s.purpose}</div>
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {current && (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base mb-1">{current.name}</h3>
                        <p className="text-sm text-gray-600">{current.purpose}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          onClick={() =>
                            downloadScreenHtml(current.name, current.html ?? current.html_tailwind ?? '')
                          }
                          className="text-[10px] px-2 py-1 rounded border border-border hover:bg-gray-50"
                          title="이 화면을 .html 파일로 다운로드"
                        >
                          ⬇ 이 화면 .html
                        </button>
                      </div>
                    </div>
                    {editMode === 'html' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">HTML 직접 편집</div>
                          <textarea
                            value={draftHtml}
                            onChange={(e) => setDraftHtml(e.target.value)}
                            rows={20}
                            className="w-full border border-border rounded p-2 text-[11px] font-mono focus:outline-none focus:border-primary"
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">즉시 미리보기</div>
                          <ScreenPreview html={draftHtml} height={420} />
                        </div>
                      </div>
                    ) : (
                      <ScreenPreview html={current.html ?? current.html_tailwind ?? ''} height={500} />
                    )}
                    {current.design_notes && editMode === 'view' && (
                      <div className="p-3 bg-gray-50 rounded text-xs leading-relaxed">
                        <strong>디자인 노트:</strong>
                        <div className="mt-1 text-gray-700">{current.design_notes}</div>
                      </div>
                    )}

                    {/* Phase 19-C: 정교 수정 컨트롤 */}
                    <div className="border border-border rounded p-3 bg-gray-50/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-medium text-gray-700">🛠 이 화면만 수정</span>
                        <div className="ml-auto flex gap-1">
                          <button
                            onClick={() => setEditMode('view')}
                            className={`text-[10px] px-2 py-1 rounded border ${editMode === 'view' ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}
                          >
                            보기
                          </button>
                          <button
                            onClick={() => setEditMode('patch')}
                            className={`text-[10px] px-2 py-1 rounded border ${editMode === 'patch' ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}
                          >
                            🎯 자연어 patch
                          </button>
                          <button
                            onClick={() => setEditMode('regen')}
                            className={`text-[10px] px-2 py-1 rounded border ${editMode === 'regen' ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}
                          >
                            🔄 재생성
                          </button>
                          <button
                            onClick={editMode === 'html' ? () => setEditMode('view') : startHtmlEdit}
                            className={`text-[10px] px-2 py-1 rounded border ${editMode === 'html' ? 'border-primary bg-primary text-white' : 'border-border bg-white'}`}
                          >
                            ✏️ HTML 편집
                          </button>
                        </div>
                      </div>

                      {editMode === 'patch' && (
                        <div className="space-y-2">
                          <textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            rows={3}
                            placeholder={'예: 상단 카드의 배경색만 #FAFAF9로 바꿔 / "오늘의 미션" 글자 크기를 24px로 키워'}
                            className="w-full border border-border rounded p-2 text-xs focus:outline-none focus:border-primary"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void handlePatch()}
                              disabled={busy || !instruction.trim()}
                              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
                            >
                              {busy ? '⏳ patch 중...' : 'patch 적용 (Flash 1회)'}
                            </button>
                            <span className="text-[10px] text-gray-500">최소한의 변경으로 HTML이 수정됩니다.</span>
                          </div>
                        </div>
                      )}

                      {editMode === 'regen' && (
                        <div className="space-y-2">
                          <textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            rows={3}
                            placeholder={'(선택) 재생성 시 반영할 추가 지시. 비워두면 기존 정보로만 새로 만듭니다.'}
                            className="w-full border border-border rounded p-2 text-xs focus:outline-none focus:border-primary"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void handleRegenerate()}
                              disabled={busy}
                              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
                            >
                              {busy ? '⏳ 재생성 중...' : '이 화면만 재생성 (Pro 1회, 30~60초)'}
                            </button>
                          </div>
                        </div>
                      )}

                      {editMode === 'html' && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void handleSaveHtmlEdit()}
                            disabled={busy}
                            className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90 disabled:opacity-40"
                          >
                            {busy ? '⏳ 저장 중...' : '✓ 편집 저장 (LLM 호출 없음)'}
                          </button>
                          <button
                            onClick={() => setEditMode('view')}
                            disabled={busy}
                            className="text-xs px-3 py-1.5 rounded border border-border hover:bg-gray-50 disabled:opacity-40"
                          >
                            취소
                          </button>
                        </div>
                      )}

                      {opMessage && (
                        <div className={`mt-2 p-2 rounded text-[11px] ${opMessage.startsWith('⚠') ? 'bg-warning/10 text-warning border border-warning/30' : 'bg-success/10 text-success border border-success/30'}`}>
                          {opMessage}
                        </div>
                      )}
                    </div>

                    {/* 전체 시안 export */}
                    <div className="pt-4 border-t border-border flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-500">전체 시안 export:</span>
                      <button
                        onClick={() => downloadScreensCombinedHtml(missionTitle, data)}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-gray-50"
                      >
                        ⬇ 모든 화면 통합 .html
                      </button>
                      <button
                        onClick={() => downloadScreenDesignsJson(missionTitle, data)}
                        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-gray-50"
                      >
                        ⬇ JSON 백업
                      </button>
                      <button
                        onClick={() => downloadScreenTokensAsTokensStudio(missionTitle, data)}
                        className="text-[10px] px-2 py-1 rounded border border-primary text-primary hover:bg-primary/5"
                        title="시안에서 사용된 색상·폰트를 Figma Tokens Studio 형식 JSON으로 추출"
                      >
                        🎨 Figma Tokens Studio용 토큰 추출
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              {deliverable.raw_markdown ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800">
                  {deliverable.raw_markdown}
                </div>
              ) : (
                <pre className="text-xs leading-relaxed text-gray-700 font-mono whitespace-pre-wrap">
                  {JSON.stringify(deliverable.data, null, 2)}
                </pre>
              )}
              {deliverable.review_notes && (
                <div className="mt-4 pt-4 border-t border-border text-xs text-gray-600">
                  <span className="font-medium">검수 노트:</span> {deliverable.review_notes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
