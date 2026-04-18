// AI Agent Service - OpenRouter-powered agents (GLM + Perplexity)
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const getKey = () => process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

const openRouterRequest = async (model, messages) => {
  const key = getKey();
  if (!key) throw new Error('Missing EXPO_PUBLIC_OPENROUTER_API_KEY');

  const res = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mvoe.org',
      'X-Title': 'MVOE Food Bank App',
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
};

export const callGLMAgent = (conversationMessages, systemPrompt = '') => {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    ...conversationMessages,
  ];
  return openRouterRequest('thudm/glm-4-plus', messages);
};

export const searchWithPerplexity = (query) =>
  openRouterRequest('perplexity/llama-3.1-sonar-large-128k-online', [
    { role: 'user', content: query },
  ]);

// Legacy backend stubs — kept so other imports don't break
export const startMealPlannerAgent = async () => ({ success: false, error: 'Use callGLMAgent instead' });
export const getAgentJobStatus = async () => ({});
export const getActiveAgentJobs = async () => ({ success: true, jobs: [] });
export const testUSDAConnection = async () => ({});
