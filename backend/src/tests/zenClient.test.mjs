import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOpenAIModel, resolveOpenRouterModel } from '../mcp/zenClient.js';

test('resolveOpenRouterModel maps agent aliases to MiniMax M2.7', () => {
  assert.equal(resolveOpenRouterModel('gpt-4o-mini'), 'minimax/minimax-m2.7');
  assert.equal(resolveOpenRouterModel('gpt-4o'), 'minimax/minimax-m2.7');
  assert.equal(resolveOpenRouterModel('claude-3-5-sonnet-20241022'), 'minimax/minimax-m2.7');
  assert.equal(resolveOpenRouterModel('gemini-2.5-flash'), 'minimax/minimax-m2.7');
});

test('resolveOpenAIModel maps Claude aliases to OpenAI models', () => {
  assert.equal(resolveOpenAIModel('claude-sonnet-4-20250514'), 'gpt-4o');
  assert.equal(resolveOpenAIModel('claude-3-haiku-20240307'), 'gpt-4o-mini');
  assert.equal(resolveOpenAIModel('gemini-2.5-flash'), 'gpt-4o-mini');
});
