import type { PageKey } from '@/App'

interface SidebarProps {
  currentPage: PageKey
  onNavigate: (page: PageKey) => void
  onNewMission: () => void
}

const NAV_ITEMS: { key: PageKey; label: string }[] = [
  { key: 'missions', label: '미션' },
  { key: 'history', label: '히스토리' },
  { key: 'agents', label: '에이전트' },
  { key: 'settings', label: '설정' },
]

export default function Sidebar({ currentPage, onNavigate, onNewMission }: SidebarProps) {
  return (
    <aside className="border-r border-border p-6 flex flex-col">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded bg-agent-jarvis text-white flex items-center justify-center font-bold text-sm">
          J
        </div>
        <div>
          <div className="font-bold leading-tight">Jarvis</div>
          <div className="text-xs text-gray-500">Multi-Agent Orchestrator</div>
        </div>
      </div>

      <button
        onClick={onNewMission}
        className="mt-6 w-full bg-primary text-white rounded py-2.5 text-sm font-medium hover:opacity-90 transition"
      >
        + 새 미션
      </button>

      <nav className="mt-8 flex flex-col gap-1 text-sm">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`text-left px-3 py-2 rounded transition ${
              currentPage === item.key
                ? 'bg-gray-100 font-medium text-primary'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 rounded-full bg-agent-jarvis" />
          <span>Jarvis</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span className="w-2 h-2 rounded-full bg-agent-lumi" />
          <span>Lumi</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span className="w-2 h-2 rounded-full bg-agent-aki" />
          <span>Aki</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span className="w-2 h-2 rounded-full bg-agent-joi" />
          <span>Joi</span>
        </div>
      </div>
    </aside>
  )
}
