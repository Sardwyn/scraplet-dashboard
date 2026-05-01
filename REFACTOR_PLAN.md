# Overlay Editor Drag Performance Refactor Plan

## Executive Summary

Based on Figma's architecture patterns, we will refactor the overlay editor to achieve 60 FPS drag performance by:
1. Separating drag operations from React state updates
2. Using CSS transforms instead of React re-renders
3. Implementing comprehensive automated testing

**Current State:** 4-10 FPS during drag (laggy)  
**Target State:** 60 FPS during drag (smooth)  
**Estimated Time:** 4-5 days  
**Risk Level:** Medium (requires thorough testing)

---

## Phase 1: Test Suite Implementation (Day 1-2)

### Goal
Create automated test suite to catch regressions during refactor

### Tasks
- [x] Research Figma's testing approach
- [x] Create test framework structure
- [x] Implement performance benchmarks
- [x] Implement feature tests
- [ ] Create test overlays (simple, medium, complex)
- [ ] Set up CI integration
- [ ] Document test procedures

### Deliverables
- `/metrics/performance/` directory with full test suite
- Automated performance benchmarks
- Feature regression tests
- Baseline metrics established

### Success Criteria
- All tests pass on current codebase
- Performance metrics captured
- Tests run in <5 minutes
- Clear pass/fail criteria

---

## Phase 2: Drag Layer Separation (Day 3)

### Goal
Separate drag operations from React rendering pipeline

### Architecture Changes

#### Current Flow (Problematic)
```
Mouse move → setDraftRects() → React re-render → All elements update
```

#### New Flow (Figma Pattern)
```
Mouse move → Update CSS transform → No React update
Drag stop → Commit to React state → Single re-render
```

### Implementation

#### 1. Create DragOverlay Component
**File:** `src/overlay-editor/DragOverlay.tsx`

```typescript
/**
 * Separate drag layer that uses CSS transforms
 * No React state updates during drag
 */
export function DragOverlay({ elements, selectedIds, onDragStop }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDragging: false, startPos: null });
  
  const handleMouseMove = (e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    
    // Update CSS transform only (O(1) operation)
    const dx = e.clientX - dragStateRef.current.startPos.x;
    const dy = e.clientY - dragStateRef.current.startPos.y;
    
    if (containerRef.current) {
      containerRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };
  
  const handleMouseUp = (e: MouseEvent) => {
    // Commit final position to React state
    const dx = e.clientX - dragStateRef.current.startPos.x;
    const dy = e.clientY - dragStateRef.current.startPos.y;
    
    onDragStop({ dx, dy });
    dragStateRef.current.isDragging = false;
  };
  
  // ... rest of implementation
}
```

#### 2. Update OverlayEditorApp
**File:** `src/overlay-editor/OverlayEditorApp.tsx`

Changes:
- Remove `setDraftRects()` calls from `onGroupDrag`
- Add `DragOverlay` component
- Only update React state on drag stop
- Use custom event emitter for viewport updates

#### 3. Memoize ElementRenderer
**File:** `src/shared/overlayRenderer/ElementRenderer.tsx`

```typescript
export const ElementRenderer = React.memo(function ElementRenderer({
  element,
  // ... props
}) {
  // ... implementation
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.element.id === nextProps.element.id &&
    prevProps.element.x === nextProps.element.x &&
    prevProps.element.y === nextProps.element.y &&
    // ... other props
  );
});
```

### Testing
- Run performance benchmarks before/after
- Verify drag FPS improves to 60
- Ensure all features still work
- Test with complex overlays

---

## Phase 3: Optimization & Memoization (Day 4)

### Goal
Eliminate remaining unnecessary re-renders

### Tasks

#### 1. Memoize Expensive Calculations
```typescript
const elementStyle = useMemo(() => ({
  position: 'absolute',
  left: element.x,
  top: element.y,
  width: element.width,
  height: element.height,
  // ... other styles
}), [element.x, element.y, element.width, element.height]);
```

#### 2. Avoid Anonymous Functions
```typescript
// ❌ Bad: Creates new function on every render
<Element onClick={() => handleClick(element.id)} />

// ✅ Good: Stable function reference
const handleClick = useCallback((id) => {
  // handle click
}, []);
<Element onClick={handleClick} data-id={element.id} />
```

