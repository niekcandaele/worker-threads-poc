const {
  Worker, isMainThread, parentPort, workerData, threadId
} = require('worker_threads');

const EventSource = require('eventsource');
const handleLogLine = require('./handleLogLine');
const throttledFunction = require('./throttledFunction');
const config = require('../config');
const RATE_LIMIT_MINUTES = parseInt(process.env.SSE_RATE_LIMIT_MINUTES, 10) || 5;
const RATE_LIMIT_AMOUNT = parseInt(process.env.SSE_RATE_LIMIT_AMOUNT, 10) || 2500;

class SdtdSSE {
  constructor(server) {
    this.SSERegex = /\d+-\d+-\d+T\d+:\d+:\d+ \d+\.\d+ INF (.+)/;
    this.listener = throttledFunction(this.SSEListener.bind(this), RATE_LIMIT_AMOUNT, RATE_LIMIT_MINUTES);
    this.queuedChatMessages = [];
    this.lastMessage = Date.now();
  }

  get url() {
    return config.serverEndpoint;
  }

  async start() {
    this.eventSource = new EventSource(encodeURI(this.url));
    this.eventSource.reconnectInterval = 5000;
    this.eventSource.addEventListener('logLine', this.listener);
    this.eventSource.onerror = e => {
      console.error(e);
    };
    this.eventSource.onopen = () => {
      console.log(`[Worker ${threadId}] Opened a SSE channel`);
    };
  }

  async destroy() {
    if (!this.eventSource) {
      return;
    }
    this.eventSource.removeEventListener(this.listener);
    this.eventSource.close();
    this.eventSource = null;
  }

  async SSEListener(data) {
    this.lastMessage = Date.now();
    try {
      const parsed = JSON.parse(data.data);
      const messageMatch = this.SSERegex.exec(parsed.msg);
      if (messageMatch && messageMatch[1]) {
        parsed.msg = messageMatch[1];
      }
      const log = handleLogLine(parsed);
      log.threadId = threadId;
      if (log) {
        if (log.type === 'chatMessage' || log.data.msg.includes('-non-player-')) {
          return this.pushChatMessage(log);
        }

        await this.handleMessage(log);
      }
    } catch (error) {
      console.log(error.stack);
    }
  }

  handleMessage(log) {
    parentPort.postMessage(log)
  }

  /**
   * When a mod intercepts a chat message, it will send out two messages
   * One is the original chat message
   * and the other is the modified message
   * The modified message is not interesting to us, so we should ignore it
   * The original message will include all the data we need (steamId, chat text, ...)
   */
  async pushChatMessage(chatMessage) {
    const previouslyQueued = this.queuedChatMessages[this.queuedChatMessages.length - 1];
    if (previouslyQueued) {
      if (previouslyQueued.data.messageText === chatMessage.data.messageText) {
        previouslyQueued.type = 'logLine';
      }
      await this.handleMessage(previouslyQueued);
      await this.handleMessage(chatMessage);
      this.queuedChatMessages = [];
    } else {
      this.queuedChatMessages.push(chatMessage);
      // If a chatmessage does not get handled by a mod, we still need some way to react to it
      // This is achieved by setting a timeout
      // If no messages comes in before the timeout, it will send out the original chat message
      this.chatMsgLock = setTimeout(() => {
        const previouslyQueued = this.queuedChatMessages[this.queuedChatMessages.length - 1];
        this.queuedChatMessages = [];
        if (previouslyQueued) {
          return this.handleMessage(previouslyQueued);
        }
      }, 250);
    }
  };
}

async function main() {
  const sse = new SdtdSSE(workerData);
  await sse.start();
}


main()
  .then(() => {
    console.log(`[Worker ${threadId}] started`)
  })
  .catch(e => {
    console.error(e)
  });