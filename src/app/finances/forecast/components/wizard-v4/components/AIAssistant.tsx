'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Bot } from 'lucide-react';
import { WizardStep } from '../types';

interface AIAssistantProps {
  isOpen: boolean;
  onToggle: () => void;
  currentStep: WizardStep;
  businessId: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const TOOLTIP_STORAGE_KEY = 'forecast-wizard-ai-tooltip-dismissed';

const STEP_PROMPTS: Record<WizardStep, { title: string; suggestions: string[] }> = {
  1: {
    title: 'Setting Goals',
    suggestions: [
      'What growth rate is realistic for my industry?',
      'How should I set my gross profit target?',
      'What net profit margin should I aim for?',
    ],
  },
  2: {
    title: 'Reviewing Prior Year',
    suggestions: [
      'Explain my seasonality pattern',
      'Why is my gross profit lower than average?',
      'Which costs should I focus on reducing?',
    ],
  },
  3: {
    title: 'Revenue & COGS',
    suggestions: [
      'Should I use seasonal or straight-line distribution?',
      'How can I improve my COGS percentage?',
      'What revenue mix is optimal?',
    ],
  },
  4: {
    title: 'Team Planning',
    suggestions: [
      'What salary should I offer for this role?',
      'When should I hire my next team member?',
      'How do I structure sales commissions?',
    ],
  },
  5: {
    title: 'Operating Expenses',
    suggestions: [
      'Which costs can I reduce?',
      'What increase % is reasonable?',
      'How do my costs compare to benchmarks?',
    ],
  },
  6: {
    title: 'CapEx & Investments',
    suggestions: [
      'Should I lease or buy this equipment?',
      'What depreciation method should I use?',
      'How do I prioritize investments?',
    ],
  },
  7: {
    title: 'Other Expenses',
    suggestions: [
      'What expenses am I missing?',
      'Are there tax implications I should consider?',
      'How do I budget for unexpected costs?',
    ],
  },
  8: {
    title: 'Final Review',
    suggestions: [
      'How can I hit my profit target?',
      'What are the biggest risks in this forecast?',
      'Summarize my key assumptions',
    ],
  },
};

export function AIAssistant({ isOpen, onToggle, currentStep, businessId }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if tooltip should be shown on mount
  useEffect(() => {
    const dismissed = localStorage.getItem(TOOLTIP_STORAGE_KEY);
    if (!dismissed && currentStep === 1) {
      // Show tooltip after a short delay
      const timer = setTimeout(() => setShowTooltip(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  const dismissTooltip = () => {
    setShowTooltip(false);
    localStorage.setItem(TOOLTIP_STORAGE_KEY, 'true');
  };

  const handleToggle = () => {
    setHasInteracted(true);
    dismissTooltip();
    onToggle();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/forecast-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          context: {
            step: currentStep,
            businessId,
          },
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: data.message || "I'm here to help you build your forecast. What would you like to know?",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI Assistant error:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  const stepInfo = STEP_PROMPTS[currentStep];

  // Collapsed state - show prominent floating button with tooltip
  if (!isOpen) {
    return (
      <div className="fixed bottom-24 right-6 z-[100]">
        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-3 w-64 animate-fade-in">
            <div className="bg-gray-900 text-white rounded-xl p-4 shadow-xl relative">
              <button
                onClick={dismissTooltip}
                className="absolute top-2 right-2 p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">Need help building your forecast?</p>
                  <p className="text-gray-300 text-xs mt-1">
                    Click here to chat with your AI CFO assistant
                  </p>
                </div>
              </div>
              {/* Arrow */}
              <div className="absolute -bottom-2 right-6 w-4 h-4 bg-gray-900 transform rotate-45" />
            </div>
          </div>
        )}

        {/* Floating button with pulse animation */}
        <button
          onClick={handleToggle}
          className={`group relative w-16 h-16 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 ${
            !hasInteracted ? 'animate-bounce-gentle' : ''
          }`}
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 50%, #0ea5e9 100%)',
          }}
        >
          {/* Pulse rings */}
          {!hasInteracted && (
            <>
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-ping opacity-30" />
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse opacity-20" />
            </>
          )}

          {/* Icon */}
          <div className="relative flex items-center justify-center w-full h-full">
            <Sparkles className="w-7 h-7 text-white" />
          </div>

          {/* Label badge */}
          <div className="absolute -top-1 -left-1 bg-white text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md">
            AI CFO
          </div>
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-[100] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-navy text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <div>
            <span className="font-medium">AI CFO Assistant</span>
            <span className="text-xs text-white/70 block">{stepInfo.title}</span>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 text-brand-navy/20 mx-auto mb-4" />
            <p className="text-gray-500 text-sm mb-4">
              I'm here to help you build your forecast. Ask me anything!
            </p>
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">Try asking:</p>
              {stepInfo.suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="block w-full text-left text-sm text-brand-navy hover:bg-brand-navy/5 px-3 py-2 rounded-lg transition-colors"
                >
                  "{suggestion}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-brand-navy text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-100">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-brand-navy text-white rounded-full hover:bg-brand-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
