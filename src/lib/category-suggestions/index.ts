// Complete Category Suggestion System
// File: lib/category-suggestions/index.ts

import { createClient } from '@/lib/supabase/client';
import { InitiativeCategory } from '@/types/strategic-initiatives';

// ==================== DATABASE SCHEMA ====================
// Add these tables to your Supabase database:

/*
-- Category suggestions tracking table
CREATE TABLE category_suggestions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  initiative_text text NOT NULL,
  suggested_category text,
  actual_category text NOT NULL,
  suggestion_accepted boolean NOT NULL,
  confidence_score decimal(3,2), -- 0.00 to 1.00
  suggestion_method text NOT NULL, -- 'keyword', 'pattern', 'ml', 'personal'
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Global category patterns learned from all users
CREATE TABLE category_patterns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_text text NOT NULL,
  category text NOT NULL,
  confidence_score decimal(3,2) NOT NULL,
  usage_count integer DEFAULT 1,
  success_rate decimal(3,2) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(pattern_text, category)
);

-- Personal user patterns
CREATE TABLE user_category_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_text text NOT NULL,
  category text NOT NULL,
  confidence_score decimal(3,2) NOT NULL,
  usage_count integer DEFAULT 1,
  success_rate decimal(3,2) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, pattern_text, category)
);

-- Indexes for performance
CREATE INDEX idx_category_suggestions_user_id ON category_suggestions(user_id);
CREATE INDEX idx_category_suggestions_text ON category_suggestions USING gin(to_tsvector('english', initiative_text));
CREATE INDEX idx_category_suggestions_created_at ON category_suggestions(created_at);
CREATE INDEX idx_category_patterns_text ON category_patterns USING gin(to_tsvector('english', pattern_text));
CREATE INDEX idx_user_preferences_user_id ON user_category_preferences(user_id);
CREATE INDEX idx_user_preferences_text ON user_category_preferences USING gin(to_tsvector('english', pattern_text));
*/

// ==================== TYPES ====================
interface SuggestionResult {
  category: InitiativeCategory;
  confidence: number;
  method: 'keyword' | 'pattern' | 'ml' | 'personal';
  reasoning?: string;
}

interface CategoryPattern {
  pattern: string;
  category: InitiativeCategory;
  confidence: number;
  usage_count: number;
  success_rate: number;
}

interface UserPreference {
  pattern: string;
  category: InitiativeCategory;
  confidence: number;
  usage_count: number;
  success_rate: number;
}

