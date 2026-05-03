# Platform Branding Update Plan

## Brand Color System

| Color | Hex | Usage |
|-------|-----|-------|
| **Navy** | #172238 | Base color - headers, dark backgrounds, primary text |
| **Orange** | #F5821F | Accent - progress bars, active states, buttons, info boxes, titles |
| **Teal** | #0d9488 | SUCCESS ONLY - checkmarks, save confirmations, completion states |

## Update Rules

### Change FROM Teal TO Orange:
- Progress bars and indicators
- Step navigation (active/completed steps)
- Primary action buttons
- Loading spinners
- Tab active states
- Info box icons
- Toggle switches (active state)
- Focus rings on inputs
- Badge accents (non-success)

### Keep Teal (Success States Only):
- Checkmarks for completed items
- "Saved" / "Auto-saved" indicators
- 100% completion badges
- "Solved" / "Resolved" status
- Validated data indicators
- Success toast notifications

### Change FROM Teal TO Navy:
- Secondary backgrounds (teal-50 → navy-50)
- Muted text colors
- Borders on info boxes

---

## Implementation Phases

### PHASE 1: Core User Journey (High Impact)
Priority pages users see most frequently.

| # | Page | Path | Complexity |
|---|------|------|------------|
| 1 | Dashboard | `/dashboard/page.tsx` | High |
| 2 | Goals/Strategic Planning | `/goals/page.tsx` | High |
| 3 | Weekly Reviews | `/reviews/weekly/page.tsx` | High |
| 4 | Quarterly Review | `/quarterly-review/page.tsx` | High |
| 5 | Business Dashboard | `/business-dashboard/page.tsx` | Medium |
| 6 | One Page Plan | `/one-page-plan/page.tsx` | Medium |

### PHASE 2: Assessment & Analysis
| # | Page | Path | Complexity |
|---|------|------|------------|
| 7 | Assessment Landing | `/assessment/page.tsx` | Medium |
| 8 | Assessment Form | `/assessment/[id]/page.tsx` | Medium |
| 9 | Assessment Results | `/assessment/results/page.tsx` | High |
| 10 | Assessment History | `/assessment/history/page.tsx` | Low |
| 11 | Assessment Manage | `/assessment/manage/page.tsx` | Low |
| 12 | SWOT Analysis | `/swot/page.tsx` | Medium |
| 13 | SWOT Detail | `/swot/[id]/page.tsx` | Medium |
| 14 | SWOT Compare | `/swot/compare/page.tsx` | Low |
| 15 | SWOT History | `/swot/history/page.tsx` | Low |

### PHASE 3: Financial & Forecasting
| # | Page | Path | Complexity |
|---|------|------|------------|
| 16 | Financial Forecast | `/finances/forecast/page.tsx` | High |
| 17 | Financials | `/financials/page.tsx` | Medium |
| 18 | Goals Forecast | `/goals/forecast/page.tsx` | Medium |

### PHASE 4: Strategic Planning Tools
| # | Page | Path | Complexity |
|---|------|------|------------|
| 19 | Business Roadmap | `/business-roadmap/page.tsx` | Medium |
| 20 | Vision Mission | `/vision-mission/page.tsx` | Medium |
| 21 | Goals Vision | `/goals/vision/page.tsx` | Low |
| 22 | Goals Create | `/goals/create/page.tsx` | Medium |
| 23 | Stop Doing | `/stop-doing/page.tsx` | Medium |
| 24 | Ideas Journal | `/ideas/page.tsx` | Medium |
| 25 | Ideas Evaluate | `/ideas/[id]/evaluate/page.tsx` | Medium |
| 26 | KPI Selection | `/kpi-selection/page.tsx` | Medium |

### PHASE 5: Reviews & Accountability
| # | Page | Path | Complexity |
|---|------|------|------------|
| 27 | Quarterly Reviews List | `/reviews/quarterly/page.tsx` | Medium |
| 28 | Quarterly Workshop | `/quarterly-review/workshop/page.tsx` | High |
| 29 | Quarterly Summary | `/quarterly-review/summary/[id]/page.tsx` | Medium |
| 30 | Sessions List | `/sessions/page.tsx` | Medium |
| 31 | Session Detail | `/sessions/[id]/page.tsx` | Medium |

