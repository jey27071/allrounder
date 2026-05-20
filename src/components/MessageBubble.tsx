import type { Message, MessageSender } from '@/types/app'

interface MessageBubbleProps {
  message: Message
}

const SENDER_LABEL: Record<MessageSender, string> = {
  director: '디렉터',
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
  system: 'System',
}

const SENDER_COLOR: Record<MessageSender, string> = {
  director: 'bg-primary text-white',
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
  system: 'bg-gray-200 text-gray-600',
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isDirector = message.sender === 'director'
  const isSystem = message.sender === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="text-xs text-gray-400">{message.content}</div>
      </div>
    )
  }

  return (
    <div className={`flex gap-3 ${isDirector ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${SENDER_COLOR[message.sender]}`}
      >
        {SENDER_LABEL[message.sender][0]}
      </div>
      <div className={`max-w-[80%] ${isDirector ? 'items-end' : ''}`}>
        <div className="text-xs text-gray-500 mb-1">{SENDER_LABEL[message.sender]}</div>
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
