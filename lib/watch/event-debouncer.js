const EventEmitter = require('events');

/**
 * EventDebouncer - 事件防抖和节流器
 * 
 * 防止过度执行命令，通过防抖和节流机制控制事件触发频率
 */
class EventDebouncer extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      defaultDelay: config.defaultDelay || 2000,
      defaultThrottleLimit: config.defaultThrottleLimit || 5000,
      maxQueueSize: config.maxQueueSize || 100,
      ...config
    };
    
    // 防抖定时器
    this.debounceTimers = new Map();
    
    // 节流记录
    this.throttleRecords = new Map();
    
    // 事件队列
    this.eventQueue = [];
    
    // 统计信息
    this.stats = {
      eventsReceived: 0,
      eventsDebounced: 0,
      eventsThrottled: 0,
      eventsExecuted: 0,
      duplicatesDropped: 0
    };
  }

  /**
   * 防抖处理事件
   * 
   * @param {string} key - 事件键（通常是文件路径）
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟时间（毫秒）
   * @returns {void}
   */
  debounce(key, callback, delay = null) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    const actualDelay = delay !== null ? delay : this.config.defaultDelay;
    
    this.stats.eventsReceived++;

    // 清除之前的定时器
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
      this.stats.eventsDebounced++;
    }

    // 设置新的定时器
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.stats.eventsExecuted++;
      
      this.emit('execute', { key, type: 'debounce' });
      
      try {
        callback();
      } catch (error) {
        this.emit('error', { error, key, type: 'debounce' });
      }
    }, actualDelay);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    this.debounceTimers.set(key, timer);
  }

  /**
   * 节流处理事件
   * 
   * @param {string} key - 事件键
   * @param {Function} callback - 回调函数
   * @param {number} limit - 节流限制（毫秒）
   * @returns {boolean} 是否执行了回调
   */
  throttle(key, callback, limit = null) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    const actualLimit = limit !== null ? limit : this.config.defaultThrottleLimit;
    
    this.stats.eventsReceived++;

    const now = Date.now();
    const lastExecution = this.throttleRecords.get(key);

    // 检查是否可以执行
    if (!lastExecution || (now - lastExecution) >= actualLimit) {
      this.throttleRecords.set(key, now);
      this.stats.eventsExecuted++;
      
      this.emit('execute', { key, type: 'throttle' });
      
      try {
        callback();
        return true;
      } catch (error) {
        this.emit('error', { error, key, type: 'throttle' });
        return false;
      }
    } else {
      this.stats.eventsThrottled++;
      this.emit('throttled', { 
        key, 
        remainingTime: actualLimit - (now - lastExecution) 
      });
      return false;
    }
  }

  /**
   * 添加事件到队列（带去重）
   * 
   * @param {Object} event - 事件对象
   * @returns {boolean} 是否成功添加
   */
  enqueue(event) {
    if (!event || !event.key) {
      throw new Error('Event must have a key property');
    }

    // 检查队列大小
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      this.emit('queue:full', { 
        size: this.eventQueue.length,
        maxSize: this.config.maxQueueSize 
      });
      return false;
    }

    // 检查重复
    const isDuplicate = this.eventQueue.some(e => 
      e.key === event.key && 
      e.type === event.type &&
      JSON.stringify(e.data) === JSON.stringify(event.data)
    );

    if (isDuplicate) {
      this.stats.duplicatesDropped++;
      this.emit('duplicate:dropped', { event });
      return false;
    }

    // 添加到队列
    this.eventQueue.push({
      ...event,
      timestamp: Date.now()
    });

    this.emit('queue:added', { 
      event, 
      queueSize: this.eventQueue.length 
    });

    return true;
  }

  /**
   * 从队列中取出事件
   * 
   * @returns {Object|null} 事件对象
   */
  dequeue() {
    if (this.eventQueue.length === 0) {
      return null;
    }

    const event = this.eventQueue.shift();
    
    this.emit('queue:removed', { 
      event, 
      queueSize: this.eventQueue.length 
    });

    return event;
  }

  /**
   * 清除所有定时器和队列
   */
  clear() {
    // 清除所有防抖定时器
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // 清除节流记录
    this.throttleRecords.clear();

    // 清除队列
    const queueSize = this.eventQueue.length;
    this.eventQueue = [];

    this.emit('cleared', { 
      timersCleared: this.debounceTimers.size,
      queueCleared: queueSize 
    });
  }

  /**
   * 清除特定键的定时器
   * 
   * @param {string} key - 事件键
   */
  clearKey(key) {
    // 清除防抖定时器
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.delete(key);
    }

    // 清除节流记录
    this.throttleRecords.delete(key);

    // 从队列中移除
    const originalLength = this.eventQueue.length;
    this.eventQueue = this.eventQueue.filter(e => e.key !== key);
    const removed = originalLength - this.eventQueue.length;

    if (removed > 0) {
      this.emit('key:cleared', { key, eventsRemoved: removed });
    }
  }

  /**
   * 获取队列大小
   * 
   * @returns {number} 队列大小
   */
  getQueueSize() {
    return this.eventQueue.length;
  }

  /**
   * 获取队列内容
   * 
   * @returns {Array} 队列内容
   */
  getQueue() {
    return [...this.eventQueue];
  }

  /**
   * 获取活跃的防抖定时器数量
   * 
   * @returns {number} 定时器数量
   */
  getActiveTimers() {
    return this.debounceTimers.size;
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      activeTimers: this.debounceTimers.size,
      queueSize: this.eventQueue.length,
      throttleRecords: this.throttleRecords.size
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      eventsReceived: 0,
      eventsDebounced: 0,
      eventsThrottled: 0,
      eventsExecuted: 0,
      duplicatesDropped: 0
    };

    this.emit('stats:reset');
  }

  /**
   * 检查键是否在防抖中
   * 
   * @param {string} key - 事件键
   * @returns {boolean} 是否在防抖中
   */
  isDebouncing(key) {
    return this.debounceTimers.has(key);
  }

  /**
   * 检查键是否在节流中
   * 
   * @param {string} key - 事件键
   * @param {number} limit - 节流限制
   * @returns {boolean} 是否在节流中
   */
  isThrottled(key, limit = null) {
    const actualLimit = limit !== null ? limit : this.config.defaultThrottleLimit;
    const lastExecution = this.throttleRecords.get(key);
    
    if (!lastExecution) {
      return false;
    }

    const now = Date.now();
    return (now - lastExecution) < actualLimit;
  }
}

module.exports = EventDebouncer;
