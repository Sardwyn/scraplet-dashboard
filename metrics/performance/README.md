# Overlay Editor Performance & Feature Test Suite

## Overview

Automated test suite for the Scraplet Overlay Editor to ensure:
1. **Performance:** Drag, zoom, and pan operations maintain 60 FPS
2. **Functionality:** All editor features work correctly after code changes
3. **Regression Detection:** Catch performance and feature regressions early

## Test Categories

### 1. Performance Tests (`/performance/`)
Automated benchmarks that measure frame rates and timing:
- Drag operations (single element, multiple elements)
- Resize operations (with/without aspect ratio lock)
- Rotate operations
- Zoom and pan
- Element creation and deletion
- Undo/redo operations

### 2. Feature Tests (`/features/`)
Automated tests for every editor feature:
- Element creation (box, text, shape, image, video, widget)
- Element manipulation (move, resize, rotate, duplicate, delete)
- Inspector properties (fill, stroke, effects, constraints)
- Layers panel (select, reorder, group, lock, hide)
- Alignment tools
- Snap and guides
- Timeline and animations
- Collections
- Marketplace integration

### 3. Integration Tests (`/integration/`)
End-to-end tests for complete workflows:
- Create overlay → add elements → publish
- Import from marketplace → customize → save
- Create collection → add overlays → publish
- OBS preview integration

## Running Tests

### All Tests
```bash
npm run test:editor
```

### Performance Tests Only
```bash
npm run test:performance
```

### Feature Tests Only
```bash
npm run test:features
```

### Specific Test Suite
```bash
npm run test:editor -- --suite=drag-operations
```

## Test Structure

Each test suite follows this pattern:

```javascript
{
  name: "Test Suite Name",
  description: "What this tests",
  tests: [
    {
      name: "Specific Test",
      setup: () => { /* prepare test environment */ },
      execute: () => { /* run test */ },
      validate: (results) => { /* check results */ },
      cleanup: () => { /* clean up */ }
    }
  ]
}
```

## Performance Metrics

### Frame Rate Metrics
- **Average FPS:** Target 60 FPS
- **Minimum FPS:** Should not drop below 30 FPS
- **Frame time:** Average <16.67ms, Max <33ms

### Operation Timing
- **Drag start:** <10ms
- **Drag update:** <16.67ms per frame
- **Drag stop:** <50ms
- **Element creation:** <100ms
- **Undo/redo:** <50ms

## Test Overlays

Located in `/test-overlays/`:
- `simple.json` - 3 elements (box, text, shape)
- `medium.json` - 10 elements (mixed types)
- `complex.json` - 25+ elements (videos, effects, widgets)
- `stress.json` - 100+ elements (stress test)

## Continuous Integration

Tests run automatically:
- On every commit (performance regression check)
- On pull requests (full test suite)
- Nightly (extended stress tests)

## Reporting

Test results are logged to:
- Console (immediate feedback)
- `metrics/performance/results/` (JSON files)
- Dashboard (visual charts and trends)

## Adding New Tests

1. Create test file in appropriate directory
2. Follow test structure pattern
3. Add to test registry
4. Document expected behavior
5. Set performance thresholds

## Troubleshooting

### Tests Failing Locally
- Ensure browser is up to date
- Close other applications (reduce CPU load)
- Check if VPS is running (for integration tests)

### Performance Regressions
- Check git blame for recent changes
- Run profiler to identify bottleneck
- Compare with baseline metrics

## Baseline Metrics

Established on: 2026-05-01
Branch: feature/drag-performance-refactor

### Before Refactor:
- Drag FPS: 4-10 FPS
- Average frame time: 100-250ms
- Maximum frame time: 500ms+

### After Refactor (Target):
- Drag FPS: 60 FPS
- Average frame time: <16.67ms
- Maximum frame time: <33ms
