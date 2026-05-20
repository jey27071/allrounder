import { useEffect, useMemo, useState } from 'react'
import { listMissions } from '@/lib/missions'
import type { Mission } from '@/types/app'
import MissionDetailView from '@/components/MissionDetailView'

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  pending: { label: '대기', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: '진행 중', color: 'bg-agent-jarvis text-white' },
  paused: { label: '일시정지', color: 'bg-warning/20 text-warning' },
  completed: { label: '완료', color: 'bg-success/20 text-success' },
  error: { label: '에러', color: 'bg-warning text-white' },
}

type StatusFilter = 'all' | 'completed' | 'in_progress' | 'error'

function isThisMonth(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function HistoryPage() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'cycles'>('recent')
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const list = await listMissions()
    setMissions(list)
    setLoading(false)
  }

  const domains = useMemo(() => {
    const set = new Set(missions.map((m) => m.domain))
    return Array.from(set).sort()
  }, [missions])

  const filtered = useMemo(() => {
    let result = missions

    if (statusFilter !== 'all') {
      result = result.filter((m) => m.status === statusFilter)
    }
    if (domain !== 'all') {
      result = result.filter((m) => m.domain === domain)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((m) => m.title.toLowerCase().includes(q) || m.charter.toLowerCase().includes(q))
    }

    if (sortBy === 'cycles') {
      result = [...result].sort((a, b) => b.reject_cycle - a.reject_cycle)
    } else {
      result = [...result].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return result
  }, [missions, search, domain, statusFilter, sortBy])

  const stats = useMemo(() => {
    const completed = missions.filter((m) => m.status === 'completed')
    const inProgress = missions.filter((m) => m.status === 'in_progress')
    const thisMonth = missions.filter((m) => isThisMonth(m.created_at))
    const avgCycles =
      missions.length > 0
        ? (missions.reduce((sum, m) => sum + m.reject_cycle, 0) / missions.length).toFixed(1)
        : '0.0'
    return {
      total: missions.length,
      completed: completed.length,
      inProgress: inProgress.length,
      thisMonth: thisMonth.length,
      avgCycles,
    }
  }, [missions])

  // Detail view mode
  if (selectedMission) {
    return <MissionDetailView mission={selectedMission} onBack={() => setSelectedMission(null)} />
  }

  return (
    <main className="flex flex-col h-full overflow-hidden">
      <div className="px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold mb-1">히스토리</h1>
        <p className="text-sm text-gray-500">완료된 미션과 진행 중인 미션을 한눈에 봅니다.</p>
      </div>

      {/* Stats */}
      <div className="px-8 pb-4 shrink-0">
        <div className="grid grid-cols-4 gap-3 max-w-3xl">
          <StatCard label="전체" value={stats.total} />
          <StatCard label="완료" value={stats.completed} accent="success" />
          <StatCard label="이번 달" value={stats.thisMonth} />
          <StatCard label="평균 반려" value={stats.avgCycles} />
        </div>
      </div>

      {/* Filters */}
      <div className="px-8 pb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="제목·헌장 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-48 max-w-xs border border-border rounded px-3 py-2 text-sm bg-white"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="border border-border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="all">전체 상태</option>
            <option value="completed">완료</option>
            <option value="in_progress">진행 중</option>
            <option value="error">에러</option>
          </select>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="border border-border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="all">전체 도메인</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'cycles')}
            className="border border-border rounded px-3 py-2 text-sm bg-white"
          >
            <option value="recent">최신순</option>
            <option value="cycles">반려 많은순</option>
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="text-sm text-gray-500">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-12">
            {missions.length === 0
              ? '아직 미션이 없습니다. 새 미션을 시작해보세요.'
              : '조건에 맞는 미션이 없습니다.'}
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl">
            {filtered.map((m) => (
              <HistoryCard key={m.id} mission={m} onClick={() => setSelectedMission(m)} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number | string
  accent?: 'success' | 'warning'
}) {
  const valueColor =
    accent === 'success' ? 'text-success' : accent === 'warning' ? 'text-warning' : 'text-primary'
  return (
    <div className="bg-white border border-border rounded p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${valueColor}`}>{value}</div>
    </div>
  )
}

function HistoryCard({ mission, onClick }: { mission: Mission; onClick: () => void }) {
  const badge = STATUS_BADGE[mission.status] ?? STATUS_BADGE.pending
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-white border border-border rounded hover:border-primary transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>
            <span className="text-xs text-gray-500">{mission.domain}</span>
          </div>
          <div className="font-medium text-sm mb-1 truncate">{mission.title}</div>
          <div className="text-xs text-gray-500 line-clamp-2">{mission.charter}</div>
        </div>
        <div className="text-right text-xs text-gray-500 shrink-0">
          <div>{formatDate(mission.created_at)}</div>
          <div className="font-mono mt-1">⏱ {formatDuration(mission.created_at, mission.completed_at)}</div>
          <div className="font-mono">↻ {mission.reject_cycle}회</div>
        </div>
      </div>
    </button>
  )
}
