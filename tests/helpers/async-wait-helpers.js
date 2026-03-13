/**
 * Async Wait Helpers
 * 
 * Provides robust async waiting mechanisms for tests to avoid timing-related flakiness.
 * These helpers use condition-based waiting instead of fixed delays.
 */

function sleep(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

/**
 * Wait for a condition to become true
 * 
 * @param {Function} predicate - Function that returns true when condition is met
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Maximum time to wait in milliseconds (default: 5000)
 * @param {number} options.interval - Check interval in milliseconds (default: 50)
 * @param {string} options.message - Custom error message
 * @returns {Promise<boolean>} - Resolves to true when condition is met
 * @throws {Error} - If timeout is reached before condition is met
 * 
 * @example
 * await waitForCondition(() => counter === 5, { timeout: 1000 });
 */
async function waitForCondition(predicate, options = {}) {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;
  const message = options.message || `Condition not met within ${timeout}ms`;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await predicate();
      if (result) {
        return true;
      }
    } catch (error) {
      // Predicate threw an error, continue waiting
      // This allows predicates that check for existence of properties
    }
    
    await sleep(interval);
  }

  throw new Error(message);
}

/**
 * Wait for a debouncer to finish processing
 * 
 * @param {Object} debouncer - EventDebouncer instance
 * @param {string} key - The debounce key to wait for
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Maximum time to wait (default: 5000)
 * @param {number} options.interval - Check interval (default: 50)
 * @returns {Promise<boolean>} - Resolves when debouncing is complete
 * 
 * @example
 * await waitForDebounce(debouncer, 'file-change', { timeout: 2000 });
 */
async function waitForDebounce(debouncer, key, options = {}) {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;

  return waitForCondition(
    () => !debouncer.isDebouncing(key),
    {
      timeout,
      interval,
      message: `Debouncer still processing key "${key}" after ${timeout}ms`
    }
  );
}

/**
 * Wait for a file system event from a watcher
 * 
 * @param {Object} watcher - FileWatcher instance
 * @param {string} eventType - Event type to wait for ('change', 'add', 'unlink', etc.)
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Maximum time to wait (default: 5000)
 * @param {Function} options.filter - Optional filter function for event data
 * @returns {Promise<any>} - Resolves with event data when event is received
 * 
 * @example
 * const data = await waitForFileSystemEvent(watcher, 'change', { timeout: 3000 });
 */
async function waitForFileSystemEvent(watcher, eventType, options = {}) {
  const timeout = options.timeout || 5000;
  const filter = options.filter || (() => true);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      watcher.off(eventType, handler);
      reject(new Error(`Event "${eventType}" not received within ${timeout}ms`));
    }, timeout);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    const handler = (data) => {
      if (filter(data)) {
        clearTimeout(timer);
        watcher.off(eventType, handler);
        resolve(data);
      }
    };

    watcher.on(eventType, handler);
  });
}

/**
 * Wait for multiple conditions to all become true
 * 
 * @param {Array<Function>} predicates - Array of predicate functions
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} - Resolves when all conditions are met
 * 
 * @example
 * await waitForAll([
 *   () => counter1 === 5,
 *   () => counter2 === 10
 * ], { timeout: 2000 });
 */
async function waitForAll(predicates, options = {}) {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;

  return waitForCondition(
    async () => {
      const results = await Promise.all(
        predicates.map(p => Promise.resolve(p()).catch(() => false))
      );
      return results.every(r => r === true);
    },
    {
      timeout,
      interval,
      message: `Not all conditions met within ${timeout}ms`
    }
  );
}

/**
 * Wait for any one of multiple conditions to become true
 * 
 * @param {Array<Function>} predicates - Array of predicate functions
 * @param {Object} options - Configuration options
 * @returns {Promise<number>} - Resolves with index of first true condition
 * 
 * @example
 * const index = await waitForAny([
 *   () => counter1 === 5,
 *   () => counter2 === 10
 * ], { timeout: 2000 });
 */
async function waitForAny(predicates, options = {}) {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (let i = 0; i < predicates.length; i++) {
      try {
        const result = await predicates[i]();
        if (result) {
          return i;
        }
      } catch (error) {
        // Continue checking other predicates
      }
    }
    
    await sleep(interval);
  }

  throw new Error(`No condition met within ${timeout}ms`);
}

/**
 * Wait for a value to stabilize (stop changing)
 * 
 * @param {Function} getValue - Function that returns the value to monitor
 * @param {Object} options - Configuration options
 * @param {number} options.stableFor - Time value must remain stable (default: 500)
 * @param {number} options.timeout - Maximum time to wait (default: 5000)
 * @param {number} options.interval - Check interval (default: 50)
 * @returns {Promise<any>} - Resolves with the stable value
 * 
 * @example
 * const finalValue = await waitForStable(() => counter, { stableFor: 300 });
 */
async function waitForStable(getValue, options = {}) {
  const stableFor = options.stableFor || 500;
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;
  const startTime = Date.now();

  let lastValue = await getValue();
  let stableStartTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await sleep(interval);
    
    const currentValue = await getValue();
    
    if (currentValue === lastValue) {
      // Value hasn't changed
      if (Date.now() - stableStartTime >= stableFor) {
        return currentValue;
      }
    } else {
      // Value changed, reset stable timer
      lastValue = currentValue;
      stableStartTime = Date.now();
    }
  }

  throw new Error(`Value did not stabilize within ${timeout}ms`);
}

/**
 * Retry an async operation until it succeeds or timeout
 * 
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Configuration options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.delay - Delay between attempts in ms (default: 100)
 * @param {Function} options.shouldRetry - Function to determine if error is retryable
 * @returns {Promise<any>} - Resolves with operation result
 * 
 * @example
 * const result = await retryOperation(
 *   () => fetchData(),
 *   { maxAttempts: 5, delay: 200 }
 * );
 */
async function retryOperation(operation, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const delay = options.delay || 100;
  const shouldRetry = options.shouldRetry || (() => true);

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts && shouldRetry(error)) {
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

module.exports = {
  waitForCondition,
  waitForDebounce,
  waitForFileSystemEvent,
  waitForAll,
  waitForAny,
  waitForStable,
  retryOperation
};