### PHASE 6: Team & Collaboration
| # | Page | Path | Complexity |
|---|------|------|------------|
| 32 | Team Accountability | `/team/accountability/page.tsx` | Medium |
| 33 | Hiring Roadmap | `/team/hiring-roadmap/page.tsx` | Medium |
| 34 | Messages | `/messages/page.tsx` | Low |
| 35 | Todo | `/todo/page.tsx` | Medium |
| 36 | Open Loops | `/open-loops/page.tsx` | Medium |
| 37 | Issues List | `/issues-list/page.tsx` | Medium |

### PHASE 7: Coach Portal
| # | Page | Path | Complexity |
|---|------|------|------------|
| 38 | Coach Dashboard | `/coach/dashboard/page.tsx` | Medium |
| 39 | Coach Clients | `/coach/clients/page.tsx` | Medium |
| 40 | Coach Client Detail | `/coach/clients/[id]/page.tsx` | Medium |
| 41 | Coach Client Goals | `/coach/clients/[id]/goals/page.tsx` | Medium |
| 42 | Coach Client Forecast | `/coach/clients/[id]/forecast/page.tsx` | Medium |
| 43 | Coach Sessions | `/coach/sessions/page.tsx` | Medium |
| 44 | Coach Session Detail | `/coach/sessions/[id]/page.tsx` | Medium |
| 45 | Coach Schedule | `/coach/schedule/page.tsx` | Medium |
| 46 | Coach Messages | `/coach/messages/page.tsx` | Medium |
| 47 | Coach Reports | `/coach/reports/page.tsx` | Medium |
| 48 | Coach Analytics | `/coach/analytics/page.tsx` | Medium |
| 49 | Coach Actions | `/coach/actions/page.tsx` | Medium |
| 50 | Coach Settings | `/coach/settings/page.tsx` | Medium |
| 51 | Coach Login | `/coach/login/page.tsx` | Low |
| 52 | Coach Dashboard Alt | `/coach-dashboard/page.tsx` | Medium |

### PHASE 8: Client Portal
| # | Page | Path | Complexity |
|---|------|------|------------|
| 53 | Client Chat | `/client/chat/page.tsx` | Medium |
| 54 | Client Actions | `/client/actions/page.tsx` | Medium |
| 55 | Client Analytics | `/client/analytics/page.tsx` | Medium |
| 56 | Client Documents | `/client/documents/page.tsx` | Low |
| 57 | Client Sessions | `/client/sessions/page.tsx` | Medium |

### PHASE 9: Admin Portal
| # | Page | Path | Complexity |
|---|------|------|------------|
| 58 | Admin Dashboard | `/admin/page.tsx` | Medium |
| 59 | Admin Login | `/admin/login/page.tsx` | Low |
| 60 | Admin Clients | `/admin/clients/page.tsx` | Medium |
| 61 | Admin Clients New | `/admin/clients/new/page.tsx` | Medium |
| 62 | Admin Clients Success | `/admin/clients/success/page.tsx` | Low (mostly success states) |
| 63 | Admin Coaches | `/admin/coaches/page.tsx` | Medium |
| 64 | Admin Users | `/admin/users/page.tsx` | Medium |

### PHASE 10: Auth & Onboarding
| # | Page | Path | Complexity |
|---|------|------|------------|
| 65 | Login | `/auth/login/page.tsx` | Low |
| 66 | Reset Password | `/auth/reset-password/page.tsx` | Low |
| 67 | Update Password | `/auth/update-password/page.tsx` | Low |
| 68 | Wizard | `/wizard/page.tsx` | Medium |

### PHASE 11: Integrations & Settings
| # | Page | Path | Complexity |
|---|------|------|------------|
| 69 | Integrations | `/integrations/page.tsx` | Low |
| 70 | Dashboard Integrations | `/dashboard/integrations/page.tsx` | Low |
| 71 | Xero Connect | `/xero-connect/page.tsx` | Low |
| 72 | Xero Integration | `/dashboard/integrations/xero/page.tsx` | Low |
| 73 | Settings | `/settings/page.tsx` | Low |
| 74 | Settings Account | `/settings/account/page.tsx` | Low |
| 75 | Settings Team | `/settings/team/page.tsx` | Low |

