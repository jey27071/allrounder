import { useState } from 'react'
import type { Deliverable, AgentId } from '@/types/app'
import ScreenPreview from './ScreenPreview'

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

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
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
            <div className="text-xs text-gray-500">
              {agent} · {missionTitle}
              {deliverable.review_score != null && ` · 점수 ${deliverable.review_score}/20`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex">
          {isScreenDesigns && screens.length > 0 ? (
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
