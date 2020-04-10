const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const minimist = require('minimist');
const WebSocket = require('ws');

const gameData = require('./src/game-data');
sidesByKind = gameData.sidesByKind;
classNames = gameData.classNames;


let args = minimist(process.argv, {
  'default': {port: 5000, debug: false},
  'boolean': ['debug'],
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
  res.render('gm', {
    title: 'Dicer: Dice for DIE &ndash; GM View',
    nickname: req.params.nickname,
    role: 'GM',
    classNames: classNames,
    sidesByKind: sidesByKind
  });
});


////////////////////////////////////////////////////////////////////////////////
// Define the webserver object here; we'll .listen() at the end.

var webserver;
if (args.ssl_key) {
  console.log("Running on https://");
  webserver = https.createServer({
    key: fs.readFileSync(args.ssl_key),
    cert: fs.readFileSync(args.ssl_cert)
  }, app);
  if (!args.port) { args.port = 443; }
} else {
  console.log("Running on http://; pass --ssl_cert and --ssl_key to use https");
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
let actionsLog = [];
let playerClasses = new Map();

let handlers = new Map();

handlers.set("hello", (data, source) => {
  source.nickname = data.nickname;
  source.role = data.role;

  if (source.role === 'player') {
    let cls = playerClasses.get(source.nickname);
    source.send(JSON.stringify([{
      action: 'getClass',
      class: cls || "none",
      className: classNames[cls]
    }]));
  }

  source.send(JSON.stringify(actionsLog));
  tellAboutClients();
});

handlers.set("roll", (data, source) => {
  let dice = data.dice || [];
  let sides = dice.map(
    d => sidesByKind[d === "class" ? playerClasses.get(source.nickname) : d]);
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
  actionsLog.push(result);
  let response = JSON.stringify([result]);
  for (let client of socketserver.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(response);
    }
  }
});

handlers.set("safety", (data, source) => {
  let is_anon = data.anon == "anon";
  let result = {
    action: "safety",
    nickname: is_anon ? "Anonymous" : source.nickname,
    role: is_anon ? "player" : source.role,
    text: data.text,
    choice: data.choice,
    time: Date.now()
  };
  actionsLog.push(result);
  let response = JSON.stringify([Object.assign({live: true}, result)]);
  for (let client of socketserver.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(response);
    }
  }
});

handlers.set("chat", (data, source) => {
  let result = {
    action: "chat",
    nickname: source.nickname,
    role: source.role,
    text: data.text,
    time: Date.now()
  };
  actionsLog.push(result);
  let response = JSON.stringify([result]);
  for (let client of socketserver.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(response);
    }
  }
});



handlers.set("setClass", (data, source) => {
  if (source.role != "GM") {
    console.error(`Attempt to set class by ${source.nickname} (${source.role}):`, data);
    return;
  }
  playerClasses.set(data.nickname, data.class);
  tellAboutClients();

  let msg = JSON.stringify([{action: "getClass", class: data.class}]);
  for (let client of socketserver.clients) {
    if (client.nickname == data.nickname && client.role == "player" &&
        client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
});


function getUserData() {
  let users = {};
  for (let [nickname, cls] of playerClasses) {
    users[nickname] = {
      nickname: nickname,
      role: "player",
      conns: 0,
      class: cls
    };
  }

  for (let client of socketserver.clients) {
    let key = client.nickname + (client.role !== 'player' ? ` (${client.role})` : '');
    if (!(key in users)) {
      users[key] = {
        nickname: client.nickname,
        role: client.role,
        conns: 0,
        class: client.role === "GM" ? "master" : "none"
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
    let aName = (a.nickname || "-").toLowerCase(),
        bName = (b.nickname || "-").toLowerCase();
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
    if (args.debug) {
      console.log(data);
    }
    if (handlers.has(data.action)) {
      handlers.get(data.action)(data, ws);
    } else {
      console.error(`Unknown requested action - ${JSON.stringify(data)}`);
    }
  });
  ws.on('close', e => {
    tellAboutClients();
  });
  ws.on('error', e => {
    switch (e.code) {
      case "ECONNRESET":
        break;
      default:
        console.error(`client ${ws.nickname || "[unknown]"} error: `, e);
        break;
    }
  });
});


////////////////////////////////////////////////////////////////////////////////
// Finally start the real server.

webserver.listen(args.port, () => {
 console.log(`Express running → PORT ${webserver.address().port}`);
});
