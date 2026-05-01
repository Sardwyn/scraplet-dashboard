/**
 * Feature Test Suite
 * 
 * Comprehensive tests for all overlay editor features
 * Ensures no regressions after code changes
 */

import { TestRunner } from './test-runner.js';

const featureTests = {
  // Element Creation Tests
  elementCreation: [
    {
      name: 'Create Box Element',
      test: async (page) => {
        await page.click('[data-tool="box"]');
        await page.mouse.move(500, 500);
        await page.mouse.down();
        await page.mouse.move(700, 600);
        await page.mouse.up();
        
        const elementCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        if (elementCount === 0) throw new Error('Box element not created');
        return { elementCount };
      }
    },
    {
      name: 'Create Text Element',
      test: async (page) => {
        await page.click('[data-tool="text"]');
        await page.click({ x: 500, y: 500 });
        
        const hasTextElement = await page.evaluate(() => {
          return document.querySelector('[data-type="text"]') !== null;
        });
        
        if (!hasTextElement) throw new Error('Text element not created');
        return { hasTextElement };
      }
    },
    {
      name: 'Create Shape Element',
      test: async (page) => {
        await page.click('[data-tool="shape"]');
        await page.click('[data-shape="ellipse"]');
        await page.mouse.move(500, 500);
        await page.mouse.down();
        await page.mouse.move(600, 600);
        await page.mouse.up();
        
        const hasShapeElement = await page.evaluate(() => {
          return document.querySelector('[data-type="shape"]') !== null;
        });
        
        if (!hasShapeElement) throw new Error('Shape element not created');
        return { hasShapeElement };
      }
    }
  ],

  // Element Manipulation Tests
  elementManipulation: [
    {
      name: 'Select Element',
      test: async (page) => {
        const element = await page.$('.overlay-element:first-child');
        await element.click();
        
        const isSelected = await page.evaluate(() => {
          return document.querySelector('.overlay-element.selected') !== null;
        });
        
        if (!isSelected) throw new Error('Element not selected');
        return { isSelected };
      }
    },
    {
      name: 'Multi-Select Elements',
      test: async (page) => {
        await page.keyboard.down('Shift');
        await page.click('.overlay-element:nth-child(1)');
        await page.click('.overlay-element:nth-child(2)');
        await page.keyboard.up('Shift');
        
        const selectedCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element.selected').length;
        });
        
        if (selectedCount < 2) throw new Error('Multi-select failed');
        return { selectedCount };
      }
    },
    {
      name: 'Duplicate Element',
      test: async (page) => {
        await page.click('.overlay-element:first-child');
        await page.keyboard.press('Control+D');
        
        const elementCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        // Should have one more element than before
        return { elementCount };
      }
    },
    {
      name: 'Delete Element',
      test: async (page) => {
        const initialCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        await page.click('.overlay-element:first-child');
        await page.keyboard.press('Delete');
        
        const finalCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        if (finalCount !== initialCount - 1) throw new Error('Delete failed');
        return { initialCount, finalCount };
      }
    }
  ],

  // Inspector Property Tests
  inspectorProperties: [
    {
      name: 'Change Fill Color',
      test: async (page) => {
        await page.click('.overlay-element:first-child');
        await page.click('[data-property="fill"]');
        await page.fill('[data-property="fill-color"]', '#FF0000');
        
        const fillColor = await page.evaluate(() => {
          const element = document.querySelector('.overlay-element:first-child');
          return window.getComputedStyle(element).backgroundColor;
        });
        
        if (!fillColor.includes('255, 0, 0')) throw new Error('Fill color not changed');
        return { fillColor };
      }
    },
    {
      name: 'Change Opacity',
      test: async (page) => {
        await page.click('.overlay-element:first-child');
        await page.fill('[data-property="opacity"]', '0.5');
        
        const opacity = await page.evaluate(() => {
          const element = document.querySelector('.overlay-element:first-child');
          return window.getComputedStyle(element).opacity;
        });
        
        if (Math.abs(parseFloat(opacity) - 0.5) > 0.1) {
          throw new Error('Opacity not changed');
        }
        return { opacity };
      }
    },
    {
      name: 'Add Stroke',
      test: async (page) => {
        await page.click('.overlay-element:first-child');
        await page.click('[data-property="stroke"]');
        await page.fill('[data-property="stroke-width"]', '5');
        
        const hasStroke = await page.evaluate(() => {
          const element = document.querySelector('.overlay-element:first-child');
          const strokeWidth = window.getComputedStyle(element).borderWidth;
          return strokeWidth !== '0px';
        });
        
        if (!hasStroke) throw new Error('Stroke not added');
        return { hasStroke };
      }
    }
  ],

  // Alignment Tools Tests
  alignmentTools: [
    {
      name: 'Align Left',
      test: async (page) => {
        await page.keyboard.down('Shift');
        await page.click('.overlay-element:nth-child(1)');
        await page.click('.overlay-element:nth-child(2)');
        await page.keyboard.up('Shift');
        
        await page.click('[data-align="left"]');
        
        const positions = await page.evaluate(() => {
          const elements = document.querySelectorAll('.overlay-element.selected');
          return Array.from(elements).map(el => el.getBoundingClientRect().left);
        });
        
        const allSame = positions.every(pos => Math.abs(pos - positions[0]) < 1);
        if (!allSame) throw new Error('Align left failed');
        return { positions };
      }
    },
    {
      name: 'Align Center',
      test: async (page) => {
        await page.keyboard.down('Shift');
        await page.click('.overlay-element:nth-child(1)');
        await page.click('.overlay-element:nth-child(2)');
        await page.keyboard.up('Shift');
        
        await page.click('[data-align="center"]');
        
        const centers = await page.evaluate(() => {
          const elements = document.querySelectorAll('.overlay-element.selected');
          return Array.from(elements).map(el => {
            const rect = el.getBoundingClientRect();
            return rect.left + rect.width / 2;
          });
        });
        
        const allSame = centers.every(pos => Math.abs(pos - centers[0]) < 1);
        if (!allSame) throw new Error('Align center failed');
        return { centers };
      }
    }
  ],

  // Snap and Guides Tests
  snapAndGuides: [
    {
      name: 'Snap to Grid',
      test: async (page) => {
        await page.click('[data-feature="snap"]');
        await page.click('.overlay-element:first-child');
        
        const element = await page.$('.overlay-element:first-child');
        const box = await element.boundingBox();
        
        // Drag to non-grid position
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 123, box.y + 456); // Non-grid position
        await page.mouse.up();
        
        const finalPosition = await page.evaluate(() => {
          const el = document.querySelector('.overlay-element:first-child');
          return { x: el.offsetLeft, y: el.offsetTop };
        });
        
        // Should snap to grid (multiple of 8)
        const snappedX = finalPosition.x % 8 === 0;
        const snappedY = finalPosition.y % 8 === 0;
        
        if (!snappedX || !snappedY) throw new Error('Snap to grid failed');
        return { finalPosition, snappedX, snappedY };
      }
    },
    {
      name: 'Show Guides',
      test: async (page) => {
        await page.click('[data-feature="guides"]');
        await page.click('.overlay-element:first-child');
        
        // Drag near another element to trigger guides
        const element = await page.$('.overlay-element:first-child');
        const box = await element.boundingBox();
        
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 50, box.y);
        
        const hasGuides = await page.evaluate(() => {
          return document.querySelector('.guide-line') !== null;
        });
        
        await page.mouse.up();
        
        if (!hasGuides) throw new Error('Guides not shown');
        return { hasGuides };
      }
    }
  ],

  // Undo/Redo Tests
  undoRedo: [
    {
      name: 'Undo Operation',
      test: async (page) => {
        const initialCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        // Create element
        await page.click('[data-tool="box"]');
        await page.mouse.move(500, 500);
        await page.mouse.down();
        await page.mouse.move(600, 600);
        await page.mouse.up();
        
        // Undo
        await page.keyboard.press('Control+Z');
        
        const finalCount = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        if (finalCount !== initialCount) throw new Error('Undo failed');
        return { initialCount, finalCount };
      }
    },
    {
      name: 'Redo Operation',
      test: async (page) => {
        // Undo first
        await page.keyboard.press('Control+Z');
        
        const afterUndo = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        // Redo
        await page.keyboard.press('Control+Shift+Z');
        
        const afterRedo = await page.evaluate(() => {
          return document.querySelectorAll('.overlay-element').length;
        });
        
        if (afterRedo <= afterUndo) throw new Error('Redo failed');
        return { afterUndo, afterRedo };
      }
    }
  ],

  // Performance Mode Tests
  performanceMode: [
    {
      name: 'Toggle Performance Mode',
      test: async (page) => {
        await page.click('[data-feature="performance-mode"]');
        
        const isEnabled = await page.evaluate(() => {
          return document.body.classList.contains('performance-mode');
        });
        
        if (!isEnabled) throw new Error('Performance mode not enabled');
        return { isEnabled };
      }
    },
    {
      name: 'Videos Paused in Performance Mode',
      test: async (page) => {
        await page.click('[data-feature="performance-mode"]');
        
        const videosPaused = await page.evaluate(() => {
          const videos = document.querySelectorAll('video');
          return Array.from(videos).every(v => v.paused);
        });
        
        if (!videosPaused) throw new Error('Videos not paused');
        return { videosPaused };
      }
    }
  ]
};

// Run all feature tests
async function runAllFeatureTests() {
  const runner = new TestRunner();
  
  try {
    await runner.setup();
    await runner.loadOverlay('simple.json');
    
    for (const [category, tests] of Object.entries(featureTests)) {
      console.log(`\n📦 Testing category: ${category}`);
      
      for (const { name, test } of tests) {
        await runner.testFeature(name, test);
      }
    }
    
    await runner.saveResults();
    
  } catch (error) {
    console.error('❌ Feature tests failed:', error);
    process.exit(1);
  } finally {
    await runner.cleanup();
  }
}

export { featureTests, runAllFeatureTests };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllFeatureTests();
}
