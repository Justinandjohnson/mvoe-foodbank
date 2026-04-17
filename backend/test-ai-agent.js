// Test script for AI-driven PriceResearchAgent
import 'dotenv/config';
import PriceResearchAgent from './src/agents/priceResearchAgent.js';

// Mock Socket.io for testing
const mockSocketIo = {
  to: () => ({
    emit: (event, data) => {
      console.log(`[${event}]`, data.message || data.type);
    }
  })
};

async function testAIAgent() {
  console.log('🧪 Testing AI-driven PriceResearchAgent\n');

  const agent = new PriceResearchAgent(mockSocketIo);

  const testJobData = {
    userId: 'test-user',
    sessionId: 'test-session',
    items: [
      { name: 'ground beef', quantity: 'bulk' }
    ],
    budget: 100
  };

  try {
    const result = await agent.execute(testJobData);

    console.log('\n✅ Test completed successfully!\n');
    console.log('Results:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run test
testAIAgent();
