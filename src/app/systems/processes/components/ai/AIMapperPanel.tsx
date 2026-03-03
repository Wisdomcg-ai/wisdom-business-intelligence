'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Undo2, Loader2 } from 'lucide-react'
import type { ProcessSnapshot } from '@/types/process-builder'
import type { BuilderAction } from '../../types'
import { useSystemMapper, type MapperMessage } from '../../hooks/useSystemMapper'
import AIMapperMessage from './AIMapperMessage'

interface AIMapperPanelProps {
  snapshot: ProcessSnapshot
  dispatch: React.Dispatch<BuilderAction>
}

const STARTER_PROMPTS = [
  { label: 'Map a trades process', prompt: "I want to map out a trades/renovation business process" },
  { label: 'Map a services process', prompt: "I want to map out a professional services process" },
  { label: 'Map a sales pipeline', prompt: "I want to map out our sales pipeline" },
  { label: 'Review my process', prompt: "Look at my current process and suggest what I'm missing" },
]

export default function AIMapperPanel({
  snapshot,
  dispatch,
}: AIMapperPanelProps) {
  const { messages, sendMessage, isLoading, undo } = useSystemMapper(snapshot, dispatch)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="border-t border-gray-200 bg-white flex flex-col h-[40%] min-h-[200px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <Bot className="w-4 h-4 text-purple-500" />
        <span className="text-sm font-semibold text-gray-800">AI System Mapper</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                <p>Let&apos;s map out your business process. I&apos;ll guide you step by step, just like a coach with sticky notes on a whiteboard.</p>
                <p className="mt-2 text-xs text-gray-500">Choose a starter or type your own:</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-8">
              {STARTER_PROMPTS.map((sp) => (
                <button
                  key={sp.label}
                  onClick={() => sendMessage(sp.prompt)}
                  disabled={isLoading}
                  className="px-2.5 py-1 text-xs bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 border border-purple-200 transition-colors disabled:opacity-50"
                >
                  {sp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <AIMapperMessage
            key={idx}
            message={msg}
            onUndo={msg.role === 'assistant' && msg.actions && msg.actions.length > 0 ? () => undo(idx) : undefined}
          />
        ))}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
              <Loader2 className="w-3.5 h-3.5 text-purple-600 animate-spin" />
            </div>
            <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-gray-400">
              Thinking…
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Describe what happens next…"
            disabled={isLoading}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-300 focus:border-purple-300 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
