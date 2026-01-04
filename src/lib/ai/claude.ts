/**
 * Claude API Wrapper
 * Handles all interactions with the Anthropic Claude API
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialize the Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// Default model configuration
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022'; // Fast and cost-effective
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT = 30000; // 30 seconds

export interface ClaudeConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ClaudeResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string | null;
}

/**
 * Call Claude API with system and user prompts
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  config: ClaudeConfig = {}
): Promise<ClaudeResponse> {
  try {
    // Check if API key is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured in environment variables');
    }

    const model = config.model || DEFAULT_MODEL;
    const maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    const temperature = config.temperature ?? 1.0;

    // Log the request (for debugging)
    console.log('[Claude API] Calling with model:', model);
    console.log('[Claude API] System prompt length:', systemPrompt.length);
    console.log('[Claude API] User prompt length:', userPrompt.length);

    // Make the API call
    const message = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // Extract the response text
    const responseText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('\n');

    // Log usage statistics
    console.log('[Claude API] Response received');
    console.log('[Claude API] Input tokens:', message.usage.input_tokens);
    console.log('[Claude API] Output tokens:', message.usage.output_tokens);
    console.log('[Claude API] Stop reason:', message.stop_reason);

    return {
      content: responseText,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
      stopReason: message.stop_reason,
    };
  } catch (error) {
    // Enhanced error logging
    console.error('[Claude API] Error:', error);

    if (error instanceof Anthropic.APIError) {
      console.error('[Claude API] API Error:', {
        status: error.status,
        message: error.message,
      });

      // Provide more specific error messages
      if (error.status === 401) {
        throw new Error(
          'Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.'
        );
      } else if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.status === 500) {
        throw new Error('Anthropic API server error. Please try again later.');
      }
    }

    throw error;
  }
}

/**
 * Parse JSON response from Claude
 * Handles cases where Claude might wrap JSON in markdown code blocks
 */
export function parseClaudeJSON<T>(response: ClaudeResponse): T {
  let jsonText = response.content.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    console.error('[Claude API] Failed to parse JSON response:', jsonText);
    throw new Error(
      `Failed to parse Claude response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Call Claude and parse JSON response in one step
 */
export async function callClaudeForJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  config: ClaudeConfig = {}
): Promise<T> {
  const response = await callClaude(systemPrompt, userPrompt, config);
  return parseClaudeJSON<T>(response);
}

/**
 * Check if Claude API is available
 */
export function isClaudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Get API usage information
 */
export function getAPIInfo() {
  return {
    available: isClaudeAvailable(),
    model: DEFAULT_MODEL,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeout: DEFAULT_TIMEOUT,
  };
}
