import axios, { AxiosResponse } from 'axios';

/**
 * Simple wrapper for OpenAI API or similar AI providers
 * @param model The AI model to use (e.g., 'gpt-4', 'gpt-3.5-turbo')
 * @param prompt The text prompt to send to the AI model
 * @param apiKey The API key for authentication
 * @returns Promise<string> The generated text response from the AI model
 * @throws Error with clear message if API call fails
 */
export async function callAPI(model: string, prompt: string, apiKey: string): Promise<string> {
  try {
    // For demonstration purposes, we'll simulate an API call
    // In a real implementation, this would make an HTTP request to OpenAI or another provider
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Validate inputs
    if (!model || !prompt || !apiKey) {
      throw new Error('Model, prompt, and API key are required');
    }

    // Simulate API response
    const mockResponse = `This is a simulated response from ${model} for the prompt: "${prompt.substring(0, 50)}..."`;
    
    return mockResponse;
    
    // Real implementation would look something like this:
    /*
    const response: AxiosResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.choices[0].message.content;
    */

  } catch (error: any) {
    // Handle different types of errors and provide clear messages
    if (error.response) {
      // Server responded with error status
      throw new Error(`API request failed with status ${error.response.status}: ${error.response.data.error?.message || 'Unknown error'}`);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('API request failed: No response received from server. Please check your internet connection.');
    } else {
      // Something else happened
      throw new Error(`API request failed: ${error.message}`);
    }
  }
}

/**
 * Calculate estimated tokens for a given text
 * @param text The text to calculate tokens for
 * @returns Estimated number of tokens
 */
export function estimateTokens(text: string): number {
  // Simple estimation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Calculate estimated cost based on model and tokens
 * @param model The AI model used
 * @param tokens Number of tokens used
 * @returns Estimated cost in USD
 */
export function calculateCost(model: string, tokens: number): number {
  // Mock pricing - in real implementation, these would be actual model prices
  const modelPrices: Record<string, number> = {
    'gpt-4': 0.03,      // $0.03 per 1000 tokens
    'gpt-3.5-turbo': 0.002, // $0.002 per 1000 tokens
    'gpt-4-turbo': 0.01,    // $0.01 per 1000 tokens
  };

  const pricePerToken = (modelPrices[model] || 0.01) / 1000;
  return tokens * pricePerToken;
}