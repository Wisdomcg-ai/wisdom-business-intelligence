// ========================================
// File: lib/ai/openaiParser.ts
// OpenAI/ChatGPT Integration for parsing process steps
// ========================================

import OpenAI from 'openai';
import { ParsedInput } from '@/lib/types/wizard';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

/**
 * Parse user input using ChatGPT to extract:
 * - Action/step name
 * - Owner (who does it)
 * - Department
 * - Decision branches (if applicable)
 * - Duration estimates
 */
export async function parseUserInput(
  userInput: string,
  context: {
    currentPhase: string;
    stepNumber: number;
    previousSteps: string[];
    lastQuestion: string;
  }
): Promise<ParsedInput> {
  try {
    // Build context for better parsing
    const contextString =
      context.previousSteps.length > 0
        ? `\nPrevious steps: ${context.previousSteps.join(' → ')}`
        : '';

    const systemPrompt = `You are an expert business process analyst helping to unpack business workflows.
You analyze user responses about business processes and extract structured information.

When parsing user input, extract:
1. action: The main activity/step (e.g., "Customer calls in", "Qualify lead")
2. owner: Who does this (person or role, e.g., "Sales person", "Sarah", "Finance team")
3. department: Department (e.g., "Sales", "Operations", "Finance")
4. isBranch: Whether this indicates a decision point (yes/no split)
5. branchOutcomes: If a branch, what are the outcomes [{outcome: string, description: string}]
6. duration: Estimated time (e.g., "30 mins", "2 hours", "3 days")
7. isProcessComplete: Whether user is saying the process is done
8. confidence: How confident you are (0-100)

Be smart about inferring from context. For example:
- "We send a quote" likely means Sales department
- "Sarah schedules it" means owner is "Sarah" and likely Operations
- "If they accept or reject" means there's a decision branch

Respond ONLY with valid JSON, no markdown.`;

    const userMessage = `Current phase: ${context.currentPhase}
Step number: ${context.stepNumber}
Last question: ${context.lastQuestion}${contextString}

User said: "${userInput}"

Extract the structured information. If information is unclear, set to null and note low confidence.`;

    // Call ChatGPT
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      temperature: 0.3, // Lower temperature for consistency
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No response from ChatGPT');
    }

    // Parse the JSON response
    const parsed = JSON.parse(content);

    // Validate and normalize the response
    const result: ParsedInput = {
      action: parsed.action || null,
      owner: parsed.owner || null,
      department: parsed.department || null,
      duration: parsed.duration || null,
      isBranch: parsed.isBranch || false,
      branchOutcomes: parsed.branchOutcomes || null,
      isProcessComplete: parsed.isProcessComplete || false,
      confidence: Math.min(100, Math.max(0, parsed.confidence || 0)),
      rationale: parsed.rationale || 'Parsed by ChatGPT',
    };

    return result;
  } catch (error) {
    console.error('Error parsing user input with ChatGPT:', error);

    // Return a low-confidence parse on error
    return {
      action: null,
      owner: null,
      department: null,
      duration: null,
      isBranch: false,
      branchOutcomes: null,
      isProcessComplete: false,
      confidence: 0,
      rationale: `Error parsing: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Generate the next question based on conversation state
 * Uses ChatGPT to generate contextual questions
 */
export async function generateNextQuestion(context: {
  phase: string;
  stepNumber: number;
  lastAction?: string;
  conversationHistory: string[];
}): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a business coach helping clients unpack their business processes through conversation.
Generate ONE clear, concise question to guide them.
Be natural and conversational, not robotic.
Questions should be open-ended but focused.
Respond with ONLY the question, no additional text.`,
        },
        {
          role: 'user',
          content: `Phase: ${context.phase}
Step: ${context.stepNumber}
${context.lastAction ? `Last step described: "${context.lastAction}"` : ''}

Generate the next question to ask the user about their process.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    return (
      response.choices[0]?.message?.content ||
      'What happens next in your process?'
    );
  } catch (error) {
    console.error('Error generating question:', error);
    return 'What happens next?';
  }
}

/**
 * Detect if the user input contains any decision/branch language
 * Uses ChatGPT for intelligent pattern matching
 */
export async function detectBranches(userInput: string): Promise<{
  hasBranch: boolean;
  branches?: Array<{ outcome: string; description: string }>;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `Analyze if the user's input describes a decision point (where process could branch).
Look for language like: "if", "could", "might", "either", "or", "depending", "sometimes", "when"

If a branch is detected, extract the outcomes.
Respond ONLY with JSON: { hasBranch: boolean, branches?: [{outcome: string, description: string}] }`,
        },
        {
          role: 'user',
          content: `User said: "${userInput}"

Does this describe a decision/branch in their process?`,
        },
      ],
      temperature: 0.2,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { hasBranch: false };

    return JSON.parse(content);
  } catch (error) {
    console.error('Error detecting branches:', error);
    return { hasBranch: false };
  }
}

/**
 * Get coaching suggestions based on the process so far
 * Uses ChatGPT to identify bottlenecks, automation opportunities, etc.
 */
export async function getCoachingSuggestions(context: {
  steps: Array<{ action: string; owner: string; department: string }>;
  decisions: number;
  swimlanes: string[];
}): Promise<
  Array<{
    type: 'bottleneck' | 'risk' | 'automation' | 'handoff' | 'documentation';
    priority: 'high' | 'medium' | 'low';
    title: string;
    text: string;
    recommendation: string;
  }>
> {
  try {
    const stepsText = context.steps
      .map((s) => `${s.action} (${s.owner} in ${s.department})`)
      .join(' → ');

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a business operations coach analyzing process diagrams.
Identify coaching opportunities: bottlenecks, risks, automation opportunities, handoffs, documentation gaps.

Respond ONLY with JSON array. Each item: { type, priority, title, text, recommendation }
Types: bottleneck | risk | automation | handoff | documentation
Priorities: high | medium | low
Limit to top 3-5 suggestions.`,
        },
        {
          role: 'user',
          content: `Process analyzed:
Steps: ${stepsText}
Departments involved: ${context.swimlanes.join(', ')}
Decision points: ${context.decisions}

What coaching suggestions would help improve this process?`,
        },
      ],
      temperature: 0.6,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    return JSON.parse(content);
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return [];
  }
}

/**
 * Validate that ChatGPT API is configured
 */
export function validateOpenAISetup(): {
  isValid: boolean;
  message: string;
} {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    return {
      isValid: false,
      message:
        'Missing NEXT_PUBLIC_OPENAI_API_KEY in environment variables',
    };
  }

  if (!apiKey.startsWith('sk-')) {
    return {
      isValid: false,
      message: 'Invalid OpenAI API key format',
    };
  }

  return {
    isValid: true,
    message: 'OpenAI configured correctly',
  };
}