#### 3. Split Large Components
- Separate toolbar from canvas
- Separate inspector from canvas
- Each component only re-renders when its data changes

#### 4. Use React.memo Strategically
- Wrap all leaf components
- Provide custom comparison functions
- Profile to verify effectiveness

### Testing
- Run feature tests to catch regressions
- Measure re-render count during drag
- Verify performance improvements

---

## Phase 4: Validation & Documentation (Day 5)

### Goal
Ensure refactor is complete and documented

### Tasks

#### 1. Manual Testing Checklist
- [ ] Drag single element
- [ ] Drag multiple elements
- [ ] Resize elements
- [ ] Rotate elements
- [ ] Snap to grid
- [ ] Snap to guides
- [ ] Alignment tools
- [ ] Undo/redo
- [ ] Performance mode
- [ ] OBS preview
- [ ] Timeline animations
- [ ] Collections
- [ ] Marketplace

#### 2. Performance Validation
- [ ] Drag FPS: 60 (target)
- [ ] Average frame time: <16.67ms
- [ ] Maximum frame time: <33ms
- [ ] No hitching or stuttering
- [ ] Smooth on complex overlays (25+ elements)

#### 3. Documentation
- [ ] Update architecture docs
- [ ] Document new patterns
- [ ] Add code comments
- [ ] Update README
- [ ] Create migration guide

#### 4. CI Integration
- [ ] Add tests to CI pipeline
- [ ] Set up performance monitoring
- [ ] Configure alerts for regressions
- [ ] Document CI setup

---

## Success Metrics

### Performance (Primary)
| Metric | Before | Target | Measured |
|--------|--------|--------|----------|
| Drag FPS | 4-10 | 60 | TBD |
| Avg Frame Time | 100-250ms | <16.67ms | TBD |
| Max Frame Time | 500ms+ | <33ms | TBD |
| Re-renders per drag | 100+ | 0 | TBD |

### Functionality (Secondary)
- [ ] All features work correctly
- [ ] No visual regressions
- [ ] OBS preview works
- [ ] Performance mode works
- [ ] Collections work
- [ ] Marketplace works

---

## Risk Mitigation

### High Risk Areas
1. **Breaking existing features** → Comprehensive test suite
2. **Performance not improving** → Measure at each step
3. **New bugs introduced** → Thorough manual testing
4. **OBS preview breaks** → Test early and often

### Rollback Plan
If refactor fails:
1. Revert to master branch
2. Delete feature branch
3. Document lessons learned
4. Re-evaluate approach

---

## Key Learnings from Figma

### 1. Don't Use React State for Continuous Operations
Drag, zoom, and pan should use CSS transforms, not React state.

### 2. Transform Containers, Not Individual Elements
O(1) operation vs O(n) operation makes huge difference.

### 3. Memoize Everything
Prevent unnecessary re-renders with React.memo and useMemo.

### 4. Measure Performance Automatically
Catch regressions early with automated benchmarks.

### 5. Test with Real Documents
Synthetic tests don't reveal real-world performance issues.

---

## Timeline

### Week 1
- **Day 1-2:** Test suite implementation
- **Day 3:** Drag layer separation
- **Day 4:** Optimization & memoization
- **Day 5:** Validation & documentation

### Week 2 (Buffer)
- Additional testing
- Bug fixes
- Performance tuning
- Documentation

---

## Next Steps

1. ✅ Research Figma's patterns (DONE)
2. ✅ Create test suite structure (DONE)
3. ⏭️ Implement test overlays
4. ⏭️ Run baseline tests
5. ⏭️ Begin drag layer refactor
6. ⏭️ Measure and iterate
7. ⏭️ Validate and document

---

## Questions to Answer

- [ ] How to handle snap/guides during CSS transform drag?
- [ ] How to show real-time position in inspector during drag?
- [ ] How to handle undo/redo with new architecture?
- [ ] How to maintain OBS preview compatibility?
- [ ] How to handle timeline animations during drag?

---

**Status:** Planning Complete ✅  
**Branch:** feature/drag-performance-refactor  
**Ready to Begin:** Yes  
**Estimated Completion:** 2026-05-06  
