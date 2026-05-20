import type { Mission } from '@/types/app'

interface MissionListCardProps {
  mission: Mission
  isSelected: boolean
  onClick: () => void
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', color: 'bg-agent-jarvis text-white' },
  paused: { label: '일시정지', color: 'bg-warning/20 text-warning' },
  completed: { label: '완료', color: 'bg-success/20 text-success' },
  error: { label: '에러', color: 'bg-warning text-white' },
}

export default function MissionListCard({ mission, isSelected, onClick }: MissionListCardProps) {
  const badge = STATUS_BADGE[mission.status] ?? STATUS_BADGE.pending
  const date = new Date(mission.created_at)
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded border transition ${
        isSelected
          ? 'border-primary bg-white'
          : 'border-border bg-white hover:border-gray-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-medium text-sm truncate flex-1">{mission.title}</div>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${badge.color}`}>{badge.label}</span>
      </div>
      <div className="text-xs text-gray-500 truncate">{mission.domain}</div>
      <div className="text-xs text-gray-400 mt-1">{dateLabel}</div>
    </button>
  )
}
