/**
 * ChatPanel - Center panel of the 3-panel wizard layout
 *
 * Features:
 * - Continuous chat that never clears between steps
 * - Step transition indicators
 * - Quick response suggestions
 * - Typing indicator when AI is thinking
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, CheckCircle, ArrowRight } from 'lucide-react';
import { CFOMessage, WizardStep } from '@/app/finances/forecast/types';

interface ChatPanelProps {
  messages: CFOMessage[];
  currentStep: WizardStep;
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  suggestions?: string[];
}

// Step metadata for transitions
const STEP_INFO: Record<WizardStep, { label: string; number: number }> = {
  setup: { label: 'Setup', number: 1 },
  team: { label: 'Team', number: 2 },
  costs: { label: 'Costs', number: 3 },
  investments: { label: 'Investments', number: 4 },
  projections: { label: 'Projections', number: 5 },
  review: { label: 'Review', number: 6 },
};

interface MessageBubbleProps {
  message: CFOMessage;
  isLatest: boolean;
}

function MessageBubble({ message, isLatest }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="bg-gray-100 text-gray-600 text-sm px-4 py-2 rounded-full">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {/* Message content with markdown-like formatting */}
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content.split('\n').map((line, i) => {
            // Handle bullet points
            if (line.trim().startsWith('-') || line.trim().match(/^\d+\./)) {
              return (
                <div key={i} className="ml-2 my-1">
                  {line}
                </div>
              );
            }
            // Handle empty lines
            if (!line.trim()) {
              return <div key={i} className="h-2" />;
            }
            return <div key={i}>{line}</div>;
          })}
        </div>

        {/* AI suggestion indicator */}
        {message.ai_suggestion && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500">
              Suggestion: {message.ai_suggestion.suggestion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepTransition({
  fromStep,
  toStep,
}: {
  fromStep: WizardStep;
  toStep: WizardStep;
}) {
  const fromInfo = STEP_INFO[fromStep];
  const toInfo = STEP_INFO[toStep];

  return (
    <div className="flex items-center justify-center my-6 gap-3">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-4 h-4 text-green-600" />
        </div>
        <span className="text-sm text-gray-500">{fromInfo.label}</span>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-300" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
          <span className="text-xs font-medium text-blue-600">{toInfo.number}</span>
        </div>
        <span className="text-sm font-medium text-gray-900">{toInfo.label}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({
  messages,
  currentStep,
  isLoading,
  onSendMessage,
  suggestions = [],
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isLoading) {
      onSendMessage(suggestion);
    }
  };

  // Group messages with step transitions
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];
    let lastStep: WizardStep | null = null;

    messages.forEach((message, index) => {
      // Check if we need to show a step transition
      if (message.step && lastStep && message.step !== lastStep && message.role === 'cfo') {
        elements.push(
          <StepTransition
            key={`transition-${index}`}
            fromStep={lastStep}
            toStep={message.step}
          />
        );
      }

      elements.push(
        <MessageBubble
          key={message.id}
          message={message}
          isLatest={index === messages.length - 1}
        />
      );

      if (message.step) {
        lastStep = message.step;
      }
    });

    return elements;
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header with current step */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Step {STEP_INFO[currentStep].number} of 6:</span>
            <span className="font-medium text-gray-900">{STEP_INFO[currentStep].label}</span>
          </div>
          {isLoading && (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-gray-400 text-sm">Starting conversation...</div>
          </div>
        ) : (
          <>
            {renderMessages()}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Quick suggestions */}
      {suggestions.length > 0 && !isLoading && (
        <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 4).map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-gray-200 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your response..."
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
