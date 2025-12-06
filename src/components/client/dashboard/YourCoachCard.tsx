'use client'

import Link from 'next/link'
import {
  User,
  MessageSquare,
  Calendar,
  Mail,
  Phone,
  Award
} from 'lucide-react'

interface Coach {
  id: string
  name: string
  email?: string
  phone?: string
  title?: string
  bio?: string
  avatarUrl?: string
  specialties?: string[]
}

interface YourCoachCardProps {
  coach: Coach
  onMessageCoach?: () => void
  onRequestSession?: () => void
}

export function YourCoachCard({ coach, onMessageCoach, onRequestSession }: YourCoachCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-br from-brand-orange-500 to-cyan-600 px-6 py-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
            {coach.avatarUrl ? (
              <img src={coach.avatarUrl} alt={coach.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-white" />
            )}
          </div>
          <div>
            <p className="text-brand-orange-100 text-sm">Your Coach</p>
            <h3 className="text-xl font-bold">{coach.name}</h3>
            <p className="text-brand-orange-100 text-sm">{coach.title || 'Business Coach'}</p>
          </div>
        </div>
      </div>

      {/* Bio */}
      {coach.bio && (
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-sm text-gray-600 line-clamp-3">{coach.bio}</p>
        </div>
      )}

      {/* Specialties */}
      {coach.specialties && coach.specialties.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4 text-brand-orange" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Specialties</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {coach.specialties.map((specialty, index) => (
              <span
                key={index}
                className="px-2.5 py-1 bg-brand-orange-50 text-brand-orange-700 text-xs font-medium rounded-full"
              >
                {specialty}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Contact Info */}
      <div className="px-6 py-4 border-b border-gray-100 space-y-2">
        {coach.email && (
          <a
            href={`mailto:${coach.email}`}
            className="flex items-center gap-3 text-sm text-gray-600 hover:text-brand-orange transition-colors"
          >
            <Mail className="w-4 h-4 text-gray-400" />
            {coach.email}
          </a>
        )}
        {coach.phone && (
          <a
            href={`tel:${coach.phone}`}
            className="flex items-center gap-3 text-sm text-gray-600 hover:text-brand-orange transition-colors"
          >
            <Phone className="w-4 h-4 text-gray-400" />
            {coach.phone}
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2">
        <button
          onClick={onMessageCoach}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-orange text-white rounded-lg hover:bg-brand-orange-600 transition-colors font-medium"
        >
          <MessageSquare className="w-4 h-4" />
          Message Coach
        </button>
        <button
          onClick={onRequestSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-brand-orange-200 text-brand-orange-700 rounded-lg hover:bg-brand-orange-50 transition-colors font-medium"
        >
          <Calendar className="w-4 h-4" />
          Request Session
        </button>
      </div>
    </div>
  )
}

export default YourCoachCard
