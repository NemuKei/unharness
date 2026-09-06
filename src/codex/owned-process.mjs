const SHUTDOWN_GRACE_MS = 250;

export function trackOwnedProcess(child) {
  let closed = false;
  const closePromise = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      closed = true;
      resolve({ code, signal });
    });
  });
  return {
    closePromise,
    get closed() { return closed; },
  };
}

function settlesWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(false);
    }, timeoutMs);
    promise.then(() => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve(true);
    });
  });
}

function isRunning(child, tracker) {
  return !tracker.closed && child.exitCode === null && child.signalCode === null;
}

export async function shutDownOwnedProcess(child, tracker, requestGracefulShutdown) {
  if (tracker.closed) return tracker.closePromise;

  try {
    requestGracefulShutdown();
  } catch {
    // The close tracker determines whether escalation is still necessary.
  }
  if (await settlesWithin(tracker.closePromise, SHUTDOWN_GRACE_MS)) return tracker.closePromise;

  if (isRunning(child, tracker)) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Await the process close below; kill errors never expose child details.
    }
  }
  return tracker.closePromise;
}
