import puppeteer from 'puppeteer';

async function main() {
  console.log("Launching Puppeteer...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('pageerror', err => {
    console.error('Page Error Stack Trace:');
    console.error(err.stack || err.message || err);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('Console Error:', msg.text());
    } else {
      console.log('Console Log:', msg.text());
    }
  });

  console.log("Navigating to the overlay runtime page...");
  try {
    await page.goto('http://localhost:3000/o/raven-start-a26ae6', { waitUntil: 'load', timeout: 10000 });
    // Wait a couple of seconds to capture any async/tick errors
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (err) {
    console.error("Navigation error:", err.message);
  }

  await browser.close();
  console.log("Browser closed.");
}

main().catch(err => {
  console.error("Script failed:", err);
});
