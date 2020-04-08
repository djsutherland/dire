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


////////////////////////////////////////////////////////////////////////////////
// The Express app to specify the HTML server bit; pretty standard.

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
  res.redirect(`/play/${nick}/`);
});

app.get('/play/:nickname/', (req, res) => {
  res.render('player', {
    title: 'Dicer: Dice for DIE &ndash; Player View',
    nickname: req.params.nickname,
    role: 'player'
  });
});

app.get('/GM/:nickname/', (req, res) => {
  res.render('GM', {
    title: 'Dicer: Dice for DIE &ndash; GM View',
    nickname: req.params.nickname,
    role: 'GM'
  });
});


////////////////////////////////////////////////////////////////////////////////
// Define the webserver object here; we'll .listen() at the end.

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


////////////////////////////////////////////////////////////////////////////////
// The websocket server, which actually talks to the client page.

const socketserver = new WebSocket.Server({server: webserver});

// keep-alive stuff, basically from the ws readme
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


// the core of the server
let rollsLog = [];
let extraDice = new Map();
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

function handleRoll(data, source) {
  let dice = data.dice || [];
  let sides = dice.map(d => sidesByKind[d]);
  let rolls = sides.map(s => Math.floor(Math.random() * s) + 1);
  var result = {
    action: "results",
    nickname: source.nickname,
    role: source.role,
    dice: dice,
    rolls: rolls,
    sides: sides,
    time: Date.now()
  };
  rollsLog.push(result);
  response = JSON.stringify([result]);
  socketserver.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(response);
    }
  });
}

function getUserData() {
  let users = {};
  for (let [nickname, extras] of extraDice) {
    users[nickname] = {
      nickname: nickname,
      role: "player",
      conns: 0,
      extraDice: extras
    };
  }

  for (let client of socketserver.clients) {
    let key = client.nickname + (client.role !== 'player' ? ` (${client.role})` : '');
    if (!(key in users)) {
      users[key] = {
        nickname: client.nickname,
        role: client.role,
        conns: 0,
        extraDice: []
      };
    }
    if (client.readyState === WebSocket.OPEN) {
      users[key].conns++;
    }
  }
  return Object.values(users).sort((a, b) => {
    if (a.role == "GM" && b.role == "player") {
      return -1;
    } else if (a.role == "player" && b.role == "GM") {
      return 1;
    }
    let aName = a.nickname.toLowerCase(),
        bName = b.nickname.toLowerCase();
    if (aName < bName) {
      return -1;
    } else if (aName > bName) {
      return 1;
    } else {
      return 0;
    }
  });
}

function tellAboutClients() {
  let userData = getUserData();
  let msg = JSON.stringify([{action: "users", users: userData}]);
  for (let client of socketserver.clients) {
    if (client.readyState === WebSocket.OPEN && client.role == "GM") {
      client.send(msg);
    }
  }
}

// Hook up the actual responses
socketserver.on('connection', ws => {
  ws.on('message', data => {
    data = JSON.parse(data);
    switch (data.action) {
      case "hello":
        ws.nickname = data.nickname;
        ws.role = data.role;
        console.log(`${ws.nickname} connected as ${ws.role}`);
        ws.send(JSON.stringify(rollsLog));
        tellAboutClients();
        break;
      case "roll":
        handleRoll(data, ws);
        break;
      default:
        console.log(`Unknown requested action - ${JSON.stringify(data)}`);
    }
  });
  ws.on('close', e => {
    tellAboutClients();
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


////////////////////////////////////////////////////////////////////////////////
// Finally start the real server.

webserver.listen(args.port, () => {
 console.log(`Express running → PORT ${webserver.address().port}`);
});
