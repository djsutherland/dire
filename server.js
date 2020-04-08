const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const minimist = require('minimist');
const WebSocket = require('ws');

let args = minimist(process.argv, {
  'default': {port: 5000, socket_port: 5001},
  'alias': {p: 'port'}
});

const app = express();
app.set('view engine', 'pug');
app.use(express.urlencoded({extended: false}));

app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  res.render('index', {
    title: 'Dicer: Dice for DIE'
  });
});

app.post('/login/', (req, res) => {
  var nick = req.body.nickname;
  res.redirect(`/roll/${nick}/`);
});

app.get('/roll/:nickname/', (req, res) => {
  res.render('roll', {
    title: 'Dicer: Dice for DIE',
    nickname: req.params.nickname
  });
});


var webserver;
if (args.ssl_key) {
  webserver = https.createServer({
    key: fs.readFileSync(args.ssl_key),
    cert: fs.readFileSync(args.ssl_cert)
  }, app);
  if (!args.port) { args.port = 443; }
} else {
  webserver = http.createServer(app);
  if (!args.port) { args.port = 80; }
}

const socketserver = new WebSocket.Server({server: webserver});

function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
const sidesByKind = {
  dictator: 4,
  d6: 6,
  bad: 6,
  fool: 6,
  knight: 8,
  neo: 10,
  godbinder: 12,
  master: 20
};

function noop() {}
function heartbeat() { this.isAlive = true; }

socketserver.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
});

const interval = setInterval(() => {
  socketserver.clients.forEach(ws => {
    if (ws.isAlive === false) {
      return ws.terminate();
    } else {
      ws.isAlive = false;
      ws.ping(noop);
    }
  });
}, 15000);

socketserver.on('close', () => { clearInterval(interval); });


socketserver.on('connection', ws => {
  ws.on('message', data => {
    data = JSON.parse(data);
    switch (data.action) {
      case "hello":
        ws.nickname = data.nickname;
        console.log(`${ws.nickname} connected`);
        break;

      case "roll":
        let dice = data.dice || [];
        let sides = dice.map(d => sidesByKind[d]);
        let rolls = sides.map(roll);
        var response = JSON.stringify({
          action: "results",
          nickname: ws.nickname,
          dice: dice,
          rolls: rolls,
          sides: sides,
          time: Date.now()
        });
        socketserver.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(response);
          }
        });
        break;

      default:
        console.log(`Unknown requested action - ${data}`);
    }
  });
  ws.on('close', e => {
    console.log(`${ws.nickname || "[unknown]"} disconnected`);
  });
  ws.on('error', e => {
    switch (e.code) {
      case "ECONNRESET":
        break;
      default:
        console.log(`client ${ws.nickname || "[unknown]"} error: ${e}`);
        break;
    }
  });
});

webserver.listen(args.port, () => {
 console.log(`Express running → PORT ${webserver.address().port}`);
});

// webserver.listen(args.socket_port);
// console.log(`Socket server running → PORT ${args.socket_port}`);
