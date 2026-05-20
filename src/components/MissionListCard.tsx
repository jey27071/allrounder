import { useEffect, useRef, useState } from 'react'
import type { Mission } from '@/types/app'

interface MissionListCardProps {
  mission: Mission
  isSelected: boolean
  onClick: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', color: 'bg-agent-jarvis text-white' },
  paused: { label: '일시정지', color: 'bg-warning/20 text-warning' },
  completed: { label: '완료', color: 'bg-success/20 text-success' },
  error: { label: '에러', color: 'bg-warning text-white' },
}

export default function MissionListCard({
  mission,
  isSelected,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
}: MissionListCardProps) {
  const badge = STATUS_BADGE[mission.status] ?? STATUS_BADGE.pending
  const date = new Date(mission.created_at)
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  function stopAndRun(fn?: () => void) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      setMenuOpen(false)
      fn?.()
    }
  }

  return (
    <div
      className={`relative w-full p-3 rounded border transition cursor-pointer ${
        isSelected ? 'border-primary bg-white' : 'border-border bg-white hover:border-gray-400'
      } ${mission.archived ? 'opacity-70' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm truncate flex-1">{mission.title}</div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
          {(onArchive || onUnarchive || onDelete) && (
            <div ref={menuRef} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuOpen((v) => !v)
                }}
                className="text-gray-400 hover:text-gray-700 px-1 leading-none"
                aria-label="액션"
              >
                ⋮
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 z-20 bg-white border border-border rounded shadow-md py-1 min-w-32 text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!mission.archived && onArchive && (
                    <button
                      onClick={stopAndRun(onArchive)}
                      className="w-full px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
                    >
                      📥 보관
                    </button>
                  )}
                  {mission.archived && onUnarchive && (
                    <button
                      onClick={stopAndRun(onUnarchive)}
                      className="w-full px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
                    >
                      📤 보관 해제
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={stopAndRun(onDelete)}
                      className="w-full px-3 py-1.5 text-xs hover:bg-warning/10 text-warning text-left"
                    >
                      🗑 영구 삭제
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="text-xs text-gray-500 truncate">{mission.domain}</div>
      <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
        {mission.archived && <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded">보관됨</span>}
        <span>{dateLabel}</span>
      </div>
    </div>
  )
}
