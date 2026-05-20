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

const TEAM = [
  { color: 'bg-agent-lumi', name: 'Lumi', role: '리서치·전략' },
  { color: 'bg-agent-aki', name: 'Aki', role: '설계·검수' },
  { color: 'bg-agent-joi', name: 'Joi', role: '비주얼 디자인' },
  { color: 'bg-agent-friday', name: 'Friday', role: '사업화' },
  { color: 'bg-agent-tars', name: 'TARS', role: 'React 코드' },
  { color: 'bg-agent-echo', name: 'Echo', role: '접근성' },
  { color: 'bg-agent-kitt', name: 'KITT', role: '법무' },
  { color: 'bg-agent-ethica', name: 'Ethica', role: '윤리' },
  { color: 'bg-agent-qa', name: 'QA봇', role: '테스트' },
]

function AgentDot({ color, name, role }: { color: string; name: string; role?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs mt-1">
      <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      <span className="text-gray-700">{name}</span>
      {role && <span className="text-[10px] text-gray-400 ml-auto">{role}</span>}
    </div>
  )
}

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
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">
          Orchestrator
        </div>
        <AgentDot color="bg-agent-jarvis" name="Jarvis" role="라우팅" />

        <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-4 mb-2">
          Team ({TEAM.length})
        </div>
        {TEAM.map((agent) => (
          <AgentDot key={agent.name} color={agent.color} name={agent.name} role={agent.role} />
        ))}
      </div>
    </aside>
  )
}
