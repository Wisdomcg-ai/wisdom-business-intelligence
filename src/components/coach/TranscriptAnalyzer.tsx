'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Sparkles, Brain } from 'lucide-react'

interface TranscriptAnalyzerProps {
  sessionId: string
  onAnalysisComplete?: () => void
}

interface AnalysisResult {
  summary: string
  topics: string[]
  sentiment: string
  goals: string[]
  action_items_created: number
}

export default function TranscriptAnalyzer({ sessionId, onAnalysisComplete }: TranscriptAnalyzerProps) {
  const [analyzing, setAnalyzing] = useState(false)
  const [transcriptText, setTranscriptText] = useState('')
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      const text = e.target?.result as string
      setTranscriptText(text)
    }

    reader.onerror = () => {
      setError('Failed to read file')
    }

    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      reader.readAsText(file)
    } else {
      setError('Only .txt files are supported. For .docx or .pdf, please copy and paste the text.')
    }
  }

  const analyzeTranscript = async () => {
    if (!transcriptText.trim() || transcriptText.trim().length < 50) {
      setError('Please provide at least 50 characters of transcript text')
      return
    }

    setAnalyzing(true)
    setError(null)
    setAnalysisResult(null)

    try {
      const res = await fetch(`/api/sessions/${sessionId}/analyze-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_text: transcriptText })
      })

      const data = await res.json()

      if (data.success) {
        setAnalysisResult(data.analysis)
        if (onAnalysisComplete) {
          onAnalysisComplete()
        }
      } else {
        setError(data.error || 'Failed to analyze transcript')
      }
    } catch (err) {
      console.error('Analysis error:', err)
      setError('An unexpected error occurred')
    } finally {
      setAnalyzing(false)
    }
  }

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-600 bg-green-50'
      case 'concerned':
        return 'text-yellow-600 bg-yellow-50'
      case 'urgent':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Brain className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">AI Transcript Analyzer</h3>
          <p className="text-sm text-gray-600">
            Upload or paste your session transcript to automatically extract insights and action items
          </p>
        </div>
      </div>

      {!analysisResult ? (
        <>
          {/* Upload/Paste Area */}
          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFileUpload(e.target.files[0])
                  }
                }}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={analyzing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors disabled:opacity-50"
              >
                <Upload className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Upload transcript (.txt)
                </span>
              </button>
            </div>

            <div className="text-center text-sm text-gray-500">or</div>

            {/* Text Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paste transcript text
              </label>
              <textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste your session transcript here... (minimum 50 characters)"
                disabled={analyzing}
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none disabled:bg-gray-50"
              />
              <div className="mt-2 text-sm text-gray-500">
                {transcriptText.length} characters
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Analyze Button */}
            <button
              onClick={analyzeTranscript}
              disabled={analyzing || !transcriptText.trim()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Analyze Transcript
                </>
              )}
            </button>

            <div className="text-xs text-gray-500 text-center">
              This uses OpenAI GPT-4 to analyze your transcript and extract action items, topics, and insights.
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Analysis Results */}
          <div className="space-y-6">
            {/* Success Message */}
            <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Analysis Complete!</p>
                <p className="text-sm text-green-700">
                  Created {analysisResult.action_items_created} action item
                  {analysisResult.action_items_created !== 1 ? 's' : ''} and saved session insights.
                </p>
              </div>
            </div>

            {/* Summary */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Session Summary</h4>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg">
                {analysisResult.summary}
              </p>
            </div>

            {/* Sentiment */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Overall Sentiment</h4>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(analysisResult.sentiment)}`}>
                {analysisResult.sentiment.charAt(0).toUpperCase() + analysisResult.sentiment.slice(1)}
              </span>
            </div>

            {/* Topics */}
            {analysisResult.topics.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Topics Discussed</h4>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.topics.map((topic, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-teal-50 text-teal-700 text-sm font-medium rounded-full"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Goals */}
            {analysisResult.goals.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Goals Mentioned</h4>
                <ul className="space-y-2">
                  {analysisResult.goals.map((goal, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-purple-600 mt-1">•</span>
                      {goal}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Analyze Another Button */}
            <button
              onClick={() => {
                setAnalysisResult(null)
                setTranscriptText('')
                setError(null)
              }}
              className="w-full px-4 py-2 border-2 border-purple-600 text-purple-600 font-medium rounded-lg hover:bg-purple-50 transition-colors"
            >
              Analyze Another Transcript
            </button>
          </div>
        </>
      )}
    </div>
  )
}
