// Test real Playwright web scraping with visible browser
import PlaywrightClient from '../mcp/playwrightClient.js';

console.log('🧪 PLAYWRIGHT WEB SCRAPING TEST');
console.log('=' .repeat(80));
console.log('Testing REAL web scraping with non-headless browser');
console.log('This will open a visible Chrome browser window');
console.log('=' .repeat(80));
console.log();

async function testRealWebScraping() {
  const client = new PlaywrightClient();

  try {
    // Step 1: Connect to Playwright MCP
    console.log('📡 Step 1: Starting Playwright MCP server (non-headless)...');
    const connectResult = await client.connect();

    if (connectResult.success) {
      console.log('✅ Playwright MCP server started');
      console.log('   Browser window should be visible now');
    } else {
      console.log('❌ Failed to start Playwright MCP:', connectResult.error);
      console.log('   Falling back to estimates...');
    }
    console.log();

    // Step 2: Test price research for bulk items
    console.log('📊 Step 2: Testing bulk price research...');
    console.log('   Searching for: Ground Beef, Hamburger Buns, Potato Salad');
    console.log();

    const startTime = Date.now();

    const result = await client.researchBulkPrices([
      'Ground Beef bulk',
      'Hamburger Buns bulk',
      'Potato Salad bulk'
    ]);

    const duration = Date.now() - startTime;

    console.log('=' .repeat(80));
    console.log('📊 RESULTS');
    console.log('=' .repeat(80));
    console.log();

    console.log('⏱️  Execution Time:', duration + 'ms');
    console.log('📦 Items Researched:', result.results?.length || 0);
    console.log('🔧 Method:', result.method || 'unknown');
    console.log();

    if (result.success && result.results) {
      for (const item of result.results) {
        console.log(`\n🍔 ${item.item}`);
        console.log('   Prices found:', item.pricesFound || item.prices?.length || 0);
        console.log('   Source:', item.source || 'unknown');

        if (item.prices && item.prices.length > 0) {
          console.log('   Price breakdown:');
          for (const price of item.prices) {
            const sourceEmoji = price.source === 'live' ? '🌐' : '📊';
            console.log(`     ${sourceEmoji} ${price.store}: $${price.price} (${price.source})`);
          }
        }

        if (item.bestStore && item.bestPrice) {
          console.log(`   💰 Best Deal: ${item.bestStore} at $${item.bestPrice}`);
        }
      }
    }

    console.log();
    console.log('=' .repeat(80));

    // Step 3: Check what data source was used
    const realCount = result.results?.filter(r => r.source === 'live').length || 0;
    const estimateCount = result.results?.filter(r => r.source === 'estimated').length || 0;

    console.log('\n📈 DATA SOURCE BREAKDOWN:');
    console.log(`   🌐 Live web scraping: ${realCount} items`);
    console.log(`   📊 Estimated prices: ${estimateCount} items`);

    if (realCount > 0) {
      console.log('\n✅ SUCCESS: Real web scraping is working!');
      console.log('   Prices were extracted from actual store websites');
    } else if (estimateCount > 0) {
      console.log('\n⚠️  FALLBACK: Using estimated prices');
      console.log('   Web scraping not available or failed');
      console.log('   This is expected if Playwright MCP is not properly configured');
    }

    // Step 4: Disconnect
    console.log('\n🔌 Step 3: Disconnecting Playwright MCP...');
    await client.disconnect();
    console.log('✅ Disconnected');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test complete!');
  console.log('='.repeat(80));
}

// Run the test
testRealWebScraping().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
