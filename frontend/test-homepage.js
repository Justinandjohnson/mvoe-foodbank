const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Store console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Store network requests
  const networkRequests = [];
  page.on('request', request => {
    networkRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType()
    });
  });

  // Store failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure().errorText
    });
  });

  // Store responses with status codes
  const responses = [];
  page.on('response', response => {
    responses.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText()
    });
  });

  try {
    console.log('Navigating to http://localhost:8081...');
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait a bit for any dynamic content to load
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: '/Users/jjohnson/Downloads/Mvoe/frontend/homepage-screenshot.png', fullPage: true });
    console.log('Screenshot saved to homepage-screenshot.png');

    // Get page title
    const title = await page.title();
    console.log('\n=== PAGE TITLE ===');
    console.log(title);

    // Check for specific elements
    console.log('\n=== CHECKING FOR KEY ELEMENTS ===');

    const bodyText = await page.textContent('body');

    // Check for key phrases
    const hasTitle = bodyText.includes('Food Bank Platform') || bodyText.includes('Food Bank');
    const hasMetrics = bodyText.includes('metric') || bodyText.includes('stat');
    const hasError = bodyText.includes('error') || bodyText.includes('Error') || bodyText.includes('500');

    console.log('Contains "Food Bank Platform":', hasTitle);
    console.log('Contains metrics/stats:', hasMetrics);
    console.log('Contains error messages:', hasError);

    // Get all visible text
    console.log('\n=== VISIBLE PAGE CONTENT (first 1000 chars) ===');
    console.log(bodyText.substring(0, 1000));

    // Check for React root
    const reactRoot = await page.$('#root, #app, [data-reactroot]');
    console.log('\n=== REACT ROOT ===');
    console.log('React root element found:', !!reactRoot);

    // Get all headings
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', elements =>
      elements.map(el => ({ tag: el.tagName, text: el.textContent }))
    );
    console.log('\n=== HEADINGS ===');
    console.log(JSON.stringify(headings, null, 2));

    // Get navigation elements
    const navElements = await page.$$eval('nav, [role="navigation"], header', elements =>
      elements.map(el => ({ tag: el.tagName, class: el.className }))
    );
    console.log('\n=== NAVIGATION ELEMENTS ===');
    console.log(JSON.stringify(navElements, null, 2));

    // Console logs
    console.log('\n=== CONSOLE LOGS ===');
    console.log(JSON.stringify(consoleLogs, null, 2));

    // Failed requests
    console.log('\n=== FAILED REQUESTS ===');
    if (failedRequests.length > 0) {
      console.log(JSON.stringify(failedRequests, null, 2));
    } else {
      console.log('No failed requests');
    }

    // Responses with errors (4xx, 5xx)
    console.log('\n=== ERROR RESPONSES (4xx, 5xx) ===');
    const errorResponses = responses.filter(r => r.status >= 400);
    if (errorResponses.length > 0) {
      console.log(JSON.stringify(errorResponses, null, 2));
    } else {
      console.log('No error responses');
    }

    // All requests summary
    console.log('\n=== REQUEST SUMMARY ===');
    console.log('Total requests:', networkRequests.length);
    console.log('Failed requests:', failedRequests.length);
    console.log('Error responses:', errorResponses.length);

    // Get page HTML
    const html = await page.content();
    fs.writeFileSync('/Users/jjohnson/Downloads/Mvoe/frontend/homepage-html.txt', html);
    console.log('\n=== HTML CONTENT ===');
    console.log('Full HTML saved to homepage-html.txt');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
  }
})();
