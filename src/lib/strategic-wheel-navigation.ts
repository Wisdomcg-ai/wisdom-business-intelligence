// src/lib/strategic-wheel-navigation.ts
export const strategicWheelSections = [
  {
    id: 'vision-purpose',
    title: 'Vision & Purpose',
    description: 'Define why your business exists and where it\'s going',
    order: 1
  },
  {
    id: 'strategy-market',
    title: 'Strategy & Market',
    description: 'How you win in your market',
    order: 2
  },
  {
    id: 'people-culture',
    title: 'People & Culture',
    description: 'Your team and how you work together',
    order: 3
  },
  {
    id: 'systems-execution',
    title: 'Systems & Execution',
    description: 'How work gets done in your business',
    order: 4
  },
  {
    id: 'money-metrics',
    title: 'Money & Metrics',
    description: 'Financial goals and success tracking',
    order: 5
  },
  {
    id: 'communications-alignment',
    title: 'Communications & Alignment',
    description: 'Keep everyone moving in the same direction',
    order: 6
  }
];

export function getNextSection(currentSectionId: string): string | null {
  const currentIndex = strategicWheelSections.findIndex(s => s.id === currentSectionId);
  if (currentIndex === -1 || currentIndex === strategicWheelSections.length - 1) {
    return null;
  }
  return strategicWheelSections[currentIndex + 1].id;
}

export function getPreviousSection(currentSectionId: string): string | null {
  const currentIndex = strategicWheelSections.findIndex(s => s.id === currentSectionId);
  if (currentIndex <= 0) {
    return null;
  }
  return strategicWheelSections[currentIndex - 1].id;
}

export function getSectionProgress(completedSections: string[]): number {
  return Math.round((completedSections.length / strategicWheelSections.length) * 100);
}