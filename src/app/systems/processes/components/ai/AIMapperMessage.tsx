'use client'

import { Bot, User, Undo2 } from 'lucide-react'
import type { MapperMessage } from '../../hooks/useSystemMapper'

interface AIMapperMessageProps {
  message: MapperMessage
  onUndo?: () => void
}

export default function AIMapperMessage({ message, onUndo }: AIMapperMessageProps) {
  const isAI = message.role === 'assistant'

  return (
    <div className="flex items-start gap-2">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isAI ? 'bg-purple-100' : 'bg-gray-100'
        }`}
      >
        {isAI ? (
          <Bot className="w-3.5 h-3.5 text-purple-600" />
        ) : (
          <User className="w-3.5 h-3.5 text-gray-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isAI ? 'bg-purple-50 text-gray-700' : 'bg-gray-100 text-gray-800'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>

          {/* Show what actions were taken */}
          {isAI && message.actions && message.actions.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.actions.map((action, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-100/50 rounded px-2 py-0.5"
                >
                  <span className="font-medium">+</span>
                  <span>{action.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Undo button for AI messages that added content */}
        {onUndo && (
          <button
            onClick={onUndo}
            className="flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          >
            <Undo2 className="w-2.5 h-2.5" />
            Undo
          </button>
        )}
      </div>
    </div>
  )
}
