import { useEffect, useState } from 'react'
import { getLatestDeliverable } from '@/lib/deliverables'
import { decideCp3 } from '@/lib/orchestrate'
import type { Mission } from '@/types/app'
import ScreenPreview from './ScreenPreview'
import IndustrialDesignView, { type IndustrialDesignData } from './IndustrialDesignView'

interface Cp3ModalProps {
  mission: Mission
  onClose: () => void
}

interface ScreenItem {
  name: string
  purpose: string
  html?: string
  html_tailwind?: string  // Gemini가 가끔 이 필드명으로 출력
  design_notes: string
}

interface ScreenDesignsData {
  design_intent?: string
  design_tokens?: Record<string, string>
  screens?: ScreenItem[]
  interaction_notes?: string
}

export default function Cp3Modal({ mission, onClose }: Cp3ModalProps) {
  const isPhysical = mission.mission_type === 'physical_product'
  const [data, setData] = useState<ScreenDesignsData | null>(null)
  const [industrialData, setIndustrialData] = useState<IndustrialDesignData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeScreen, setActiveScreen] = useState<number>(0)
  // 'revise' | 'reject' | 'cancel' — 입력창이 열린 모드
  const [commentMode, setCommentMode] = useState<null | 'revise' | 'reject' | 'cancel'>(null)
  const [comment, setComment] = useState('')

  useEffect(() => {
    void load()
  }, [mission.id])

  async function load() {
    setLoading(true)
    if (isPhysical) {
      const d = await getLatestDeliverable(mission.id, 'industrial_design')
      if (d?.data) {
        setIndustrialData(d.data as IndustrialDesignData)
      } else {
        setError('산업디자인 데이터를 찾을 수 없습니다. 이지가 산출물을 만들지 못했을 수 있어요.')
      }
    } else {
      const d = await getLatestDeliverable(mission.id, 'screen_designs')
      if (d?.data) {
        setData(d.data as ScreenDesignsData)
      } else {
        setError('디자인 데이터를 찾을 수 없습니다.')
      }
    }
    setLoading(false)
  }

  async function handleApprove() {
    setSubmitting(true)
    setError(null)
    const result = await decideCp3(mission.id, 'approve')
    if (!result.ok) {
      setError(result.error ?? '승인 실패')
      setSubmitting(false)
      return
    }
    onClose()
  }

  async function handleDecisionWithComment(decision: 'revise' | 'reject' | 'cancel') {
    if (commentMode !== decision) {
      setCommentMode(decision)
      setComment('')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await decideCp3(mission.id, decision, comment || undefined)
    if (!result.ok) {
      setError(result.error ?? '처리 실패')
      setSubmitting(false)
      return
    }
    onClose()
  }

  function handleDownloadHtml() {
    if (!data?.screens) return
    const combined = data.screens
      .map((s) => `<!-- ${s.name} -->\n<div>\n${s.html}\n</div>\n\n`)
      .join('')
    const blob = new Blob([combined], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${mission.title}-Screens.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const screens = data?.screens ?? []
  const current = screens[activeScreen]

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-6xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-border">
          <div className={`text-xs font-bold mb-1 ${isPhysical ? 'text-agent-izzy' : 'text-agent-joi'}`}>
            ★ CP3 — 디렉터의 최종 검토 ({isPhysical ? '산업디자인' : '디자인'})
          </div>
          <h2 className="text-lg font-bold">{mission.title}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {isPhysical
              ? '이지가 제안한 3가지 산업디자인 컨셉을 검토하고 결정해주세요.'
              : '조이가 작성한 화면 시안을 검토하고 결정해주세요.'}
          </p>
          {!isPhysical && data?.design_intent && (
            <p className="mt-3 text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded">
              <strong>디자인 의도:</strong> {data.design_intent}
            </p>
          )}
          {isPhysical && industrialData?.design_intent && (
            <p className="mt-3 text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded">
              <strong>디자인 의도:</strong> {industrialData.design_intent}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-hidden flex">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">불러오는 중...</div>
          ) : isPhysical ? (
            industrialData ? (
              <IndustrialDesignView data={industrialData} />
            ) : (
              <div className="p-6 text-sm text-gray-500">산업디자인 데이터 없음</div>
            )
          ) : (
            <>
              {/* Screen tabs */}
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

              {/* Preview + notes */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {current ? (
                  <>
                    <div>
                      <h3 className="font-bold text-base mb-1">{current.name}</h3>
                      <p className="text-sm text-gray-600">{current.purpose}</p>
                    </div>
                    <ScreenPreview html={current.html ?? current.html_tailwind ?? ''} height={500} />
                    {current.design_notes && (
                      <div className="p-3 bg-gray-50 rounded text-xs leading-relaxed">
                        <strong>디자인 노트:</strong>
                        <div className="mt-1 text-gray-700">{current.design_notes}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-500">화면 데이터 없음</div>
                )}

                {data?.interaction_notes && activeScreen === 0 && (
                  <div className="mt-6 p-3 bg-gray-50 rounded text-xs leading-relaxed">
                    <strong>인터랙션 메모:</strong>
                    <div className="mt-1 text-gray-700 whitespace-pre-wrap">{data.interaction_notes}</div>
                  </div>
                )}

                {data?.design_tokens && activeScreen === 0 && (
                  <div className="mt-3 p-3 bg-gray-50 rounded text-xs">
                    <strong>디자인 토큰:</strong>
                    <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-gray-700">
                      {Object.entries(data.design_tokens).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-gray-500">{k}:</span> {v}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-3 p-3 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
            ⚠ {error}
          </div>
        )}

        {commentMode && (
          <div className="px-6 pb-3">
            <label className="text-xs font-medium text-gray-700 mb-1 block">
              {commentMode === 'revise' && '수정 요청 내용 (조이가 부분 수정)'}
              {commentMode === 'reject' && '반려 사유 (조이가 처음부터 다시 작업)'}
              {commentMode === 'cancel' && '취소 사유 (이 단계까지 산출물 보존, 미션 종료)'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={
                commentMode === 'revise'
                  ? '어떤 부분을 어떻게 수정해야 할지 적어주세요.'
                  : commentMode === 'reject'
                    ? '왜 시안을 폐기하고 다시 작업해야 하는지'
                    : '미션을 여기서 종료하는 이유 (선택)'
              }
              className="w-full border border-border rounded px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>
        )}

        <div className="p-4 border-t border-border flex items-center justify-between bg-gray-50">
          {isPhysical ? (
            <div className="text-[10px] text-gray-400">
              💡 Midjourney 프롬프트는 각 컨셉의 "🎨 프롬프트 복사"로 사용
            </div>
          ) : (
            <button
              onClick={handleDownloadHtml}
              className="px-3 py-2 text-xs rounded border border-border hover:bg-gray-100"
            >
              📥 HTML 다운로드
            </button>
          )}
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => void handleDecisionWithComment('cancel')}
              disabled={submitting}
              className="px-3 py-2 text-sm rounded border border-border text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              title="이 단계까지의 산출물을 보존하고 미션 종료"
            >
              {commentMode === 'cancel' ? '취소 확정' : '⊘ 취소(종료)'}
            </button>
            <button
              onClick={() => void handleDecisionWithComment('reject')}
              disabled={submitting}
              className="px-3 py-2 text-sm rounded border border-warning/50 text-warning hover:bg-warning/5 disabled:opacity-50"
              title="이 시안 폐기, 조이가 처음부터 다시 작업"
            >
              {commentMode === 'reject' ? '반려 확정' : '✕ 반려(재작업)'}
            </button>
            <button
              onClick={() => void handleDecisionWithComment('revise')}
              disabled={submitting}
              className="px-3 py-2 text-sm rounded border border-border hover:bg-gray-100 disabled:opacity-50"
            >
              {commentMode === 'revise' ? '수정 요청 전송' : '🔄 수정 요청'}
            </button>
            <button
              onClick={() => void handleApprove()}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded bg-primary text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? '진행 중...' : '✅ 승인 (미션 완료)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