// ==================== PHASE 1: KEYWORD MAPPING ====================
const KEYWORD_MAPPINGS: Record<string, { category: InitiativeCategory; confidence: number }[]> = {
  // ATTRACT - Marketing and lead generation
  'marketing': [{ category: 'attract', confidence: 0.9 }],
  'advertising': [{ category: 'attract', confidence: 0.9 }],
  'social media': [{ category: 'attract', confidence: 0.85 }],
  'content': [{ category: 'attract', confidence: 0.8 }],
  'seo': [{ category: 'attract', confidence: 0.9 }],
  'website': [{ category: 'attract', confidence: 0.7 }, { category: 'systems', confidence: 0.3 }],
  'brand': [{ category: 'attract', confidence: 0.8 }],
  'leads': [{ category: 'attract', confidence: 0.9 }],
  'referral': [{ category: 'attract', confidence: 0.8 }],
  'partnerships': [{ category: 'attract', confidence: 0.7 }, { category: 'strategy', confidence: 0.3 }],

  // CONVERT - Sales and conversion
  'sales': [{ category: 'convert', confidence: 0.9 }],
  'crm': [{ category: 'convert', confidence: 0.7 }, { category: 'systems', confidence: 0.3 }],
  'pipeline': [{ category: 'convert', confidence: 0.85 }],
  'proposal': [{ category: 'convert', confidence: 0.8 }],
  'pricing': [{ category: 'convert', confidence: 0.8 }, { category: 'profit', confidence: 0.2 }],
  'quote': [{ category: 'convert', confidence: 0.8 }],
  'follow up': [{ category: 'convert', confidence: 0.8 }],
  'close': [{ category: 'convert', confidence: 0.9 }],
  'negotiation': [{ category: 'convert', confidence: 0.8 }],

  // DELIVER - Service/product delivery
  'delivery': [{ category: 'deliver', confidence: 0.9 }],
  'fulfillment': [{ category: 'deliver', confidence: 0.9 }],
  'onboarding': [{ category: 'deliver', confidence: 0.8 }],
  'quality': [{ category: 'deliver', confidence: 0.8 }],
  'service': [{ category: 'deliver', confidence: 0.7 }],
  'operations': [{ category: 'deliver', confidence: 0.8 }, { category: 'systems', confidence: 0.2 }],
  'project management': [{ category: 'deliver', confidence: 0.7 }, { category: 'systems', confidence: 0.3 }],

  // DELIGHT - Customer satisfaction
  'customer service': [{ category: 'delight', confidence: 0.9 }],
  'support': [{ category: 'delight', confidence: 0.8 }],
  'satisfaction': [{ category: 'delight', confidence: 0.9 }],
  'retention': [{ category: 'delight', confidence: 0.8 }],
  'feedback': [{ category: 'delight', confidence: 0.8 }],
  'testimonial': [{ category: 'delight', confidence: 0.8 }],
  'loyalty': [{ category: 'delight', confidence: 0.9 }],
  'experience': [{ category: 'delight', confidence: 0.7 }],

  // SYSTEMS - Process and automation
  'system': [{ category: 'systems', confidence: 0.8 }],
  'process': [{ category: 'systems', confidence: 0.8 }],
  'automation': [{ category: 'systems', confidence: 0.9 }],
  'software': [{ category: 'systems', confidence: 0.8 }],
  'technology': [{ category: 'systems', confidence: 0.8 }],
  'workflow': [{ category: 'systems', confidence: 0.8 }],
  'integration': [{ category: 'systems', confidence: 0.9 }],
  'database': [{ category: 'systems', confidence: 0.9 }],
  'reporting': [{ category: 'systems', confidence: 0.8 }],
  'dashboard': [{ category: 'systems', confidence: 0.8 }],

  // PEOPLE - Team and culture
  'hire': [{ category: 'people', confidence: 0.9 }],
  'recruit': [{ category: 'people', confidence: 0.9 }],
  'staff': [{ category: 'people', confidence: 0.8 }],
  'employee': [{ category: 'people', confidence: 0.9 }],
  'team': [{ category: 'people', confidence: 0.8 }],
  'training': [{ category: 'people', confidence: 0.8 }],
  'culture': [{ category: 'people', confidence: 0.9 }],
  'management': [{ category: 'people', confidence: 0.7 }],
  'performance': [{ category: 'people', confidence: 0.7 }],
  'handbook': [{ category: 'people', confidence: 0.8 }],

  // PROFIT - Financial management
  'budget': [{ category: 'profit', confidence: 0.9 }],
  'cost': [{ category: 'profit', confidence: 0.8 }],
  'expense': [{ category: 'profit', confidence: 0.8 }],
  'margin': [{ category: 'profit', confidence: 0.9 }],
  'financial': [{ category: 'profit', confidence: 0.8 }],
  'accounting': [{ category: 'profit', confidence: 0.8 }],
  'revenue': [{ category: 'profit', confidence: 0.7 }, { category: 'strategy', confidence: 0.3 }],
  'cash flow': [{ category: 'profit', confidence: 0.9 }],

  // STRATEGY - Planning and direction
  'strategy': [{ category: 'strategy', confidence: 0.9 }],
  'planning': [{ category: 'strategy', confidence: 0.8 }],
  'vision': [{ category: 'strategy', confidence: 0.8 }],
  'goals': [{ category: 'strategy', confidence: 0.7 }],
  'market research': [{ category: 'strategy', confidence: 0.8 }],
  'competitive': [{ category: 'strategy', confidence: 0.8 }],
  'expansion': [{ category: 'strategy', confidence: 0.8 }],
  'analysis': [{ category: 'strategy', confidence: 0.7 }]
};

