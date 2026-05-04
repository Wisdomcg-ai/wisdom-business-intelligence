# UI Fixes Implementation Plan

**Created:** 2024-12-08
**Status:** ✅ COMPLETE

## User Decisions
- Goals tabs color: **ORANGE** (not teal)
- Stage indicator color: **NAVY** (informational, not action-oriented)

---

## Implementation Checklist

### Quick Fixes

- [x] **#5 - Assessment results labels cut off**
  - File: `/src/app/dashboard/assessment-results/page.tsx`
  - Fix: Increased RadarChart SVG size from 440 to 500, radius from 110 to 120
  - Status: ✅ COMPLETED

- [x] **#11 - Stage indicator color consistency (NAVY)**
  - File: `/src/app/business-roadmap/page.tsx`
  - Fix: Changed "You" and "Current" badges from orange to navy
  - Status: ✅ COMPLETED

- [x] **#13 - Information symbol visibility on VMV page**
  - File: `/src/app/vision-mission/page.tsx`
  - Fix: Changed to solid orange background, white text, shadow, "?" on mobile
  - Status: ✅ COMPLETED

- [x] **#14 - Goals wizard tabs - change teal to ORANGE**
  - File: `/src/app/goals/page.tsx`
  - Fix: Changed 5 instances of teal to orange for completed steps
  - Status: ✅ COMPLETED

- [x] **#15 - SWOT Insights formatting**
  - File: `/src/app/goals/page.tsx`
  - Fix: Added proper rounded bullet dots, color-coded per category, improved spacing
  - Status: ✅ COMPLETED

---

### Medium Fixes

- [x] **#3 - Business Profile financial auto-calculate margins**
  - File: `/src/app/business-profile/page.tsx`
  - Fix: Already implemented - bidirectional calculation exists (lines 1825-1957)
  - Status: ✅ ALREADY COMPLETE

- [x] **#6 - Assessment results - explain each engine**
  - File: `/src/app/dashboard/assessment-results/page.tsx`
  - Fix: Already implemented - longDescription displayed for each engine (lines 888-891)
  - Status: ✅ ALREADY COMPLETE

- [x] **#7 - Remove Next Steps, return to dashboard**
  - File: `/src/app/assessment/[id]/page.tsx`
  - Fix: Removed generic "Next Steps" section, replaced CTAs with "Return to Dashboard" button
  - Status: ✅ COMPLETED

- [x] **#8 - Verify retake assessment navigation**
  - File: `/src/app/assessment/page.tsx`
  - Fix: Already correct - retake (`?new=true`) bypasses redirect and goes to results after completion
  - Status: ✅ VERIFIED WORKING

- [x] **#10 - Roadmap explanation UI/UX improvement**
  - File: `/src/app/business-roadmap/page.tsx`
  - Fix: Added "About This Stage" and "Success Criteria" sections with descriptions
  - Status: ✅ COMPLETED

- [x] **#16 - Section headings consistency (financial/core/KPIs)**
  - File: `/src/app/kpi-selection/page.tsx`
  - Fix: Updated headings from gray to navy for consistency with other pages
  - Status: ✅ COMPLETED

---

### Large Features (Defer)

- [ ] **#4 - Team & Organisation - add members to platform**
  - New feature requiring invite system, permissions, UI
  - Status: DEFERRED

---

## Progress Log

### Session 1 - 2024-12-08

- ✅ #14 - Changed Goals wizard tabs from teal to orange (5 instances)
- ✅ #11 - Changed stage indicator badges from orange to navy
- ✅ #5 - Fixed RadarChart sizing to prevent label cutoff (440→500px)
- ✅ #13 - Made VMV info buttons more visible with solid orange, shadow, "?" on mobile
- ✅ #15 - Fixed SWOT list formatting with proper bullet dots and spacing

**Quick Fixes: 5/5 COMPLETE**

- ✅ #3 - Verified auto-calculate margins already implemented
- ✅ #6 - Verified engine explanations already implemented
- ✅ #7 - Removed Next Steps section, added "Return to Dashboard" button
- ✅ #8 - Verified retake navigation works correctly
- ✅ #10 - Added stage explanation UI with description/focus/success criteria
- ✅ #16 - Updated KPI page headings to use navy for consistency

**Medium Fixes: 6/6 COMPLETE**

**ALL UI FIXES COMPLETE! 🎉**

