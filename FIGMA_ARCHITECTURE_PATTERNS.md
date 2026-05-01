# Figma Architecture Patterns for Scraplet Overlay Editor

## Research Summary: How Figma Handles Canvas Performance

Based on Figma's engineering blog posts, here are the key patterns they use:

### 1. **Separate Rendering from React State** ⭐ CRITICAL
**Problem:** React re-renders cause lag during continuous operations (drag, zoom, pan)

**Figma's Solution:**
- Canvas rendering uses **WebGL/WebGPU** (not React)
- React only handles **UI chrome** (toolbars, panels, properties)
- **Viewport changes do NOT trigger Redux actions**
- Custom event emitter broadcasts viewport updates
- Only components that need viewport info subscribe to events

**Key Quote:**
> "We removed viewport information from our Redux store and instead implemented our own event emitter... By avoiding dispatching an action to update viewport information in Redux, we successfully stopped running mapStateToProps for every connected component."

### 2. **O(1) vs O(n) Operations** ⭐ CRITICAL
**Problem:** Transforming each element individually = O(n) operation on every mouse move

**Figma's Solution:**
- Create **overlay container** that holds all elements
- Transform the **container** (1 operation) instead of each element (n operations)
- Use **CSS transforms** on parent, not React state updates on children

**Key Quote:**
> "We came up with the solution to create an overlay container on the canvas and then to position the comment pins statically on this container... Now, every viewport change triggers an O(1) operation instead of O(n) operation."

### 3. **Prevent Unnecessary Re-renders**
**Problem:** Components that don't need updates are re-rendering

**Figma's Solution:**
- Use **React.memo** and **useMemo** aggressively
- Switch from class components to **functional components with hooks**
- Avoid passing **anonymous functions** as props (causes re-renders)
- Only pass down **exactly what's needed**, not entire state objects

**Key Quote:**
> "The biggest inefficiency that creeps in as React applications grow is needlessly re-rendering components."

### 4. **Measure Both Average and Maximum Frame Times**
**Problem:** Need to track both smoothness and hitching

**Figma's Metrics:**
- **Average frame time:** Overall smoothness (target: 16.67ms = 60fps)
- **Maximum frame time:** Hitching/stuttering (target: <33ms)
- Track both over time to catch regressions

**Key Quote:**
> "Higher maximum frame times produce a jarring 'hitching' effect, like your sailing boat suddenly hitting a rock. In comparison, higher average times produce choppiness, like driving a car over cobblestones."

### 5. **Automated Performance Testing**
**Problem:** Performance regressions slip in without monitoring

**Figma's Solution:**
- **Automated benchmarks** run on every commit
- Test with **real user documents**, not synthetic tests
- Simulate user interactions (drag, zoom, pan, select)
- Alert on regressions via Datadog
- Tie regressions to specific commits

**Key Quote:**
> "To create consistent and realistic benchmarks, we run a version of our app in Electron... and simulate user interactions... These benchmarks run on every commit, so when performance regresses, we get email notifications."

### 6. **WebAssembly for Heavy Computation**
**Problem:** JavaScript too slow for complex calculations

**Figma's Solution:**
- Core rendering engine in **C++ compiled to WebAssembly**
- 3x faster file loading
- JavaScript only for UI and orchestration

---

## Application to Scraplet Overlay Editor

### Current Architecture (Problems)
```
User drags element
  ↓
onGroupDrag() called on every mouse move
  ↓
setDraftRects() updates React state
  ↓
React re-renders entire overlay
  ↓
All elements re-render (even non-dragged ones)
  ↓
Videos, effects, canvas operations all recalculate
  ↓
Result: 4-10 FPS (laggy)
```

### Proposed Architecture (Figma Pattern)
```
User drags element
  ↓
onGroupDrag() called on every mouse move
  ↓
Update CSS transform on drag container (O(1))
  ↓
No React state update during drag
  ↓
No re-renders during drag
  ↓
Result: 60 FPS (smooth)

On drag stop:
  ↓
Update React state once
  ↓
Commit final positions
```

---

## Refactor Plan

### Phase 1: Separate Drag Layer (2 days)
**Goal:** Drag operations don't trigger React re-renders

**Changes:**
1. Create `DragOverlay` component (separate from main overlay)
2. During drag: update CSS transforms only
3. On drag stop: commit to React state
4. Use custom event emitter (not Redux/state)

**Files:**
- `src/overlay-editor/DragOverlay.tsx` (new)
- `src/overlay-editor/OverlayEditorApp.tsx` (refactor drag handlers)
- `src/shared/overlayRenderer/ElementRenderer.tsx` (memoize)

### Phase 2: Memoization & Optimization (1 day)
**Goal:** Non-dragged elements don't re-render

**Changes:**
1. Wrap `ElementRenderer` with `React.memo`
2. Use `useMemo` for expensive calculations
3. Avoid anonymous functions in props
4. Only pass required props (not entire state)

**Files:**
- `src/shared/overlayRenderer/ElementRenderer.tsx`
- `src/overlay-editor/OverlayEditorApp.tsx`

### Phase 3: Performance Testing Suite (1-2 days)
**Goal:** Automated regression detection

**Changes:**
1. Create `/metrics/performance/` directory
2. Implement automated benchmarks
3. Test with real overlays (simple, medium, complex)
4. Measure average and max frame times
5. Set up alerts for regressions

**Files:**
- `metrics/performance/benchmark.js` (new)
- `metrics/performance/test-overlays/` (new)
- `metrics/performance/README.md` (new)

### Phase 4: Testing & Validation (1 day)
**Goal:** Ensure no regressions

**Changes:**
1. Manual testing of all editor features
2. Verify drag, resize, rotate, snap, guides
3. Test with complex overlays (10+ elements)
4. Verify OBS preview still works
5. Test performance mode still works

---

## Success Metrics

### Before Refactor:
- Drag FPS: 4-10 FPS (laggy)
- Average frame time: 100-250ms
- Maximum frame time: 500ms+
- React re-renders per drag: 100+

### After Refactor (Target):
- Drag FPS: 60 FPS (smooth)
- Average frame time: <16.67ms
- Maximum frame time: <33ms
- React re-renders per drag: 0 (only on drag stop)

---

## Key Takeaways from Figma

1. **Don't use React state for continuous operations** (drag, zoom, pan)
2. **Transform containers, not individual elements** (O(1) vs O(n))
3. **Memoize everything** that doesn't need to update
4. **Measure performance automatically** on every commit
5. **Test with real documents**, not synthetic benchmarks
6. **Track both average and max frame times** to catch hitching

---

## Next Steps

1. ✅ Research Figma's patterns (DONE)
2. ⏭️ Create comprehensive test suite (NEXT)
3. ⏭️ Implement drag layer refactor
4. ⏭️ Add memoization
5. ⏭️ Validate and measure

---

**References:**
- [Figma, faster 🏎](https://www.figma.com/blog/figma-faster/)
- [React at 60fps: improving scrolling comments](https://figma.com/blog/improving-scrolling-comments-in-figma)
- [Keeping Figma Fast](https://www.figma.com/blog/keeping-figma-fast/)