// ==================== PHASE 2: PATTERN ANALYSIS ====================
class PatternAnalyzer {
  private static instance: PatternAnalyzer;
  private supabase = createClient();
  private patterns: Map<string, CategoryPattern[]> = new Map();
  private lastUpdate = 0;
  private UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  static getInstance(): PatternAnalyzer {
    if (!PatternAnalyzer.instance) {
      PatternAnalyzer.instance = new PatternAnalyzer();
    }
    return PatternAnalyzer.instance;
  }

  async loadPatterns(): Promise<void> {
    const now = Date.now();
    if (now - this.lastUpdate < this.UPDATE_INTERVAL) return;

    try {
      const { data: patterns } = await this.supabase
        .from('category_patterns')
        .select('*')
        .gte('confidence_score', 0.6);

      if (patterns) {
        this.patterns.clear();
        patterns.forEach(pattern => {
          const key = pattern.pattern_text.toLowerCase();
          if (!this.patterns.has(key)) {
            this.patterns.set(key, []);
          }
          this.patterns.get(key)!.push({
            pattern: pattern.pattern_text,
            category: pattern.category as InitiativeCategory,
            confidence: pattern.confidence_score,
            usage_count: pattern.usage_count,
            success_rate: pattern.success_rate
          });
        });
      }
      this.lastUpdate = now;
    } catch (error) {
      console.error('Error loading patterns:', error);
    }
  }

  analyzeText(text: string): SuggestionResult[] {
    const suggestions: SuggestionResult[] = [];
    const words = text.toLowerCase().split(/\s+/);
    const phrases = this.extractPhrases(text.toLowerCase());

    // Check exact phrase matches first
    phrases.forEach(phrase => {
      const patterns = this.patterns.get(phrase);
      if (patterns) {
        patterns.forEach(pattern => {
          suggestions.push({
            category: pattern.category,
            confidence: pattern.confidence * pattern.success_rate,
            method: 'pattern',
            reasoning: `Learned from phrase: "${phrase}"`
          });
        });
      }
    });

    return suggestions;
  }

  private extractPhrases(text: string): string[] {
    const words = text.split(/\s+/);
    const phrases: string[] = [];
    
    // Extract 1-3 word phrases
    for (let i = 0; i < words.length; i++) {
      phrases.push(words[i]);
      if (i < words.length - 1) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
      if (i < words.length - 2) {
        phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
    }
    
    return phrases;
  }
}

// ==================== PHASE 3: MACHINE LEARNING ====================
class MLCategorizer {
  private static instance: MLCategorizer;
  private supabase = createClient();
  private model: Map<string, Map<InitiativeCategory, number>> = new Map();
  private totalSamples = 0;
  private categoryTotals: Map<InitiativeCategory, number> = new Map();

  static getInstance(): MLCategorizer {
    if (!MLCategorizer.instance) {
      MLCategorizer.instance = new MLCategorizer();
    }
    return MLCategorizer.instance;
  }

  async trainModel(): Promise<void> {
    try {
      const { data: suggestions } = await this.supabase
        .from('category_suggestions')
        .select('initiative_text, actual_category')
        .limit(1000);

      if (!suggestions) return;

      this.model.clear();
      this.categoryTotals.clear();
      this.totalSamples = suggestions.length;

      // Build word frequency model
      suggestions.forEach(suggestion => {
        const category = suggestion.actual_category as InitiativeCategory;
        const words = this.tokenize(suggestion.initiative_text);
        
        // Count category totals
        this.categoryTotals.set(category, (this.categoryTotals.get(category) || 0) + 1);
        
        // Count word frequencies per category
        words.forEach(word => {
          if (!this.model.has(word)) {
            this.model.set(word, new Map());
          }
          const wordMap = this.model.get(word)!;
          wordMap.set(category, (wordMap.get(category) || 0) + 1);
        });
      });
    } catch (error) {
      console.error('Error training ML model:', error);
    }
  }

