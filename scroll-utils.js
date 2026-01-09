// Scroll utility functions

export function calculateScrollParams({ scrollHeight, windowHeight, duration }) {
  const totalScrollDistance = Math.max(0, scrollHeight - windowHeight);
  const scrollsPerSecond = 60; // 60fps target
  const totalFrames = duration * scrollsPerSecond;
  const pixelsPerFrame = totalScrollDistance / totalFrames;

  return {
    totalScrollDistance,
    scrollsPerSecond,
    pixelsPerFrame,
  };
}

export function createSmoothScrollFunction(totalDistance) {
  return (progress) => totalDistance * progress;
}
