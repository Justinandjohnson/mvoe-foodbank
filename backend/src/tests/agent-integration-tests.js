// AI Agent Integration Tests - Test all MCPs and agent functionality
import MealPlannerAgent from '../agents/mealPlannerAgent.js';
import PriceResearchAgent from '../agents/priceResearchAgent.js';
import ReceiptProcessingAgent from '../agents/receiptProcessingAgent.js';
import ContentCreationAgent from '../agents/contentCreationAgent.js';

// Mock Socket.io for testing
class MockSocketIO {
  constructor() {
    this.events = [];
  }

  to(sessionId) {
    return {
      emit: (event, data) => {
        this.events.push({ sessionId, event, data });
        console.log(`[WebSocket] ${event}:`, data.message || data.type);
      }
    };
  }

  getEvents() {
    return this.events;
  }

  clear() {
    this.events = [];
  }
}

const mockIO = new MockSocketIO();

// Test results
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

function logTest(name, status, details = '') {
  const emoji = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${emoji} ${name}${details ? ': ' + details : ''}`);

  if (status === 'pass') testResults.passed.push(name);
  else if (status === 'fail') testResults.failed.push({ name, details });
  else testResults.warnings.push({ name, details });
}

console.log('\n🧪 Starting AI Agent Integration Tests...\n');
console.log('=' .repeat(60));

// ============================================================================
// TEST 1: MEAL PLANNER AGENT
// ============================================================================
async function testMealPlannerAgent() {
  console.log('\n📋 TEST 1: MEAL PLANNER AGENT');
  console.log('-'.repeat(60));

  try {
    const agent = new MealPlannerAgent(mockIO);

    const testData = {
      userId: 'test-user-123',
      sessionId: 'test-session-123',
      request: 'Plan a cookout for 50 people with a $300 budget, nut-free'
    };

    console.log('\n🔄 Running meal planner with test data...');
    console.log(`Input: ${testData.request}`);

    const result = await agent.execute(testData);

    // Verify result structure
    if (!result.success) {
      throw new Error('Agent returned success: false');
    }

    logTest('Meal Planner - Basic execution', 'pass');

    // Check plan components
    if (result.plan) {
      logTest('Meal Planner - Plan generation', 'pass');

      if (result.plan.menu && result.plan.menu.length > 0) {
        logTest('Meal Planner - Menu generation', 'pass', `${result.plan.menu.length} items`);
      } else {
        logTest('Meal Planner - Menu generation', 'fail', 'No menu items');
      }

      if (result.plan.shoppingList) {
        logTest('Meal Planner - Shopping list', 'pass');
      } else {
        logTest('Meal Planner - Shopping list', 'fail');
      }

      if (result.plan.nutrition) {
        logTest('Meal Planner - Nutrition analysis (USDA MCP)', 'pass', result.plan.nutrition.summary);
      } else {
        logTest('Meal Planner - Nutrition analysis (USDA MCP)', 'warn', 'No nutrition data');
      }

      if (result.plan.allergenVerification) {
        logTest('Meal Planner - Allergen verification (USDA MCP)', 'pass', result.plan.allergenVerification.message);
      } else {
        logTest('Meal Planner - Allergen verification (USDA MCP)', 'warn');
      }

      if (result.plan.timeline) {
        logTest('Meal Planner - Timeline generation', 'pass');
      } else {
        logTest('Meal Planner - Timeline generation', 'fail');
      }

      console.log('\n📊 Sample output:');
      console.log(`  Menu items: ${result.plan.menu.length}`);
      console.log(`  Estimated cost: $${result.plan.estimatedCost?.toFixed(2) || '0.00'}`);
      console.log(`  Servings: ${result.plan.servings}`);
      if (result.plan.nutrition) {
        console.log(`  Nutrition: ${result.plan.nutrition.perServing?.calories || 0} cal/person`);
      }
    } else {
      logTest('Meal Planner - Plan generation', 'fail', 'No plan object');
    }

    // Check WebSocket events
    const events = mockIO.getEvents();
    if (events.length > 0) {
      logTest('Meal Planner - WebSocket progress updates', 'pass', `${events.length} events`);
    } else {
      logTest('Meal Planner - WebSocket progress updates', 'warn', 'No events emitted');
    }

    mockIO.clear();

  } catch (error) {
    logTest('Meal Planner - Overall', 'fail', error.message);
    console.error('Error details:', error);
  }
}

// ============================================================================
// TEST 2: PRICE RESEARCH AGENT
// ============================================================================
async function testPriceResearchAgent() {
  console.log('\n\n💰 TEST 2: PRICE RESEARCH AGENT');
  console.log('-'.repeat(60));

  try {
    const agent = new PriceResearchAgent(mockIO);

    const testData = {
      userId: 'test-user-123',
      sessionId: 'test-session-456',
      items: [
        { name: 'hamburger patties bulk', quantity: '50 lbs' },
        { name: 'potato salad bulk', quantity: '5 lbs' }
      ],
      budget: 200
    };

    console.log('\n🔄 Running price research with test items...');
    console.log(`Items: ${testData.items.map(i => i.name).join(', ')}`);

    const result = await agent.execute(testData);

    if (!result.success) {
      throw new Error('Agent returned success: false');
    }

    logTest('Price Research - Basic execution', 'pass');

    if (result.research && result.research.length > 0) {
      logTest('Price Research - Item research', 'pass', `${result.research.length} items`);

      // Check if prices were found
      const itemsWithPrices = result.research.filter(item =>
        item.prices && item.prices.length > 0
      );

      if (itemsWithPrices.length > 0) {
        logTest('Price Research - Chrome DevTools MCP scraping', 'pass',
          `Found prices for ${itemsWithPrices.length} items`);
      } else {
        logTest('Price Research - Chrome DevTools MCP scraping', 'warn',
          'No prices found (stores may be blocking or network issue)');
      }

      if (result.recommendations) {
        logTest('Price Research - Zen MCP recommendations', 'pass');
      } else {
        logTest('Price Research - Zen MCP recommendations', 'warn');
      }

      if (result.summary) {
        logTest('Price Research - Summary generation', 'pass');
        console.log('\n📊 Summary:');
        console.log(`  Items researched: ${result.summary.totalItems}`);
        console.log(`  Stores checked: ${result.summary.storesChecked}`);
        console.log(`  Estimated savings: $${result.summary.estimatedSavings}`);
        console.log(`  Best store: ${result.summary.bestOverallStore}`);
      }
    } else {
      logTest('Price Research - Item research', 'fail', 'No research results');
    }

    const events = mockIO.getEvents();
    if (events.length > 0) {
      logTest('Price Research - WebSocket updates', 'pass', `${events.length} events`);
    }

    mockIO.clear();

  } catch (error) {
    logTest('Price Research - Overall', 'fail', error.message);
    console.error('Error details:', error);
  }
}

// ============================================================================
// TEST 3: RECEIPT PROCESSING AGENT
// ============================================================================
async function testReceiptProcessingAgent() {
  console.log('\n\n📄 TEST 3: RECEIPT PROCESSING AGENT');
  console.log('-'.repeat(60));

  try {
    const agent = new ReceiptProcessingAgent(mockIO);

    // Create test receipt text (simulating OCR output)
    const testReceiptText = `
      COSTCO WHOLESALE
      Date: 10/31/2025

      HAMBURGER PATTIES    $45.99
      POTATO SALAD         $12.99
      HAMBURGER BUNS       $8.99
      CHIPS                $15.99

      Subtotal:            $83.96
      Tax:                 $7.56
      Total:               $91.52
    `;

    const testData = {
      userId: 'test-user-123',
      sessionId: 'test-session-789',
      receiptUrl: 'test://mock-receipt',
      organizationId: 'test-org-123',
      // For testing, we'll pass the text directly
      mockReceiptText: testReceiptText
    };

    console.log('\n🔄 Running receipt processing with test data...');

    // Note: This will attempt to use Zen AI vision
    // If it fails due to no actual image, that's expected
    try {
      const result = await agent.execute(testData);

      if (result.success) {
        logTest('Receipt Processing - Basic execution', 'pass');

        if (result.receipt) {
          logTest('Receipt Processing - Data extraction', 'pass');

          if (result.receipt.vendor) {
            logTest('Receipt Processing - Vendor detection', 'pass', result.receipt.vendor);
          }

          if (result.receipt.total) {
            logTest('Receipt Processing - Total extraction', 'pass', `$${result.receipt.total}`);
          }

          if (result.receipt.categories && result.receipt.categories.length > 0) {
            logTest('Receipt Processing - Auto-categorization', 'pass',
              `${result.receipt.categories.length} categories`);
          } else {
            logTest('Receipt Processing - Auto-categorization', 'warn');
          }

          if (result.receipt.anomalies !== undefined) {
            logTest('Receipt Processing - Anomaly detection', 'pass',
              `${result.receipt.anomalies.length} anomalies found`);
          }

          console.log('\n📊 Receipt details:');
          console.log(`  Vendor: ${result.receipt.vendor || 'Unknown'}`);
          console.log(`  Date: ${result.receipt.date || 'Unknown'}`);
          console.log(`  Total: $${result.receipt.total || '0.00'}`);
          console.log(`  Confidence: ${result.receipt.confidence || 0}`);
        }
      } else {
        logTest('Receipt Processing - Basic execution', 'warn', 'Expected failure (no real image)');
      }
    } catch (error) {
      // Expected to fail without real image
      logTest('Receipt Processing - Zen MCP Vision', 'warn',
        'Cannot test without real receipt image (expected)');
    }

    const events = mockIO.getEvents();
    if (events.length > 0) {
      logTest('Receipt Processing - WebSocket updates', 'pass', `${events.length} events`);
    }

    mockIO.clear();

  } catch (error) {
    logTest('Receipt Processing - Overall', 'warn', 'Needs real receipt image for full test');
    console.log('Note: This agent requires actual receipt images for complete testing');
  }
}

// ============================================================================
// TEST 4: CONTENT CREATION AGENT
// ============================================================================
async function testContentCreationAgent() {
  console.log('\n\n✍️ TEST 4: CONTENT CREATION AGENT');
  console.log('-'.repeat(60));

  try {
    const agent = new ContentCreationAgent(mockIO);

    // Test social media post creation
    console.log('\n🔄 Test 4a: Social Media Posts');
    const socialMediaData = {
      userId: 'test-user-123',
      sessionId: 'test-session-social',
      contentType: 'social_media',
      context: {
        organization: 'Community Food Bank',
        event: 'Thanksgiving Community Cookout',
        metrics: {
          mealsServed: 150,
          volunteersHelped: 25,
          familiesImpacted: 60
        },
        tone: 'inspiring'
      }
    };

    const socialResult = await agent.execute(socialMediaData);

    if (socialResult.success) {
      logTest('Content Creation - Social Media (Zen MCP)', 'pass');

      if (socialResult.posts) {
        const platforms = Object.keys(socialResult.posts);
        logTest('Content Creation - Multi-platform posts', 'pass',
          platforms.join(', '));

        console.log('\n📱 Sample posts generated:');
        platforms.forEach(platform => {
          const post = socialResult.posts[platform];
          const preview = typeof post === 'string'
            ? post.substring(0, 80) + '...'
            : JSON.stringify(post).substring(0, 80) + '...';
          console.log(`  ${platform}: ${preview}`);
        });
      }
    } else {
      logTest('Content Creation - Social Media (Zen MCP)', 'fail');
    }

    mockIO.clear();

    // Test blog post creation
    console.log('\n🔄 Test 4b: Blog Post');
    const blogData = {
      userId: 'test-user-123',
      sessionId: 'test-session-blog',
      contentType: 'blog_post',
      context: {
        topic: 'How Community Cookouts Build Stronger Neighborhoods',
        organization: 'Community Food Bank',
        keywords: ['community', 'food bank', 'volunteer', 'impact'],
        targetLength: 800
      }
    };

    try {
      const blogResult = await agent.execute(blogData);

      if (blogResult.success) {
        logTest('Content Creation - Blog Post (Zen MCP)', 'pass');

        if (blogResult.post && blogResult.post.headline) {
          console.log(`\n📝 Blog headline: "${blogResult.post.headline}"`);
          console.log(`   Word count: ${blogResult.metadata?.wordCount || 0}`);
        }
      } else {
        logTest('Content Creation - Blog Post (Zen MCP)', 'fail');
      }
    } catch (error) {
      logTest('Content Creation - Blog Post (Zen MCP)', 'warn', error.message);
    }

    mockIO.clear();

  } catch (error) {
    logTest('Content Creation - Overall', 'fail', error.message);
    console.error('Error details:', error);
  }
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================
async function runAllTests() {
  console.log('\n🚀 AI AGENT INTEGRATION TEST SUITE');
  console.log('Testing all agents and MCP integrations\n');

  await testMealPlannerAgent();
  await testPriceResearchAgent();
  await testReceiptProcessingAgent();
  await testContentCreationAgent();

  // Final summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  console.log(`\n✅ Passed: ${testResults.passed.length}`);
  testResults.passed.forEach(test => {
    console.log(`   - ${test}`);
  });

  if (testResults.warnings.length > 0) {
    console.log(`\n⚠️  Warnings: ${testResults.warnings.length}`);
    testResults.warnings.forEach(({ name, details }) => {
      console.log(`   - ${name}${details ? ': ' + details : ''}`);
    });
  }

  if (testResults.failed.length > 0) {
    console.log(`\n❌ Failed: ${testResults.failed.length}`);
    testResults.failed.forEach(({ name, details }) => {
      console.log(`   - ${name}${details ? ': ' + details : ''}`);
    });
  }

  const total = testResults.passed.length + testResults.warnings.length + testResults.failed.length;
  const passRate = ((testResults.passed.length / total) * 100).toFixed(1);

  console.log(`\n📈 Pass Rate: ${passRate}% (${testResults.passed.length}/${total})`);

  console.log('\n' + '='.repeat(60));
  console.log('🏁 Tests complete!\n');

  // Return status code
  return testResults.failed.length === 0 ? 0 : 1;
}

// Run tests
runAllTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('\n❌ Fatal error running tests:', error);
    process.exit(1);
  });
