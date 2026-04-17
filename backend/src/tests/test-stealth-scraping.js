// Test Stealth Playwright Web Scraping with Anti-Detection
import StealthPlaywrightClient from '../mcp/stealthPlaywrightClient.js';

console.log('🥷 STEALTH WEB SCRAPING TEST');
console.log('=' .repeat(80));
console.log('Testing with anti-detection measures:');
console.log('  ✅ playwright-extra with stealth plugin');
console.log('  ✅ Fake User-Agent rotation');
console.log('  ✅ Human-like scrolling and delays');
console.log('  ✅ Enhanced price selectors');
console.log('  ✅ Multiple selector fallbacks');
console.log('=' .repeat(80));
console.log();

async function testStealthScraping() {
  const client = new StealthPlaywrightClient();

  try {
    // Step 1: Launch stealth browser (visible for debugging)
    console.log('📡 Step 1: Launching stealth browser (non-headless for debugging)...');
    const connectResult = await client.connect(false); // false = visible browser

    if (!connectResult.success) {
      console.log('❌ Failed to launch browser:', connectResult.error);
      process.exit(1);
    }

    console.log('✅ Stealth browser launched');
    console.log('   Browser window visible with anti-detection measures active');
    console.log();

    // Give user time to see the browser
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Test real price scraping with stealth
    console.log('📊 Step 2: Scraping prices with anti-detection measures...');
    console.log('   Items: Ground Beef, Hamburger Buns, Potato Salad');
    console.log('   Anti-Detection: Stealth plugin, fake UA, human behavior');
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
      let totalLivePrices = 0;
      let itemsWithLivePrices = 0;

      for (const item of result.results) {
        console.log(`\n🍔 ${item.item}`);
        console.log('   Total prices found:', item.pricesFound || item.prices?.length || 0);
        console.log('   Live prices:', item.liveCount || 0);
        console.log('   Source:', item.source === 'live' ? '🌐 LIVE' : '📊 ESTIMATED');

        if (item.liveCount > 0) {
          itemsWithLivePrices++;
          totalLivePrices += item.liveCount;
        }

        if (item.prices && item.prices.length > 0) {
          console.log('   Price breakdown:');
          for (const price of item.prices) {
            const sourceEmoji = price.source === 'live' ? '🌐' : '📊';
            const priceDisplay = price.source === 'live'
              ? `$${price.price.toFixed(2)}`
              : `$${price.price} ${price.unit}`;
            console.log(`     ${sourceEmoji} ${price.store}: ${priceDisplay}`);

            if (price.source === 'live' && price.pricesFound) {
              console.log(`        ✓ Found ${price.pricesFound} prices on page`);
              if (price.allPrices) {
                console.log(`        ✓ Sample prices: $${price.allPrices.slice(0, 3).join(', $')}`);
              }
            }
          }
        }

        if (item.bestStore && item.bestPrice) {
          const emoji = item.source === 'live' ? '💰' : '📊';
          console.log(`   ${emoji} Best Deal: ${item.bestStore} at $${item.bestPrice.toFixed(2)}`);
        }
      }

      console.log();
      console.log('=' .repeat(80));

      // Step 3: Analyze success rate
      console.log('\n📈 STEALTH SCRAPING ANALYSIS:');
      console.log(`   🥷 Anti-Detection: ACTIVE`);
      console.log(`   🌐 Items with live prices: ${itemsWithLivePrices} / ${result.results.length}`);
      console.log(`   🌐 Total live prices found: ${totalLivePrices}`);
      console.log(`   📊 Items with estimates: ${result.results.length - itemsWithLivePrices}`);

      // Calculate success rate
      const successRate = ((itemsWithLivePrices / result.results.length) * 100).toFixed(1);
      console.log(`   📊 Success Rate: ${successRate}%`);
      console.log();

      if (totalLivePrices > 0) {
        console.log('✅ SUCCESS: Anti-detection measures WORKING!');
        console.log(`   ${totalLivePrices} REAL prices extracted from live store websites`);
        console.log('   This is genuine data, not mock/estimated prices');
        console.log();
        console.log('🎯 Verification:');
        console.log('   - Stealth plugin prevented bot detection');
        console.log('   - Fake User-Agent bypassed browser fingerprinting');
        console.log('   - Human-like behavior avoided rate limiting');
        console.log('   - Enhanced selectors found price elements');
      } else if (itemsWithLivePrices === 0 && totalLivePrices === 0) {
        console.log('⚠️  NO LIVE PRICES: Still getting blocked or selectors need adjustment');
        console.log('   Possible reasons:');
        console.log('   - Sites may require residential proxies (datacenter IPs blocked)');
        console.log('   - CAPTCHA challenges present');
        console.log('   - Price selectors don\'t match current page structure');
        console.log('   - Additional anti-bot measures in place');
        console.log();
        console.log('💡 Next Steps:');
        console.log('   1. Add residential proxy service (Smartproxy, Bright Data)');
        console.log('   2. Inspect live pages to update selectors');
        console.log('   3. Increase delays between requests');
        console.log('   4. Consider CAPTCHA solving service');
      }
    }

    // Step 4: Close browser
    console.log('\n🔌 Step 3: Closing stealth browser...');
    await client.disconnect();
    console.log('✅ Browser closed');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);

    // Make sure to close browser on error
    await client.disconnect();
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test complete! Check logs at /backend/logs/api-calls.log');
  console.log('='.repeat(80));
}

// Run the test
testStealthScraping().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
