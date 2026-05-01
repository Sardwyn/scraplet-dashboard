/**
 * Global Effect Coordinator
 * 
 * Consolidates all parametric effect RAF loops into a single global loop
 * to prevent RAF competition and reduce overhead.
 */

type EffectCallback = (timestamp: number) => void;

class GlobalEffectCoordinator {
  private rafId: number | null = null;
  private callbacks = new Set<EffectCallback>();
  private startTime = performance.now();

  register(callback: EffectCallback): () => void {
    this.callbacks.add(callback);
    
    // Start the loop if not already running
    if (this.rafId === null) {
      this.startLoop();
    }

    // Return unregister function
    return () => {
      this.callbacks.delete(callback);
      
      // Stop the loop if no more callbacks
      if (this.callbacks.size === 0 && this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    };
  }

  private startLoop() {
    const loop = (timestamp: number) => {
      this.rafId = requestAnimationFrame(loop);
      
      // Call all registered callbacks
      this.callbacks.forEach(callback => {
        try {
          callback(timestamp);
        } catch (error) {
          console.error('Effect callback error:', error);
        }
      });
    };
    
    this.rafId = requestAnimationFrame(loop);
  }

  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }

  getCallbackCount(): number {
    return this.callbacks.size;
  }
}

// Global singleton instance
export const globalEffectCoordinator = new GlobalEffectCoordinator();
