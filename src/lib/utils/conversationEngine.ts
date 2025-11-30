// ========================================
// File: lib/utils/conversationEngine.ts
// Conversation Engine - State Machine for Wizard Flow
// ========================================

import {
  parseUserInput,
  generateNextQuestion,
  detectBranches,
} from '@/lib/ai/openaiParser';
import {
  ProcessStep,
  ProcessDecision,
  ConversationTurn,
  ParsedInput,
} from '@/lib/types/wizard';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main conversation engine
 * Handles the flow of conversation for unpacking processes
 */
export class ConversationEngine {
  processId: string;
  stepNumber: number = 1;
  conversationHistory: ConversationTurn[] = [];
  previousSteps: string[] = [];
  phase: 'setup' | 'unpacking' | 'enrichment' | 'review' = 'setup';

  constructor(processId: string) {
    this.processId = processId;
  }

  /**
   * Process user input and determine what to do next
   */
  async processInput(userInput: string, lastQuestion: string): Promise<{
    acknowledgment: string;
    nextQuestion: string;
    parsedData: ParsedInput;
    shouldAdvance: boolean;
    newStep?: ProcessStep;
    newDecision?: ProcessDecision;
    turnNumber: number;
  }> {
    try {
      const turnNumber = this.conversationHistory.length + 1;

      // 1. Add user input to history
      const userTurn: ConversationTurn = {
        id: uuidv4(),
        process_id: this.processId,
        turn_number: turnNumber,
        role: 'user',
        message: userInput,
        parsed_data: null,
        confidence: null,
        created_at: new Date().toISOString(),
      };

      this.conversationHistory.push(userTurn);

      // 2. Parse the input using ChatGPT
      const parsed = await parseUserInput(userInput, {
        currentPhase: this.phase,
        stepNumber: this.stepNumber,
        previousSteps: this.previousSteps,
        lastQuestion,
      });

      // Update user turn with parsed data
      userTurn.parsed_data = parsed;
      userTurn.confidence = parsed.confidence;

      // 3. Check for process completion
      if (parsed.isProcessComplete && this.stepNumber > 1) {
        this.phase = 'enrichment';
        const systemTurn = await this.createSystemTurn(
          turnNumber + 1,
          "Perfect! I've captured your entire process. Ready to review and enhance?"
        );
        this.conversationHistory.push(systemTurn);

        return {
          acknowledgment: 'Got it! Your process is complete.',
          nextQuestion:
            'Would you like to add details (parallel work, payments, documents)?',
          parsedData: parsed,
          shouldAdvance: true,
          turnNumber,
        };
      }

      // 4. Process based on what was parsed
      let acknowledgment = '';
      let nextQuestion = '';
      let shouldAdvance = false;
      let newStep: ProcessStep | undefined;
      let newDecision: ProcessDecision | undefined;

      if (!parsed.action) {
        // Couldn't parse - ask for clarification
        acknowledgment = `I didn't quite catch that. Can you tell me more?`;
        nextQuestion = lastQuestion; // Repeat last question
      } else {
        // Good data - create acknowledgment
        if (parsed.isBranch && parsed.branchOutcomes) {
          acknowledgment = `I see a decision point: ${parsed.action}. Two paths: ${parsed.branchOutcomes
            .map((b) => b.outcome)
            .join(' or ')}.`;

          // Create decision object
          newDecision = {
            id: uuidv4(),
            process_id: this.processId,
            after_step_id: uuidv4(), // Will be linked in store
            decision_question: `After ${parsed.action}, ${parsed.branchOutcomes[0]?.outcome || 'outcome'}?`,
            decision_type: 'yes_no',
            branches: parsed.branchOutcomes,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        } else if (parsed.isBranch) {
          acknowledgment = `There's a branch here. Let me ask about the outcomes...`;
          nextQuestion = `What are the possible outcomes after "${parsed.action}"?`;
        } else {
          // Regular step
          const owner = parsed.owner || 'Someone';
          const dept = parsed.department || 'TBD';
          acknowledgment = `Step ${this.stepNumber}: "${parsed.action}" by ${owner} from ${dept}. ✓`;

          newStep = {
            id: uuidv4(),
            process_id: this.processId,
            order_num: this.stepNumber,
            action: parsed.action,
            description: null,
            primary_owner: parsed.owner,
            primary_owner_type: parsed.owner ? 'person' : null,
            department: parsed.department,
            swimlane: parsed.department,
            estimated_duration: parsed.duration,
            duration_unit: parsed.duration
              ? this.extractDurationUnit(parsed.duration)
              : null,
            duration_value: parsed.duration
              ? this.extractDurationValue(parsed.duration)
              : null,
            outputs: [],
            systems: [],
            payments: [],
            pain_points: [],
            automation_opportunity: null,
            single_point_of_failure: false,
            is_end_step: false,
            has_branch: parsed.isBranch || false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          this.previousSteps.push(parsed.action);
          this.stepNumber++;
          shouldAdvance = true;
        }

        // Generate next question if not already set
        if (!nextQuestion) {
          nextQuestion = await generateNextQuestion({
            phase: this.phase,
            stepNumber: this.stepNumber,
            lastAction: parsed.action,
            conversationHistory: this.conversationHistory.map((t) => t.message),
          });
        }
      }

      // 5. Add system response to history
      const systemTurn = await this.createSystemTurn(turnNumber + 1, nextQuestion);
      this.conversationHistory.push(systemTurn);

      return {
        acknowledgment,
        nextQuestion,
        parsedData: parsed,
        shouldAdvance,
        newStep,
        newDecision,
        turnNumber,
      };
    } catch (error) {
      console.error('Error in conversation engine:', error);
      return {
        acknowledgment: 'I had trouble processing that. Could you rephrase?',
        nextQuestion: 'What happens in your process?',
        parsedData: {
          action: null,
          owner: null,
          department: null,
          duration: null,
          isBranch: false,
          branchOutcomes: null,
          isProcessComplete: false,
          confidence: 0,
          rationale: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
        },
        shouldAdvance: false,
        turnNumber: this.conversationHistory.length,
      };
    }
  }

  /**
   * Create system response turn
   */
  private async createSystemTurn(
    turnNumber: number,
    message: string
  ): Promise<ConversationTurn> {
    return {
      id: uuidv4(),
      process_id: this.processId,
      turn_number: turnNumber,
      role: 'system',
      message,
      parsed_data: null,
      confidence: null,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Extract duration value from string like "30 mins", "2 hours"
   */
  private extractDurationValue(duration: string): number | null {
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract duration unit from string like "30 mins", "2 hours"
   */
  private extractDurationUnit(
    duration: string
  ): 'minutes' | 'hours' | 'days' | null {
    if (duration.toLowerCase().includes('min')) return 'minutes';
    if (duration.toLowerCase().includes('hour')) return 'hours';
    if (duration.toLowerCase().includes('day')) return 'days';
    return null;
  }

  /**
   * Get the appropriate opening question
   */
  static getOpeningQuestion(phase: string): string {
    if (phase === 'setup') {
      return 'What process are we mapping? (e.g., Sales, Delivery, Support)';
    }
    if (phase === 'unpacking') {
      return "What's the very first thing that happens in this process?";
    }
    return 'Ready to add more details?';
  }

  /**
   * Get current state summary
   */
  getSummary(): {
    processId: string;
    phase: string;
    stepCount: number;
    turnCount: number;
    previousSteps: string[];
  } {
    return {
      processId: this.processId,
      phase: this.phase,
      stepCount: this.stepNumber - 1,
      turnCount: this.conversationHistory.length,
      previousSteps: this.previousSteps,
    };
  }
}