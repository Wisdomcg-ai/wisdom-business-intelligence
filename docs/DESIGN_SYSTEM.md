# Business Coaching Platform - Design System

## Typography Standards

### Font Sizes (Tailwind Classes)

#### Page Layout
- **Page Title (h1)**: `text-3xl` (30px)
  - Example: "Vision, Mission & Values"
  - Use: Main page heading

#### Section Headings
- **Section Heading (h2)**: `text-2xl` (24px)
  - Example: "Vision (Your 5-10 Year Picture)", "Mission (Your Why)"
  - Use: Major section headings within a page

- **Modal/Dialog Heading (h3)**: `text-2xl` (24px)
  - Example: "Add Your Own Value", "Core Values Library"
  - Use: Modal and dialog titles

#### Body Text & Descriptions
- **Section Subtitle/Description**: `text-base` (16px)
  - Example: "Paint a picture of where you're headed"
  - Use: Descriptive text under section headings

- **Help Text & Instructions**: `text-base` (16px)
  - Example: Jim Collins' BHAG explanation, Simon Sinek's "Start With Why"
  - Use: All coaching content, examples, frameworks, instructional text
  - **Why**: Business owners (often 40-60+) need comfortable reading size for absorbing strategic guidance

- **Form Labels**: `text-sm` (14px)
  - Example: "Value Name", "We Statement"
  - Use: Labels for input fields, textareas, selects

#### Hints & Meta Information
- **Hints & Counters**: `text-sm` (14px)
  - Example: "45 words (aim for 30-50)", "3 values defined"
  - Use: Word counts, validation messages, status indicators
  - Previously: `text-xs` (12px) - **Updated for readability**

- **Helper Text**: `text-sm` (14px)
  - Example: "Describe HOW you live this value day-to-day"
  - Use: Small helper text below form fields
  - Previously: `text-xs` (12px) - **Updated for readability**

### Font Weights
- **Headings**: `font-bold` (700) or `font-semibold` (600)
- **Body Text**: `font-normal` (400)
- **Emphasis/Labels**: `font-medium` (500)

---

## Color Palette

### Text Colors
- **Primary Text**: `text-gray-900` - Main content
- **Secondary Text**: `text-gray-700` - Body text, examples
- **Tertiary Text**: `text-gray-600` - Subtitles, descriptions
- **Muted Text**: `text-gray-500` - Hints, metadata

### Semantic Colors
- **Success**: `text-green-600` - Completion indicators
- **Warning**: `text-amber-600` - Validation warnings
- **Error**: `text-red-600` - Error states
- **Info**: `text-blue-600` - Information, links

### Background Colors
- **Page Background**: `bg-gray-50` - Main page background
- **Card/Container**: `bg-white` - Content cards with `shadow-sm`
- **Help Sections**: `bg-gray-50` - Help text containers with `border-gray-200`
- **Highlight Boxes**: `bg-blue-50` with `border-blue-200` - Important instructions

---

## Spacing

### Container Padding
- **Page Container**: `max-w-5xl mx-auto px-4`
- **Card Padding**: `p-6` (24px)
- **Section Spacing**: `space-y-6` (24px between major sections)

### Component Spacing
- **Section Header to Content**: `mb-4` (16px)
- **Help Box Margin**: `mb-4` (16px below header)
- **Input to Label**: `mb-2` (8px)

---

## Component Patterns

### Section Header Pattern
```tsx
<div className="flex items-start justify-between mb-4">
  <div className="flex items-center gap-3">
    <div className="p-2 bg-blue-100 rounded-lg">
      <Icon className="w-5 h-5 text-blue-600" />
    </div>
    <div>
      <h2 className="text-2xl font-semibold text-gray-800">Section Title</h2>
      <p className="text-base text-gray-600">Section description</p>
    </div>
  </div>
  <button className="text-gray-400 hover:text-gray-600 transition-colors">
    <Info className="w-5 h-5" />
  </button>
</div>
```

### Help/Info Box Pattern
```tsx
<div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
  <p className="text-base font-medium text-gray-800 mb-2">💡 Heading</p>
  <p className="text-base text-gray-700">
    Body text with instructions or explanations.
  </p>
</div>
```

### Form Input Pattern
```tsx
<div>
  <label className="block text-sm font-medium text-gray-700 mb-2">
    Label Name
  </label>
  <textarea
    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    rows={4}
  />
  <span className="text-sm text-gray-500">Hint text</span>
</div>
```

---

## Accessibility

### Focus States
All interactive elements must have visible focus states:
- `focus:ring-2 focus:ring-blue-500 focus:border-transparent`

### Color Contrast
- All text must meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text)
- Current color combinations are compliant

### Icon Usage
- Info icon (ⓘ) for expandable help sections
- Consistent icon size: `w-5 h-5` for section headers
- Meaningful aria-labels on icon buttons

---

## Platform Philosophy

### Typography Rationale
**Why larger fonts for coaching content?**
- Target audience: Business owners (often 40-60 years old)
- Use case: Strategic thinking requires comfortable, extended reading
- Content type: Instructional frameworks and examples need clarity
- Previously `text-sm` (14px) was too small for extended reading
- Now `text-base` (16px) provides comfortable readability

### Design Principles
1. **Clarity over density** - Readability trumps fitting more on screen
2. **Coaching tone** - Design should feel inviting, not like a form or test
3. **Consistency** - Use these standards across all pages
4. **Accessibility first** - Design for all users, all ages

---

## Implementation Checklist

When creating a new page, ensure:
- [ ] Page title uses `text-3xl`
- [ ] Section headings use `text-2xl`
- [ ] Subtitles use `text-base`
- [ ] Help text/coaching content uses `text-base`
- [ ] Form labels use `text-sm`
- [ ] Hints/counters use `text-sm` (not `text-xs`)
- [ ] Cards use `bg-white rounded-lg shadow-sm p-6`
- [ ] Help boxes use `bg-gray-50 border-gray-200`
- [ ] All interactive elements have focus states
- [ ] Icons have aria-labels

---

## File Updated
- **Date**: 2025-11-25
- **Reference Implementation**: `/src/app/vision-mission/page.tsx`
- **Changes Made**: Updated font sizes from `text-sm` → `text-base` for coaching content, `text-xs` → `text-sm` for hints
