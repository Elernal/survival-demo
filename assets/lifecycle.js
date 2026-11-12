'use strict';
// One scheduler owns the simulation and rendering across all state transitions.
class GameLifecycle {
  state = 'Boot';
  frameId = null;
  last = 0;
  constructor(update, render, onError) {
    this.update = update; this.render = render; this.onError = onError;
  }
  setState(state) {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.state = state;
    document.documentElement.dataset.gameState = state;
    if (state === 'Playing') {
      this.last = performance.now();
      this.frameId = requestAnimationFrame(this.frame);
    }
  }
  frame = (now) => {
    this.frameId = null;
    if (this.state !== 'Playing') return;
    try {
      const dt = Math.min(.044, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.update(dt); this.render();
      if (this.state === 'Playing') this.frameId = requestAnimationFrame(this.frame);
    } catch (error) {
      this.setState('Error'); this.onError(error);
    }
  };
}
