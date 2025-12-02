// Stub file for openaiParser - placeholder until AI integration is implemented

import { ProcessStep, ProcessDecision, ParsedInput } from '@/types/wizard';

export async function parseUserInput(input: string, context: unknown): Promise<ParsedInput> {
  // Placeholder implementation
  return {
    action: null,
    owner: null,
    department: null,
    duration: null,
    isBranch: false,
    branchOutcomes: null,
    isProcessComplete: false,
    confidence: 0,
    rationale: 'Placeholder - AI integration pending'
  };
}

interface QuestionContext {
  phase?: string;
  stepNumber?: number;
  lastAction?: string | null;
  conversationHistory?: string[];
}

export async function generateNextQuestion(
  context: QuestionContext
): Promise<string> {
  // Placeholder implementation
  return 'What happens next in this process?';
}

export async function detectBranches(input: string): Promise<{
  hasBranch: boolean;
  outcomes?: string[];
}> {
  // Placeholder implementation
  return { hasBranch: false };
}
