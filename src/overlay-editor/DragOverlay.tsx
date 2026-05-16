/**
 * DragController
 * 
 * Implements Figma's pattern: CSS transforms during drag, React state on stop
 * 
 * Key principles:
 * 1. During drag: Update CSS transforms only (no React re-render)
 * 2. On drag stop: Commit final positions to React state (single re-render)
 * 3. Transform parent container, not individual elements (O(1) vs O(n))
 * 
 * This achieves 60 FPS by avoiding React's reconciliation during drag
 * 
 * NOTE: This version works with react-rnd callbacks, not raw mouse events
 */

import { useRef, useCallback } from 'react';

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  initialPositions: Record<string, { x: number; y: number }>;
}

interface UseDragControllerOptions {
  /** Called when drag completes with final positions */
  onDragComplete: (finalX: number, finalY: number, dx: number, dy: number) => void;
}

export function useDragController({
  onDragComplete,
}: UseDragControllerOptions) {
  const dragStateRef = useRef<DragState | null>(null);
  const dragContainerRef = useRef<HTMLDivElement | null>(null);
  
  /**
   * Start drag operation (called from react-rnd onDragStart)
   * Stores initial position but doesn't update React state
   */
  const startDrag = useCallback((x: number, y: number, selectedIds: string[], elementsById: Record<string, any>) => {
    // Store initial positions
    const initialPositions: Record<string, { x: number; y: number }> = {};
    selectedIds.forEach(id => {
      const el = elementsById[id];
      if (el) {
        initialPositions[id] = { x: el.x ?? 0, y: el.y ?? 0 };
      }
    });
    
    dragStateRef.current = {
      isDragging: true,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      initialPositions,
    };
    
    // Notify media elements that drag is starting (pause video rendering)
    if (typeof window !== 'undefined' && (window as any).setMediaDragging) {
      (window as any).setMediaDragging(true);
    }
  }, []);
  
  /**
   * Update drag position (called from react-rnd onDrag)
   * Uses CSS transform only - NO React state update
   */
  const updateDrag = useCallback((x: number, y: number) => {
    if (!dragStateRef.current?.isDragging) return;
    
    const dx = x - dragStateRef.current.startX;
    const dy = y - dragStateRef.current.startY;
    
    // Update CSS transform (GPU-accelerated, no layout)
    if (dragContainerRef.current) {
      dragContainerRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
      dragContainerRef.current.style.willChange = 'transform';
    }
    
    dragStateRef.current.currentX = x;
    dragStateRef.current.currentY = y;
  }, []);
  
  /**
   * End drag operation (called from react-rnd onDragStop)
   * Commits final positions to React state (single re-render)
   */
  const endDrag = useCallback((finalX: number, finalY: number) => {
    if (!dragStateRef.current?.isDragging) return;
    
    const { startX, startY } = dragStateRef.current;
    const dx = finalX - startX;
    const dy = finalY - startY;
    
    // Reset CSS transform
    if (dragContainerRef.current) {
      dragContainerRef.current.style.transform = '';
      dragContainerRef.current.style.willChange = '';
    }
    
    // Notify media elements that drag is done
    if (typeof window !== 'undefined' && (window as any).setMediaDragging) {
      (window as any).setMediaDragging(false);
    }
    
    // Commit to React state (single re-render)
    onDragComplete(finalX, finalY, dx, dy);
    
    dragStateRef.current = null;
  }, [onDragComplete]);
  
  /**
   * Cancel drag operation
   * Resets without committing
   */
  const cancelDrag = useCallback(() => {
    if (!dragStateRef.current?.isDragging) return;
    
    // Reset CSS transform
    if (dragContainerRef.current) {
      dragContainerRef.current.style.transform = '';
      dragContainerRef.current.style.willChange = '';
    }
    
    // Notify media elements
    if (typeof window !== 'undefined' && (window as any).setMediaDragging) {
      (window as any).setMediaDragging(false);
    }
    
    dragStateRef.current = null;
  }, []);
  
  return {
    dragContainerRef,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    isDragging: dragStateRef.current?.isDragging ?? false,
  };
}
