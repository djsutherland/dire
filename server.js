const _ = require('lodash');
const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const minimist = require('minimist');
const session = require('express-session');
const WebSocket = require('ws');

const gameData = require('./src/game-data');
sidesByKind = gameData.sidesByKind;
classNames = gameData.classNames;


let args = minimist(process.argv, {
  'default': {port: 5000, debug: false, session_secret: "don't die"},
  'boolean': ['debug'],
  'alias': {p: 'port'}
});


class DefaultMap extends Map {
  constructor(getDefault, ...args) {
    super(...args);
    this.default = getDefault;
  }

  get(key) {
    if (!this.has(key)) {
      this.set(key, this.default(key));
    }
    return super.get(key);
  }
}

// server data
let userData = new DefaultMap(username => { return {username: username}; });
let playerClasses = new Map();
let actionsLog = [];

////////////////////////////////////////////////////////////////////////////////
// The Express app to specify the HTML server bit; pretty standard.

const app = express();
app.set('view engine', 'pug');
app.set('query parser', 'extended');
app.use(express.urlencoded({extended: false}));
let sessionParser = session({
  secret: args.session_secret,
  resave: false,
  saveUninitialized: false,
  cookie: {},
});
app.use(sessionParser);

app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
  if (req.query.msg) {
    req.session.msg = req.query.msg;
    res.redirect('/');
    return;
  }

  let msg = req.session.msg;
  delete req.session.msg;

  res.render('index', {
    title: 'Dicer: Dice for DIE',
    msg: msg,
  });
});

app.post('/login/', (req, res) => {
  let username = req.body.username.trim();
  if (!username) {
    req.session.msg = "Please pick a better name than that.";
    res.redirect('/');
    return;
  }

  let conn = userData.get(username).connection;
  if (conn && conn.readyState === WebSocket.OPEN) {
    req.session.msg = `There's already a "${username}"; choose another name.`;
    res.redirect('/');
    return;
  }

  req.session.username = username;
  if (req.body.join_player) {
    res.redirect('/play/');
  } else {
    res.redirect('/GM/');
  }
});


function loginRequired(fn) {
  return (req, res) => {
    let username = req.session.username;
    if (!username) {
      req.session.msg = "Log in first.";
      res.redirect('/');
      return;
    }

    let conn = userData.get(username).connection;
    if (conn && conn.readyState === WebSocket.OPEN) {
      conn.send(JSON.stringify([{
        action: 'kick',
        reason: 'Someone else connected with the same username.',
      }]));
    }

    fn(req, res);
  };
}

app.get('/play/', loginRequired((req, res) => {
  res.render('player', {
    title: 'Dicer: Dice for DIE &ndash; Player View',
    username: req.session.username,
    role: 'player'
  });
}));

app.get('/GM/', loginRequired((req, res) => {
  res.render('gm', {
    title: 'Dicer: Dice for DIE &ndash; GM View',
    username: req.session.username,
    role: 'GM',
    classNames: classNames,
    sidesByKind: sidesByKind
  });
}));


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


// helpers to iterate over active connections

socketserver.activeClients = function*() {
  for (let client of this.clients)
    if (client.readyState === WebSocket.OPEN)
      yield client;
};

socketserver.activePlayers = function*() {
  for (let client of this.activeClients())
    if (userData.get(client.username).role === "player")
      yield client;
};

socketserver.activeGMs = function*() {
  for (let client of this.activeClients())
    if (userData.get(client.username).role === "GM")
      yield client;
};


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

// Some helpers

function sendAction(user, result) {
  let act = Object.assign({
    username: user.username,
    role: user.role,
    time: Date.now(),
  }, result);

  actionsLog.push(act);
  let response = JSON.stringify([act]);
  for (let client of socketserver.activeClients()) {
    client.send(response);
  }
}

function setUserClass(user, cls) {
  user.class = cls;
  let conn = user.connection;
  if (conn && conn.readyState === WebSocket.OPEN) {
    conn.send(JSON.stringify([{action: "getClass", class: user.class}]));
  }
  tellAboutUsers();
}



