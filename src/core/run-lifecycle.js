/** @typedef {{ destroy: () => void }} DisposableEntity */
/** @typedef {{ mesh?: { geometry?: { dispose: () => void }, material?: { dispose: () => void }, parent?: { remove: (node: unknown) => void } } }} DisposableConnection */
/** @typedef {{ children: unknown[], remove: (node: unknown) => void }} DisposableGroup */

let epoch = 0;
const pendingTimers = new Set();

export function beginRunEpoch() {
  epoch += 1;
  for (const timerId of pendingTimers) clearTimeout(timerId);
  pendingTimers.clear();
  return epoch;
}

export function getRunEpoch() {
  return epoch;
}

export function scheduleForRun(callback, delayMs) {
  const scheduledEpoch = epoch;
  const timerId = setTimeout(() => {
    pendingTimers.delete(timerId);
    if (scheduledEpoch === epoch) callback();
  }, Math.max(0, delayMs));
  pendingTimers.add(timerId);
  return timerId;
}

/**
 * @param {{ services: DisposableEntity[], requests: DisposableEntity[], connections: DisposableConnection[], groups: DisposableGroup[] }} input
 */
export function disposeRunScene({ services, requests, connections, groups }) {
  for (const entity of [...services, ...requests]) {
    try {
      entity.destroy();
    } catch {
      // Cleanup is best-effort: a malformed entity cannot retain its peers.
    }
  }

  for (const connection of [...connections]) {
    const mesh = connection.mesh;
    if (!mesh) continue;

    try {
      mesh.geometry?.dispose();
    } catch {
      // Continue disposing the rest of the connection and scene.
    }
    try {
      mesh.material?.dispose();
    } catch {
      // Continue disposing the rest of the connection and scene.
    }
    try {
      mesh.parent?.remove(mesh);
    } catch {
      // A detached mesh still must not block other cleanup.
    }
  }

  for (const group of [...groups]) {
    for (const child of [...group.children]) {
      try {
        group.remove(child);
      } catch {
        // Remove every child independently when a group is partly malformed.
      }
    }
  }
}
