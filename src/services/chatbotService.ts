/**
 * FallTrack Chatbot Frontend Service
 * 
 * Handles communication between React UI and Supabase Edge Function.
 * Provides fallback to local deterministic calculation engine when running
 * in local development or if the edge function is temporarily unreachable.
 * Never calls Gemini directly from the browser.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { parseUserIntent, executeBusinessQuery, formatDateStr } from '../utils/chatbotEngine';
import { dbService } from './dbService';

export interface ChatResponse {
  answer: string;
  facts?: Record<string, any>;
  source: 'ai' | 'deterministic';
}

export const chatbotService = {
  /**
   * Sends a user question to the backend.
   * Uses Supabase Edge Function when configured, with a safe deterministic fallback.
   */
  async askQuestion(message: string): Promise<ChatResponse> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new Error('Message cannot be empty.');
    }
    if (trimmed.length > 500) {
      throw new Error('Message is too long (maximum 500 characters).');
    }

    const clientDate = formatDateStr(new Date());

    // 1. Try invoking the Supabase Edge Function
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.functions.invoke('falltrack-chat', {
          body: {
            message: trimmed,
            clientDate
          }
        });

        if (!error && data && data.answer) {
          return {
            answer: data.answer,
            facts: data.facts,
            source: data.source || 'ai'
          };
        }

        // If error or function not deployed yet, proceed to deterministic fallback
        console.warn('Edge Function returned error or is not deployed, using local fallback:', error);
      } catch (invokeErr) {
        console.warn('Edge Function invocation failed, falling back to local deterministic calculation:', invokeErr);
      }
    }

    // 2. Safe Local Deterministic Fallback
    // Never calls Gemini directly from the browser; calculates exact business metrics safely.
    try {
      const intent = parseUserIntent(trimmed, clientDate);
      
      const [entries, rates, colors, periods] = await Promise.all([
        dbService.getProductionEntries(),
        dbService.getRates(),
        dbService.getColors(),
        dbService.getIncomePeriods()
      ]);

      const result = executeBusinessQuery(intent, {
        entries,
        rates,
        colors,
        periods
      });

      return {
        answer: result.formattedText,
        facts: result.facts,
        source: 'deterministic'
      };
    } catch (fallbackErr: any) {
      console.error('Local chatbot engine error:', fallbackErr);
      throw new Error('Could not calculate records. ' + (fallbackErr.message || 'Please check your data.'));
    }
  }
};
