const Express = require('express')
const fs = require('fs/promises')
const app = Express();
const config = require('../config');

async function main() {
  const fileNames = await fs.readdir('./serverlogs');
  const fileContents = await Promise.all(fileNames.map(async (fileName) => {
    const filePath = `./serverlogs/${fileName}`;
    const content = await fs.readFile(filePath, 'utf8');
    return {
      fileName,
      content
    };
  }));

  app.use('/stream', (req, res) => {
    // Pick a random file
    const { content, fileName} = fileContents[Math.floor(Math.random() * fileContents.length)];
    const logs = content.split('\n');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    })

    res.write('\n')

    setInterval(() => {
      const log = logs[Math.floor(Math.random() * logs.length)];
      const dataObject = {
        msg: log,
        date: new Date().toISOString(),
      }
      res.write(`event: logLine\n`)
      res.write(`data: ${JSON.stringify(dataObject)}\n\n`)
    }, getIntervalAmount())
  })

  app.listen(8080)
}

function getIntervalAmount() {
  return config.eventInterval - (config.eventInterval * Math.random())
}

main()
  .then(() => {
    console.log('Server started')
  })
  .catch(e => {
    console.error(e)
  });