### PHASE 12: Misc & Static Pages
| # | Page | Path | Complexity |
|---|------|------|------------|
| 76 | Home/Landing | `/page.tsx` | Medium |
| 77 | Help | `/help/page.tsx` | Low |
| 78 | Privacy | `/privacy/page.tsx` | Low |
| 79 | Terms | `/terms/page.tsx` | Low |
| 80 | Not Found | `/not-found.tsx` | Low |
| 81 | Marketing Value Prop | `/marketing/value-prop/page.tsx` | Low |

### PHASE 13: Shared Components
These affect multiple pages - update once, impact everywhere.

| # | Component | Path | Impact |
|---|-----------|------|--------|
| 82 | Navigation | `/components/Navigation.tsx` | Global |
| 83 | DashboardWrapper | `/components/DashboardWrapper.tsx` | High |
| 84 | Client Layout | `/components/layouts/ClientLayout.tsx` | High |
| 85 | Coach Layout | `/components/layouts/CoachLayoutNew.tsx` | High |
| 86 | Sidebar Layout | `/components/layout/sidebar-layout.tsx` | High |
| 87 | Button | `/components/ui/button.tsx` | Global |
| 88 | Toast | `/components/shared/Toast.tsx` | Global |

### PHASE 14: Dashboard Components
| # | Component | Path |
|---|-----------|------|
| 89 | GoalsCard | `/dashboard/components/GoalsCard.tsx` |
| 90 | RocksCard | `/dashboard/components/RocksCard.tsx` |
| 91 | WeeklyPrioritiesCard | `/dashboard/components/WeeklyPrioritiesCard.tsx` |
| 92 | SessionActionsCard | `/dashboard/components/SessionActionsCard.tsx` |
| 93 | ProgressRing | `/dashboard/components/ProgressRing.tsx` |
| 94 | ChatDrawer | `/dashboard/components/ChatDrawer.tsx` |
| 95 | QuickActionsGrid | `/dashboard/components/QuickActionsGrid.tsx` |
| 96 | SuggestedActions | `/dashboard/components/SuggestedActions.tsx` |

### PHASE 15: Coach Components
| # | Component | Path |
|---|-----------|------|
| 97+ | All coach components | `/components/coach/*.tsx` |

### PHASE 16: Forecast Components
| # | Component | Path |
|---|-----------|------|
| 98+ | All forecast components | `/finances/forecast/components/*.tsx` |

### PHASE 17: Quarterly Review Components
| # | Component | Path |
|---|-----------|------|
| 99+ | All step components | `/quarterly-review/components/steps/*.tsx` |

---

## Progress Tracking

### Completed
- [x] Business Profile (`/business-profile/page.tsx`)

### In Progress
- [ ] Phase 1: Core User Journey

### Not Started
- [ ] Phase 2-17

---

## Estimated Effort
- **Phase 1-2**: ~2 hours (high impact, complex pages)
- **Phase 3-6**: ~2 hours (medium complexity)
- **Phase 7-12**: ~2 hours (portal pages)
- **Phase 13-17**: ~2 hours (shared components)

**Total**: ~8 hours of focused work

---

## Quick Reference: Common Replacements

```
// Progress bars
bg-brand-teal → bg-brand-orange
bg-brand-teal-500 → bg-brand-orange-500

// Active states
bg-brand-teal-50 → bg-brand-orange-50
bg-brand-teal-100 → bg-brand-orange-100
border-brand-teal → border-brand-orange
border-brand-teal-200 → border-brand-orange-200

// Text
text-brand-teal → text-brand-orange
text-brand-teal-600 → text-brand-orange-600
text-brand-teal-700 → text-brand-orange-700

// Focus states
focus:ring-brand-teal → focus:ring-brand-orange
focus:border-brand-teal → focus:border-brand-orange

// Info boxes (teal gradient → navy solid)
from-brand-teal-50 to-brand-navy-50 → bg-brand-navy-50
border-brand-teal-200 → border-brand-navy-200
bg-brand-teal-100 → bg-brand-orange-100 (for icon bg)
text-brand-teal → text-brand-orange (for icon)

// KEEP AS TEAL (success states)
// Checkmarks, save confirmations, 100% completion, solved status
```
