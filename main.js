const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');
const config = require('./config');


function handleError(e) {
  // Try to restart worker if error is recoverable
  // Otherwise just exit out and let the user know it's broken  
  console.error(e);
}

const receivedEvents = {

}

function handleEvent(event) {
  // "loggingObject" is the thing that's used everywhere else in CSMM for listening to events. Bad name, I know :P
  // loggingObject.emit(event.type, event);
  //console.log(`[Worker ${event.threadId}] [${event.type}]`);

  if(!receivedEvents[event.threadId]) receivedEvents[event.threadId] = 0
  receivedEvents[event.threadId] += 1;
}

async function createConnection() {
  const worker = new Worker('./lib/gameconnector.js', {
    workerData: {foo: 'bar'},
  });

  worker.on('message', handleEvent);

  worker.on('error', handleError);
  worker.on('exit', (code) => {
    console.error(`[Worker ${worker.threadId}] stopped with exit code ${code}`);
  });
}

async function main() {
  for (let i = 0; i <= config.servers; i++) {
    await createConnection();
  }
}


main()
  .then(() => { })
  .catch(e => {
    console.error(e)
  })


setTimeout(() => {
  console.log(receivedEvents);
  console.log(`TOTAL EVENTS PROCESSED: ${Object.values(receivedEvents).reduce((a, b) => a + b, 0)}`);
  process.exit()
}, config.testDuration)