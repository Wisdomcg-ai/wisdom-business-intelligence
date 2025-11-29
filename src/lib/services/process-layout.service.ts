// ============================================================================
// PROCESS LAYOUT ENGINE - DEAD SIMPLE
// Position activities by order_num in each swimlane
// ============================================================================

import { ProcessStep, ProcessFlow, ProcessPhase } from '@/types/process-diagram';

export interface ActivityLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  swimlane: string;
  department: string;
  order: number;
}

export interface ConnectorLayout {
  id: string;
  fromId: string;
  toId: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  path: string;
  label?: {
    x: number;
    y: number;
    text: string;
    color: string;
  };
}

export interface SwimlaneLayout {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  activities: ActivityLayout[];
}

export interface DiagramLayout {
  activities: Map<string, ActivityLayout>;
  connectors: ConnectorLayout[];
  swimlanes: SwimlaneLayout[];
  totalWidth: number;
  totalHeight: number;
}

export class ProcessLayoutEngine {
  
  calculate(steps: ProcessStep[], flows: ProcessFlow[], phases: ProcessPhase[]): DiagramLayout {
    // Get swimlanes
    const swimlanes = Array.from(new Set(steps.map(s => s.swimlane_name))).sort();
    
    // Position activities simply: by swimlane + order_num
    const activities = this.positionByOrder(steps, swimlanes);
    
    // Create connectors
    const connectors = this.createConnectors(flows, activities);
    
    // Create swimlane rectangles
    const swimlaneRects = this.createSwimlaneRects(swimlanes, steps, activities);
    
    // Calculate size
    const { totalWidth, totalHeight } = this.getSize(activities);
    
    return { activities, connectors, swimlanes: swimlaneRects, totalWidth, totalHeight };
  }

  private positionByOrder(steps: ProcessStep[], swimlanes: string[]): Map<string, ActivityLayout> {
    const activities = new Map<string, ActivityLayout>();
    
    const ACTIVITY_WIDTH = 160;
    const ACTIVITY_HEIGHT = 60;
    const COLUMN_WIDTH = 200;
    const ROW_HEIGHT = 100;
    
    let swimlaneY = 150;
    
    swimlanes.forEach(swimlane => {
      // Get all activities in this swimlane, sorted by order_num
      const stepsInSwimline = steps
        .filter(s => s.swimlane_name === swimlane)
        .sort((a, b) => a.order_num - b.order_num);
      
      // Position each activity vertically in this swimlane
      stepsInSwimline.forEach((step, index) => {
        const x = 200 + index * COLUMN_WIDTH;
        const y = swimlaneY;
        
        activities.set(step.id, {
          id: step.id,
          x,
          y,
          width: ACTIVITY_WIDTH,
          height: ACTIVITY_HEIGHT,
          swimlane: step.swimlane_name,
          department: step.department,
          order: step.order_num,
        });
      });
      
      swimlaneY += ROW_HEIGHT + 80;
    });
    
    return activities;
  }

  private createConnectors(flows: ProcessFlow[], activities: Map<string, ActivityLayout>): ConnectorLayout[] {
    return flows
      .map(flow => {
        const from = activities.get(flow.from_step_id);
        const to = activities.get(flow.to_step_id);
        if (!from || !to) return null;
        
        const fromPos = { x: from.x + from.width / 2, y: from.y + from.height };
        const toPos = { x: to.x + to.width / 2, y: to.y };
        const midY = (fromPos.y + toPos.y) / 2;
        const path = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x} ${midY}, ${toPos.x} ${midY}, ${toPos.x} ${toPos.y}`;
        
        let color = '#6B7280';
        if (flow.condition_color === 'green') color = '#10B981';
        if (flow.condition_color === 'red') color = '#EF4444';
        if (flow.condition_color === 'orange') color = '#FB923C';
        
        return {
          id: flow.id,
          fromId: flow.from_step_id,
          toId: flow.to_step_id,
          fromPos,
          toPos,
          path,
          label: flow.condition_label ? {
            x: (fromPos.x + toPos.x) / 2 + 15,
            y: (fromPos.y + toPos.y) / 2,
            text: flow.condition_label,
            color,
          } : undefined,
        };
      })
      .filter(Boolean) as ConnectorLayout[];
  }

  private createSwimlaneRects(swimlanes: string[], steps: ProcessStep[], activities: Map<string, ActivityLayout>): SwimlaneLayout[] {
    const colors: Record<string, string> = {
      'Director/Admin': '#6B7280',
      Sales: '#FCD34D',
      Operations: '#06B6D4',
      Finance: '#FB923C',
      'Project Management': '#8B5CF6',
    };
    
    return swimlanes.map(swimlane => {
      const swimlaneActivities = Array.from(activities.values()).filter(a => a.swimlane === swimlane);
      if (swimlaneActivities.length === 0) return null;
      
      const minY = Math.min(...swimlaneActivities.map(a => a.y));
      const maxY = Math.max(...swimlaneActivities.map(a => a.y + a.height));
      
      return {
        name: swimlane,
        x: 0,
        y: minY - 20,
        width: 0,
        height: maxY - minY + 40,
        color: colors[swimlane] || '#78716F',
        activities: swimlaneActivities,
      };
    }).filter(Boolean) as SwimlaneLayout[];
  }

  private getSize(activities: Map<string, ActivityLayout>): { totalWidth: number; totalHeight: number } {
    let maxX = 0, maxY = 0;
    activities.forEach(a => {
      if (a.x + a.width > maxX) maxX = a.x + a.width;
      if (a.y + a.height > maxY) maxY = a.y + a.height;
    });
    return { totalWidth: maxX + 200, totalHeight: maxY + 200 };
  }
}

export const processLayoutEngine = new ProcessLayoutEngine();