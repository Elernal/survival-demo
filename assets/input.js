'use strict';
// Track one pointer per action. Cancellation always releases held controls.
function bindGameAction(button, onPress, onRelease = () => {}) {
  let pointer = null;
  const release = (event) => {
    if (event && event.pointerId !== pointer) return;
    pointer = null;
    button.classList.remove('pressed');
    onRelease();
  };
  button.addEventListener('pointerdown', event => {
    if (pointer !== null) return;
    event.preventDefault(); pointer = event.pointerId;
    button.setPointerCapture(pointer);
    button.classList.add('pressed'); onPress();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(name, release);
  }
  return () => release();
}
