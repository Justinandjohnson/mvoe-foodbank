// Test Chrome DevTools web scraping for price research
import ChromeDevToolsClient from '../mcp/chromeDevToolsClient.js';

async function testPriceScraping() {
  console.log('🧪 Testing Chrome DevTools Price Scraping\n');
  console.log('============================================================\n');

  const chromeClient = new ChromeDevToolsClient();

  try {
    // Connect to Chrome DevTools MCP
    console.log('📡 Connecting to Chrome DevTools MCP...');
    await chromeClient.connect();

    if (!chromeClient.connected) {
      console.log('❌ Failed to connect to Chrome DevTools MCP');
      console.log('\n💡 Make sure chrome-devtools-mcp is available:');
      console.log('   npm install -g chrome-devtools-mcp');
      console.log('   OR it will auto-install via npx on first run');
      return;
    }

    console.log('✅ Connected to Chrome DevTools MCP\n');

    // Test items to search for
    const testItems = [
      'ground beef bulk',
      'hamburger buns bulk'
    ];

    console.log('🔍 Testing bulk price research...\n');
    console.log(`Items to search: ${testItems.join(', ')}\n`);

    const results = await chromeClient.researchBulkPrices(testItems);

    if (results.success) {
      console.log('\n✅ Price research completed!\n');
      console.log('============================================================');
      console.log('RESULTS:');
      console.log('============================================================\n');

      for (const result of results.results) {
        console.log(`📦 Item: ${result.item}`);
        console.log(`   Source: ${result.source}`);

        if (result.prices && result.prices.length > 0) {
          console.log(`   Prices found: ${result.prices.length}`);

          for (const price of result.prices) {
            console.log(`\n   🏪 ${price.store}:`);
            console.log(`      Price: $${price.price}`);
            if (price.unit) console.log(`      Unit: ${price.unit}`);
            if (price.url) console.log(`      URL: ${price.url}`);
            if (price.method) console.log(`      Method: ${price.method}`);
          }

          console.log(`\n   💰 Best Price: $${result.bestPrice} at ${result.bestStore}`);
        } else {
          console.log('   ⚠️ No prices found (using estimates)');
          if (result.note) console.log(`   Note: ${result.note}`);
        }

        console.log('\n-----------------------------------------------------------\n');
      }

      // Summary
      const totalLivePrices = results.results.reduce((sum, r) => {
        return sum + (r.prices?.filter(p => p.source === 'live').length || 0);
      }, 0);

      console.log('============================================================');
      console.log('SUMMARY:');
      console.log('============================================================');
      console.log(`Items researched: ${results.results.length}`);
      console.log(`Live prices found: ${totalLivePrices}`);
      console.log(`Estimated prices: ${results.results.filter(r => r.source === 'estimated').length}`);
      console.log('============================================================\n');

      if (totalLivePrices > 0) {
        console.log('🎉 SUCCESS! Web scraping is working!');
        console.log('   The Chrome DevTools MCP successfully scraped live prices.');
      } else {
        console.log('⚠️ WARNING: No live prices found');
        console.log('   This could mean:');
        console.log('   1. Stores are blocking automated access');
        console.log('   2. Page structure has changed');
        console.log('   3. Network issues or slow connections');
        console.log('   4. Chrome MCP needs additional configuration');
        console.log('\n   The agent will fall back to estimated prices.');
      }

    } else {
      console.log('❌ Price research failed');
      console.log(`Error: ${results.error}`);
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    try {
      await chromeClient.disconnect();
      console.log('\n✅ Disconnected from Chrome DevTools MCP');
    } catch (error) {
      console.error('Error disconnecting:', error.message);
    }
  }
}

// Run the test
console.log('🚀 Starting price scraping test...\n');
testPriceScraping()
  .then(() => {
    console.log('\n🏁 Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
