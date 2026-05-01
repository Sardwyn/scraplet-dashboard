/**
 * Overlay Editor Test Runner
 * 
 * Automated test suite for performance and feature testing
 * Based on Figma's approach: realistic tests with real documents
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const EDITOR_URL = process.env.EDITOR_URL || 'http://localhost:3000/dashboard/overlays/editor';
const RESULTS_DIR = './metrics/performance/results';
const TEST_OVERLAYS_DIR = './metrics/performance/test-overlays';

// Performance thresholds (based on Figma's 60fps target)
const THRESHOLDS = {
  TARGET_FPS: 60,
  MIN_FPS: 30,
  AVG_FRAME_TIME_MS: 16.67, // 60fps
  MAX_FRAME_TIME_MS: 33.33, // 30fps minimum
  DRAG_START_MS: 10,
  DRAG_UPDATE_MS: 16.67,
  DRAG_STOP_MS: 50,
  ELEMENT_CREATE_MS: 100,
  UNDO_REDO_MS: 50,
};

class TestRunner {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = [];
  }

  async setup() {
    console.log('🚀 Starting test runner...');
    
    // Ensure results directory exists
    await fs.mkdir(RESULTS_DIR, { recursive: true });
    
    // Launch browser
    this.browser = await chromium.launch({
      headless: false, // Set to true for CI
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    this.page = await this.browser.newPage();
    
    // Enable performance monitoring
    await this.page.evaluate(() => {
      window.performanceMetrics = {
        frameTimes: [],
        operations: {},
      };
      
      // Track frame times
      let lastFrameTime = performance.now();
      const trackFrame = () => {
        const now = performance.now();
        const frameTime = now - lastFrameTime;
        window.performanceMetrics.frameTimes.push(frameTime);
        lastFrameTime = now;
        requestAnimationFrame(trackFrame);
      };
      requestAnimationFrame(trackFrame);
    });
    
    console.log('✅ Browser launched');
  }

  async loadOverlay(overlayPath) {
    console.log(`📂 Loading overlay: ${overlayPath}`);
    
    const overlayData = JSON.parse(
      await fs.readFile(path.join(TEST_OVERLAYS_DIR, overlayPath), 'utf-8')
    );
    
    // Navigate to editor with overlay data
    await this.page.goto(`${EDITOR_URL}?test=true`);
    await this.page.waitForSelector('#overlay-editor-root');
    
    // Inject overlay data
    await this.page.evaluate((data) => {
      window.testOverlayData = data;
      // Trigger overlay load
      window.dispatchEvent(new CustomEvent('loadTestOverlay', { detail: data }));
    }, overlayData);
    
    // Wait for overlay to render
    await this.page.waitForTimeout(1000);
    
    console.log('✅ Overlay loaded');
  }

  async measureDragPerformance(elementSelector, dragDistance = 200) {
    console.log('🎯 Testing drag performance...');
    
    // Reset metrics
    await this.page.evaluate(() => {
      window.performanceMetrics.frameTimes = [];
      window.performanceMetrics.operations.drag = {
        start: 0,
        updates: [],
        stop: 0,
      };
    });
    
    // Get element position
    const element = await this.page.$(elementSelector);
    const box = await element.boundingBox();
    
    // Perform drag
    const startTime = Date.now();
    
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    
    // Drag in steps to measure frame times
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const x = box.x + box.width / 2 + (dragDistance * i / steps);
      const y = box.y + box.height / 2;
      await this.page.mouse.move(x, y);
      await this.page.waitForTimeout(16); // ~60fps
    }
    
    await this.page.mouse.up();
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Collect metrics
    const metrics = await this.page.evaluate(() => {
      const frameTimes = window.performanceMetrics.frameTimes;
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const maxFrameTime = Math.max(...frameTimes);
      const minFrameTime = Math.min(...frameTimes);
      const fps = 1000 / avgFrameTime;
      
      return {
        avgFrameTime,
        maxFrameTime,
        minFrameTime,
        fps,
        frameCount: frameTimes.length,
        frameTimes: frameTimes.slice(-100), // Last 100 frames
      };
    });
    
    metrics.totalTime = totalTime;
    
    console.log(`  Average FPS: ${metrics.fps.toFixed(2)}`);
    console.log(`  Avg frame time: ${metrics.avgFrameTime.toFixed(2)}ms`);
    console.log(`  Max frame time: ${metrics.maxFrameTime.toFixed(2)}ms`);
    
    return metrics;
  }

  async measureResizePerformance(elementSelector) {
    console.log('🎯 Testing resize performance...');
    
    await this.page.evaluate(() => {
      window.performanceMetrics.frameTimes = [];
    });
    
    const element = await this.page.$(elementSelector);
    const box = await element.boundingBox();
    
    // Find resize handle (bottom-right)
    const handleX = box.x + box.width;
    const handleY = box.y + box.height;
    
    await this.page.mouse.move(handleX, handleY);
    await this.page.mouse.down();
    
    // Resize
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const x = handleX + (100 * i / steps);
      const y = handleY + (100 * i / steps);
      await this.page.mouse.move(x, y);
      await this.page.waitForTimeout(16);
    }
    
    await this.page.mouse.up();
    
    const metrics = await this.page.evaluate(() => {
      const frameTimes = window.performanceMetrics.frameTimes;
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const maxFrameTime = Math.max(...frameTimes);
      const fps = 1000 / avgFrameTime;
      
      return { avgFrameTime, maxFrameTime, fps };
    });
    
    console.log(`  Average FPS: ${metrics.fps.toFixed(2)}`);
    console.log(`  Avg frame time: ${metrics.avgFrameTime.toFixed(2)}ms`);
    
    return metrics;
  }

  async testFeature(featureName, testFn) {
    console.log(`🧪 Testing feature: ${featureName}`);
    
    try {
      const result = await testFn(this.page);
      console.log(`  ✅ ${featureName} passed`);
      return { feature: featureName, passed: true, result };
    } catch (error) {
      console.log(`  ❌ ${featureName} failed: ${error.message}`);
      return { feature: featureName, passed: false, error: error.message };
    }
  }

  validateMetrics(metrics, testName) {
    const issues = [];
    
    if (metrics.fps < THRESHOLDS.MIN_FPS) {
      issues.push(`FPS too low: ${metrics.fps.toFixed(2)} < ${THRESHOLDS.MIN_FPS}`);
    }
    
    if (metrics.avgFrameTime > THRESHOLDS.AVG_FRAME_TIME_MS * 2) {
      issues.push(`Avg frame time too high: ${metrics.avgFrameTime.toFixed(2)}ms`);
    }
    
    if (metrics.maxFrameTime > THRESHOLDS.MAX_FRAME_TIME_MS * 3) {
      issues.push(`Max frame time too high: ${metrics.maxFrameTime.toFixed(2)}ms (hitching)`);
    }
    
    const passed = issues.length === 0;
    
    this.results.push({
      test: testName,
      passed,
      metrics,
      issues,
      timestamp: new Date().toISOString(),
    });
    
    if (!passed) {
      console.log(`  ⚠️  Issues found:`);
      issues.forEach(issue => console.log(`     - ${issue}`));
    }
    
    return passed;
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;
    const filepath = path.join(RESULTS_DIR, filename);
    
    const report = {
      timestamp: new Date().toISOString(),
      thresholds: THRESHOLDS,
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
      },
    };
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    
    console.log(`\n📊 Results saved to: ${filepath}`);
    console.log(`   Total tests: ${report.summary.total}`);
    console.log(`   Passed: ${report.summary.passed}`);
    console.log(`   Failed: ${report.summary.failed}`);
    
    return report;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    console.log('🧹 Cleanup complete');
  }
}

// Export for use in test suites
export { TestRunner, THRESHOLDS };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  
  try {
    await runner.setup();
    
    // Load test overlay
    await runner.loadOverlay('medium.json');
    
    // Run performance tests
    const dragMetrics = await runner.measureDragPerformance('.overlay-element:first-child');
    runner.validateMetrics(dragMetrics, 'Drag Performance');
    
    const resizeMetrics = await runner.measureResizePerformance('.overlay-element:first-child');
    runner.validateMetrics(resizeMetrics, 'Resize Performance');
    
    // Save results
    await runner.saveResults();
    
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
}
