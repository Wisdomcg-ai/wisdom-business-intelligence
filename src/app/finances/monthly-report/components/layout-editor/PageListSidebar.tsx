'use client'

import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import type { LayoutPage } from '../../types/pdf-layout'
import PageThumbnail from './PageThumbnail'

interface PageListSidebarProps {
  pages: LayoutPage[]
  selectedPageId: string | null
  onSelectPage: (pageId: string) => void
  onAddPage: (orientation: 'portrait' | 'landscape') => void
  onDeletePage: (pageId: string) => void
  onToggleOrientation: (pageId: string) => void
}

export default function PageListSidebar({
  pages,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onToggleOrientation,
}: PageListSidebarProps) {
  return (
    <div className="w-[180px] bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pages</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext
          items={pages.map(p => `page-${p.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {pages.map((page, idx) => (
            <PageThumbnail
              key={page.id}
              page={page}
              index={idx}
              isSelected={page.id === selectedPageId}
              onSelect={() => onSelectPage(page.id)}
              onDelete={() => onDeletePage(page.id)}
              onToggleOrientation={() => onToggleOrientation(page.id)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add page buttons */}
      <div className="p-2 border-t border-gray-200 space-y-1">
        <button
          onClick={() => onAddPage('portrait')}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Portrait Page
        </button>
        <button
          onClick={() => onAddPage('landscape')}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Landscape Page
        </button>
      </div>
    </div>
  )
}
