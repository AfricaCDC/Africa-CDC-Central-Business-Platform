// ── sync-service in-process mutex ──
//
// Single-instance concurrency guard for sync jobs (T-12). Prevents a manual
// trigger and the scheduled cron from running the same job twice in parallel.
//
// DEPLOYMENT ASSUMPTION: sync-service runs as a SINGLE instance. If this
// assumption ever changes, replace this with a MySQL row-lock (`SELECT ...
// FOR UPDATE`) or a Redis `SETNX` leader election — see T-05 FOLLOW_UP.

/**
 * Create a named mutex. `tryAcquire()` returns a release function if the lock
 * is free, or `null` if it is already held by someone else.
 *
 * @param {string} name
 * @returns {{ tryAcquire: () => (null | (() => void)), isLocked: () => boolean, heldBy: () => string | null }}
 */
function createMutex(name) {
  let locked = false;
  let holder = null;

  return {
    tryAcquire(holderId) {
      if (locked) return null;
      locked = true;
      holder = holderId || 'anonymous';
      let released = false;
      return function release() {
        if (released) return;
        released = true;
        locked = false;
        holder = null;
      };
    },
    isLocked() {
      return locked;
    },
    heldBy() {
      return holder;
    },
    name,
  };
}

module.exports = { createMutex };
