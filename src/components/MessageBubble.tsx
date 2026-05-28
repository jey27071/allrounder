import type { Message } from '@/types/app'

interface MessageBubbleProps {
  message: Message
}

// 빌트인 sender 라벨. sub-agent 11명까지 포함.
const SENDER_LABEL: Record<string, string> = {
  director: '디렉터',
  system: 'System',
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
  wordy: '워디',
  izzy: '이지',
  meka: '메카',
  forge: '포지',
  pako: '파코',
  // Phase 13 sub-agents
  lumi_data: '루미·데이터',
  lumi_scout: '루미·스카웃',
  aki_ia: '아키·IA',
  aki_flow: '아키·여정',
  // Phase 14 sub-agents
  joi_palette: '조이·팔레트',
  joi_type: '조이·타이포',
  tars_markup: '타스·마크업',
  tars_logic: '타스·로직',
  qa_happy: 'QA·해피',
  qa_edge: 'QA·엣지',
  qa_error: 'QA·에러',
}

const SENDER_COLOR: Record<string, string> = {
  director: 'bg-primary text-white',
  system: 'bg-gray-200 text-gray-600',
  jarvis: 'bg-agent-jarvis text-white',
  lumi: 'bg-agent-lumi text-white',
  aki: 'bg-agent-aki text-white',
  joi: 'bg-agent-joi text-white',
  friday: 'bg-agent-friday text-white',
  tars: 'bg-agent-tars text-white',
  echo: 'bg-agent-echo text-white',
  kitt: 'bg-agent-kitt text-white',
  ethica: 'bg-agent-ethica text-white',
  qa_bot: 'bg-agent-qa text-white',
  wordy: 'bg-agent-wordy text-white',
  izzy: 'bg-agent-izzy text-white',
  meka: 'bg-agent-meka text-white',
  forge: 'bg-agent-forge text-white',
  pako: 'bg-agent-pako text-white',
  lumi_data: 'bg-agent-lumi text-white',
  lumi_scout: 'bg-agent-lumi text-white',
  aki_ia: 'bg-agent-aki text-white',
  aki_flow: 'bg-agent-aki text-white',
  joi_palette: 'bg-agent-joi text-white',
  joi_type: 'bg-agent-joi text-white',
  tars_markup: 'bg-agent-tars text-white',
  tars_logic: 'bg-agent-tars text-white',
  qa_happy: 'bg-agent-qa text-white',
  qa_edge: 'bg-agent-qa text-white',
  qa_error: 'bg-agent-qa text-white',
}

function labelFor(sender: string): string {
  return SENDER_LABEL[sender] ?? sender
}
function colorFor(sender: string): string {
  return SENDER_COLOR[sender] ?? 'bg-gray-400 text-white'
}
function avatarChar(sender: string): string {
  const label = labelFor(sender)
  return label && label.length > 0 ? label[0] : '?'
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const sender = message.sender ?? ''
  const isDirector = sender === 'director'
  const isSystem = sender === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-400 whitespace-pre-wrap">{message.content}</div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isDirector ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colorFor(sender)}`}
      >
        {avatarChar(sender)}
      </div>
      <div className={`max-w-[80%] ${isDirector ? 'items-end' : ''}`}>
        <div className="text-xs text-gray-500 mb-1">{labelFor(sender)}</div>
        <div
          className={`rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed ${
            isDirector ? 'bg-primary text-white' : 'bg-white border border-border'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