function checkUserAttr(attrname, attrval, fn) {
  return (data, source) => {
    let user = userData.get(source.username);
    if (user[attrname] !== attrval) {
      console.error(
        `Bad attempt by ${user.username} (${attrname} = ${user[attrname]}, expected ${attrval}):`,
        data);
      return;
    }
    fn(user, data, source);
  };
}
checkUserClass = (cls, fn) => checkUserAttr("class", cls, fn);
checkUserIsGM = fn => checkUserAttr("role", "GM", fn);


// the core of the server

let handlers = new Map();

handlers.set("hello", (data, source) => {
  source.username = data.username;
  let user = userData.get(source.username);
  user.role = data.role;
  user.connection = source;

  if (user.role === "player") {
    source.send(JSON.stringify([{action: 'getClass', class: user.class || "none"}]));
  }
  source.send(JSON.stringify(actionsLog));
  tellAboutUsers();
});


handlers.set("roll", (data, source) => {
  let user = userData.get(source.username);

  let dice = data.dice || [];
  let sides = dice.map(d => sidesByKind[d === "class" ? user.class : d]);
  let rolls = sides.map(s => Math.floor(Math.random() * s) + 1);

  sendAction(user, {action: "results", dice: dice, rolls: rolls, sides: sides});
});


handlers.set("safety", (data, source) => {
  let user = userData.get(source.username);
  let is_anon = data.anon == "anon";
  sendAction(
    is_anon ? {username: "Anonymous", role: "player"} : user,
    {action: "safety", text: data.text, choice: data.choice}
  );
});


handlers.set("chat", (data, source) => {
  sendAction(userData.get(source.username), {action: "chat", text: data.text});
});


handlers.set("setClass", checkUserIsGM((doer, data, source) => {
  setUserClass(userData.get(data.username), data.class);
}));

handlers.set("hand-die", checkUserClass('fool', (user, data, source) => {
  sendAction(user, {
    action: 'user-status',
    text: `${user.username} handed their die to the GM.`,
  });
  setUserClass(user, "fool_nodie");
}));

handlers.set("take-die", checkUserClass('fool_nodie', (user, data, source) => {
  sendAction(user, {
    action: 'user-status',
    text: `${user.username} took their die back from the GM.`,
  });
  setUserClass(user, "fool");
}));


handlers.set("kick", (data, source) => {
  let doer = userData.get(source.username);
  if (doer.role != "GM") {
    console.error(`Attempt to kick by ${doer.username} (${doer.role}):`, data);
    return;
  }
  let target = userData.get(data.username);
  if (target.connection && target.connection.readyState === WebSocket.OPEN) {
    target.connection.send(JSON.stringify([{action: "kick", reason: "Kicked by GM."}]));
    target.connection.close();
  }
});


handlers.set("delete", (data, source) => {
  let doer = userData.get(source.username);
  if (doer.role != "GM") {
    console.error(`Attempt to delete by ${doer.username} (${doer.role}):`, data);
    return;
  }
  userData.delete(data.username);
  tellAboutUsers();
});


function tellAboutUsers() {
  // there's no Map.map, even in lodash. :/
  let userInfo = [];
  for (let user of userData.values()) {
    if (user.username) {
      userInfo.push({
        username: user.username,
        role: user.role,
        connected: user.connection && user.connection.readyState === WebSocket.OPEN,
        class: user.role === "GM" ? "master" : (user.class || "none"),
      });
    }
  }
  userInfo = _.sortBy(userInfo, ['role', 'username']);

  let msg = JSON.stringify([{action: "users", users: userInfo}]);
  for (let client of socketserver.activeGMs()) {
    client.send(msg);
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
    if (ws.username) {
      delete userData.get(ws.username).connection;
    }
    tellAboutUsers();
  });
  ws.on('error', e => {
    switch (e.code) {
      case "ECONNRESET":
        break;
      default:
        console.error(`client ${ws.username || "[unknown]"} error: `, e);
        break;
    }
  });
});


////////////////////////////////////////////////////////////////////////////////
// Finally start the real server.

webserver.listen(args.port, () => {
 console.log(`Express running → PORT ${webserver.address().port}`);
});