  predict(text: string): SuggestionResult[] {
    if (this.totalSamples === 0) return [];

    const words = this.tokenize(text);
    const scores: Map<InitiativeCategory, number> = new Map();

    // Calculate Naive Bayes probabilities
    const categories: InitiativeCategory[] = ['attract', 'convert', 'deliver', 'delight', 'systems', 'people', 'profit', 'strategy'];
    
    categories.forEach(category => {
      let score = Math.log((this.categoryTotals.get(category) || 1) / this.totalSamples);
      
      words.forEach(word => {
        const wordMap = this.model.get(word);
        if (wordMap) {
          const wordCountInCategory = wordMap.get(category) || 0;
          const totalWordsInCategory = this.categoryTotals.get(category) || 1;
          score += Math.log((wordCountInCategory + 1) / (totalWordsInCategory + this.model.size));
        }
      });
      
      scores.set(category, score);
    });

    // Convert to probabilities and return top suggestions
    const maxScore = Math.max(...Array.from(scores.values()));
    const suggestions: SuggestionResult[] = [];

    scores.forEach((score, category) => {
      const probability = Math.exp(score - maxScore);
      if (probability > 0.1) { // Only include if > 10% confidence
        suggestions.push({
          category,
          confidence: Math.min(probability, 0.95), // Cap at 95%
          method: 'ml',
          reasoning: `ML prediction based on ${this.totalSamples} samples`
        });
      }
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'].includes(word));
  }
}

// ==================== PHASE 4: PERSONALIZATION ====================
class PersonalPreferences {
  private static instance: PersonalPreferences;
  private supabase = createClient();
  private userPreferences: Map<string, UserPreference[]> = new Map();

  static getInstance(): PersonalPreferences {
    if (!PersonalPreferences.instance) {
      PersonalPreferences.instance = new PersonalPreferences();
    }
    return PersonalPreferences.instance;
  }

  async loadUserPreferences(userId: string): Promise<void> {
    try {
      const { data: preferences } = await this.supabase
        .from('user_category_preferences')
        .select('*')
        .eq('user_id', userId)
        .gte('confidence_score', 0.5);

      if (preferences) {
        const userPrefs: UserPreference[] = preferences.map(pref => ({
          pattern: pref.pattern_text,
          category: pref.category as InitiativeCategory,
          confidence: pref.confidence_score,
          usage_count: pref.usage_count,
          success_rate: pref.success_rate
        }));
        this.userPreferences.set(userId, userPrefs);
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  }

  getSuggestions(userId: string, text: string): SuggestionResult[] {
    const preferences = this.userPreferences.get(userId) || [];
    const suggestions: SuggestionResult[] = [];
    const words = text.toLowerCase().split(/\s+/);
    
    preferences.forEach(pref => {
      const patternWords = pref.pattern.split(/\s+/);
      let matches = 0;
      patternWords.forEach(patternWord => {
        if (words.some(word => word.includes(patternWord) || patternWord.includes(word))) {
          matches++;
        }
      });
      
      if (matches > 0) {
        const confidence = (matches / patternWords.length) * pref.confidence * pref.success_rate;
        if (confidence > 0.3) {
          suggestions.push({
            category: pref.category,
            confidence,
            method: 'personal',
            reasoning: `Based on your past choices with "${pref.pattern}"`
          });
        }
      }
    });

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}

// ==================== MAIN SUGGESTION ENGINE ====================
export class CategorySuggestionEngine {
  private static instance: CategorySuggestionEngine;
  private supabase = createClient();
  private patternAnalyzer = PatternAnalyzer.getInstance();
  private mlCategorizer = MLCategorizer.getInstance();
  private personalPreferences = PersonalPreferences.getInstance();

  static getInstance(): CategorySuggestionEngine {
    if (!CategorySuggestionEngine.instance) {
      CategorySuggestionEngine.instance = new CategorySuggestionEngine();
    }
    return CategorySuggestionEngine.instance;
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.patternAnalyzer.loadPatterns(),
      this.mlCategorizer.trainModel()
    ]);
  }

  async getSuggestions(text: string, userId?: string): Promise<SuggestionResult[]> {
    if (!text.trim()) return [];

    const allSuggestions: SuggestionResult[] = [];

    // Phase 1: Keyword matching
    const keywordSuggestions = this.getKeywordSuggestions(text);
    allSuggestions.push(...keywordSuggestions);

    // Phase 2: Pattern analysis
    const patternSuggestions = this.patternAnalyzer.analyzeText(text);
    allSuggestions.push(...patternSuggestions);

    // Phase 3: ML predictions
    const mlSuggestions = this.mlCategorizer.predict(text);
    allSuggestions.push(...mlSuggestions);

    // Phase 4: Personal preferences
    if (userId) {
      await this.personalPreferences.loadUserPreferences(userId);
      const personalSuggestions = this.personalPreferences.getSuggestions(userId, text);
      allSuggestions.push(...personalSuggestions);
    }

    // Combine and rank suggestions
    return this.rankSuggestions(allSuggestions);
  }

  private getKeywordSuggestions(text: string): SuggestionResult[] {
    const suggestions: SuggestionResult[] = [];
    const lowerText = text.toLowerCase();
    
    Object.entries(KEYWORD_MAPPINGS).forEach(([keyword, mappings]) => {
      if (lowerText.includes(keyword)) {
        mappings.forEach(mapping => {
          suggestions.push({
            category: mapping.category,
            confidence: mapping.confidence,
            method: 'keyword',
            reasoning: `Matched keyword: "${keyword}"`
          });
        });
      }
    });

    return suggestions;
  }

  private rankSuggestions(suggestions: SuggestionResult[]): SuggestionResult[] {
    // Group by category and combine confidences
    const categoryMap: Map<InitiativeCategory, SuggestionResult> = new Map();
    
    suggestions.forEach(suggestion => {
      if (categoryMap.has(suggestion.category)) {
        const existing = categoryMap.get(suggestion.category)!;
        // Weight personal preferences higher, then ML, then patterns, then keywords
        const methodWeights = { personal: 1.2, ml: 1.1, pattern: 1.0, keyword: 0.9 };
        const weightedConfidence = suggestion.confidence * methodWeights[suggestion.method];
        const existingWeighted = existing.confidence * methodWeights[existing.method];
        
        if (weightedConfidence > existingWeighted) {
          categoryMap.set(suggestion.category, suggestion);
        }
      } else {
        categoryMap.set(suggestion.category, suggestion);
      }
    });

    return Array.from(categoryMap.values())
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // Return top 3 suggestions
  }

  async trackSuggestion(
    userId: string,
    initiativeText: string,
    suggestedCategory: InitiativeCategory | null,
    actualCategory: InitiativeCategory,
    confidence: number,
    method: string
  ): Promise<void> {
    try {
      // Track the suggestion
      await this.supabase.from('category_suggestions').insert({
        user_id: userId,
        initiative_text: initiativeText,
        suggested_category: suggestedCategory,
        actual_category: actualCategory,
        suggestion_accepted: suggestedCategory === actualCategory,
        confidence_score: confidence,
        suggestion_method: method
      });

      // Update global patterns
      if (suggestedCategory !== actualCategory) {
        await this.updatePatterns(initiativeText, actualCategory);
      }

      // Update user preferences
      await this.updateUserPreferences(userId, initiativeText, actualCategory);
    } catch (error) {
      console.error('Error tracking suggestion:', error);
    }
  }

  private async updatePatterns(text: string, category: InitiativeCategory): Promise<void> {
    const phrases = this.extractPhrases(text.toLowerCase());
    
    for (const phrase of phrases) {
      await this.supabase.rpc('upsert_category_pattern', {
        pattern_text: phrase,
        category: category
      });
    }
  }

  private async updateUserPreferences(userId: string, text: string, category: InitiativeCategory): Promise<void> {
    const phrases = this.extractPhrases(text.toLowerCase());
    
    for (const phrase of phrases) {
      await this.supabase.rpc('upsert_user_preference', {
        user_id: userId,
        pattern_text: phrase,
        category: category
      });
    }
  }

  private extractPhrases(text: string): string[] {
    const words = text.split(/\s+/).filter(word => word.length > 2);
    const phrases: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      phrases.push(words[i]);
      if (i < words.length - 1) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }
      if (i < words.length - 2) {
        phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
    }
    
    return phrases.filter(phrase => phrase.length > 3);
  }
}

// Export singleton instance
export const suggestionEngine = CategorySuggestionEngine.getInstance();