// Test REAL Playwright web scraping with actual browser automation
import RealPlaywrightClient from '../mcp/realPlaywrightClient.js';

console.log('🧪 REAL PLAYWRIGHT WEB SCRAPING TEST');
console.log('=' .repeat(80));
console.log('Testing with Playwright library (not MCP)');
console.log('This will open a visible Chrome browser window and scrape real prices');
console.log('=' .repeat(80));
console.log();

async function testRealWebScraping() {
  const client = new RealPlaywrightClient();

  try {
    // Step 1: Launch browser (visible mode)
    console.log('📡 Step 1: Launching Playwright browser (non-headless)...');
    const connectResult = await client.connect(false); // false = visible browser

    if (!connectResult.success) {
      console.log('❌ Failed to launch browser:', connectResult.error);
      process.exit(1);
    }

    console.log('✅ Browser launched successfully');
    console.log('   You should see a Chrome window open now');
    console.log();

    // Wait a moment for user to see the browser
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Test real price scraping
    console.log('📊 Step 2: Scraping real prices from store websites...');
    console.log('   Items: Ground Beef, Hamburger Buns, Potato Salad');
    console.log('   Stores: Costco, Walmart, Sam\'s Club, Instacart');
    console.log();

    const startTime = Date.now();

    const result = await client.researchBulkPrices([
      'Ground Beef',
      'Hamburger Buns',
      'Potato Salad'
    ]);

    const duration = Date.now() - startTime;

    console.log('=' .repeat(80));
    console.log('📊 RESULTS');
    console.log('=' .repeat(80));
    console.log();

    console.log('⏱️  Total Time:', Math.round(duration / 1000) + ' seconds');
    console.log('📦 Items Researched:', result.results?.length || 0);
    console.log('🔧 Method:', result.method || 'unknown');
    console.log('🌐 Live Results:', result.liveResults || 0);
    console.log();

    if (result.success && result.results) {
      for (const item of result.results) {
        console.log(`\n🍔 ${item.item}`);
        console.log('   Total prices found:', item.pricesFound || item.prices?.length || 0);
        console.log('   Live prices:', item.liveCount || 0);
        console.log('   Source:', item.source === 'live' ? '🌐 LIVE' : '📊 ESTIMATED');

        if (item.prices && item.prices.length > 0) {
          console.log('   Price breakdown:');
          for (const price of item.prices) {
            const sourceEmoji = price.source === 'live' ? '🌐' : '📊';
            const priceDisplay = price.source === 'live'
              ? `$${price.price.toFixed(2)}`
              : `$${price.price} ${price.unit}`;
            console.log(`     ${sourceEmoji} ${price.store}: ${priceDisplay} (${price.source})`);

            if (price.source === 'live') {
              console.log(`        Found ${price.pricesFound} prices on page`);
            }
          }
        }

        if (item.bestStore && item.bestPrice) {
          const emoji = item.source === 'live' ? '💰' : '📊';
          console.log(`   ${emoji} Best Deal: ${item.bestStore} at $${item.bestPrice.toFixed(2)}`);
        }
      }
    }

    console.log();
    console.log('=' .repeat(80));

    // Step 3: Analyze results
    const liveCount = result.results?.filter(r => r.source === 'live').length || 0;
    const estimateCount = result.results?.filter(r => r.source === 'estimated').length || 0;
    const totalLivePrices = result.results?.reduce((sum, r) => sum + (r.liveCount || 0), 0) || 0;

    console.log('\n📈 DATA SOURCE BREAKDOWN:');
    console.log(`   🌐 Items with live prices: ${liveCount}`);
    console.log(`   📊 Items with estimates: ${estimateCount}`);
    console.log(`   🌐 Total live prices found: ${totalLivePrices}`);
    console.log();

    if (liveCount > 0 && totalLivePrices > 0) {
      console.log('✅ SUCCESS: Real web scraping is WORKING!');
      console.log(`   ${totalLivePrices} prices extracted from actual store websites`);
      console.log('   This is REAL data, not mock/estimated prices');
    } else if (liveCount > 0 && totalLivePrices === 0) {
      console.log('⚠️  PARTIAL SUCCESS: Browser automation working');
      console.log('   But no prices extracted (possibly due to website structure)');
      console.log('   This is common with e-commerce sites that require JavaScript');
    } else {
      console.log('⚠️  FALLBACK: Using estimated prices');
      console.log('   Web scraping attempted but no live prices found');
    }

    // Step 4: Close browser
    console.log('\n🔌 Step 3: Closing browser...');
    await client.disconnect();
    console.log('✅ Browser closed');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Make sure to close browser on error
    await client.disconnect();
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
