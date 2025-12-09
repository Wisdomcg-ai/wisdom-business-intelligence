'use client'

import { PresenceUser } from '@/hooks/usePresence'
import { cn } from '@/lib/utils'

interface PresenceIndicatorProps {
  users: PresenceUser[]
  maxDisplay?: number
  showNames?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Shows avatars of users currently viewing a page
 */
export function PresenceIndicator({
  users,
  maxDisplay = 5,
  showNames = false,
  size = 'md',
  className,
}: PresenceIndicatorProps) {
  if (users.length === 0) return null

  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = users.length - maxDisplay

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const getBackgroundColor = (name: string) => {
    // Generate consistent color based on name
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-teal-500',
      'bg-indigo-500',
      'bg-red-500',
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="flex -space-x-2">
        {displayUsers.map((user) => (
          <div
            key={user.user_id}
            className={cn(
              'relative rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center',
              sizeClasses[size],
              user.is_editing
                ? 'ring-2 ring-yellow-400 ring-offset-1'
                : '',
              user.user_avatar ? '' : getBackgroundColor(user.user_name)
            )}
            title={`${user.user_name}${user.is_editing ? ' (editing)' : ''}`}
          >
            {user.user_avatar ? (
              <img
                src={user.user_avatar}
                alt={user.user_name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white font-medium">
                {getInitials(user.user_name)}
              </span>
            )}
            {/* Online indicator */}
            <span
              className={cn(
                'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800',
                user.is_editing ? 'bg-yellow-400' : 'bg-green-500'
              )}
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div
            className={cn(
              'rounded-full border-2 border-white dark:border-gray-800 bg-gray-400 flex items-center justify-center',
              sizeClasses[size]
            )}
          >
            <span className="text-white font-medium">+{remainingCount}</span>
          </div>
        )}
      </div>
      {showNames && displayUsers.length === 1 && (
        <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
          {displayUsers[0].user_name}
          {displayUsers[0].is_editing && (
            <span className="text-yellow-600 ml-1">(editing)</span>
          )}
        </span>
      )}
      {showNames && displayUsers.length > 1 && (
        <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">
          {displayUsers.length} viewing
        </span>
      )}
    </div>
  )
}

interface EditingBannerProps {
  editor: PresenceUser
  onContinueAnyway?: () => void
  className?: string
}

/**
 * Warning banner shown when someone else is editing
 */
export function EditingBanner({
  editor,
  onContinueAnyway,
  className,
}: EditingBannerProps) {
  return (
    <div
      className={cn(
        'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-center justify-between',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <svg
            className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            {editor.user_name} is currently editing this section
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
            Consider waiting for them to finish to avoid conflicts
          </p>
        </div>
      </div>
      {onContinueAnyway && (
        <button
          onClick={onContinueAnyway}
          className="text-sm font-medium text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 underline"
        >
          Edit anyway
        </button>
      )}
    </div>
  )
}

interface ViewingIndicatorProps {
  users: PresenceUser[]
  className?: string
}

/**
 * Small indicator showing who else is viewing (for header/nav)
 */
export function ViewingIndicator({ users, className }: ViewingIndicatorProps) {
  if (users.length === 0) return null

  const viewerNames = users.map((u) => u.user_name).join(', ')
  const editingUsers = users.filter((u) => u.is_editing)

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400',
        className
      )}
      title={viewerNames}
    >
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span>
        {users.length === 1
          ? `${users[0].user_name} viewing`
          : `${users.length} people viewing`}
        {editingUsers.length > 0 && (
          <span className="text-yellow-600 dark:text-yellow-400 ml-1">
            ({editingUsers.length} editing)
          </span>
        )}
      </span>
    </div>
  )
}
