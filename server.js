const _ = require('lodash');
const express = require('express');
const fs = require('fs');
const splitGraphemes = (new require('grapheme-splitter')()).splitGraphemes;
const http = require('http');
const https = require('https');
const level = require('level');
const minimist = require('minimist');
const session = require('express-session');
const LevelStore = require('level-session-store')(session);
const WebSocket = require('ws');

const gameData = require('./src/game-data');
sidesByKind = gameData.sidesByKind;
classNames = gameData.classNames;

const foolDefaultGood = '😲';
const foolDefaultBad = '💩';

const args = minimist(process.argv, {
  'default': {port: 5000, debug: false, db: './leveldb'},
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

// server global data
let settings = {},
    userData = new DefaultMap(username => { return {username: username}; }),
    actionsLog;

function ifNotFound(f = () => {}) {
  return err => {
    if (err && err.notFound) {
      return Promise.resolve(f());
    } else {
      throw err;
    }
  };
}

function initializeFromDB(db) {
  return Promise.all([
    db.get('settings/allowMultipleGMs')
      .then(v => settings.allowMultipleGMs = JSON.parse(v))
      .catch(ifNotFound(() => { settings.allowMultipleGMs = true; })),

    db.get('usernames')
      .then(names => {
        names = JSON.parse(names);
        console.log('names', names)
        return Promise.all(
          names.map(n => {
            return db.get(`users/${n}`)
                     .then(JSON.parse)
                     .catch(ifNotFound(() => { return {username: n}; }))
                     .then(d => { delete d.connection; userData.set(n, d); });
          })).then(() => {
            console.log(`Loaded data for ${names.length} users.`);
          });
      }).catch(ifNotFound(() => { console.log("No user data found."); })),

    db.get('n-actions')
      .then(nTotal => {
        nTotal = parseInt(nTotal, 10);
        actionsLog = new Array(nTotal);
        return Promise.all(_.range(nTotal).map(n => {
          return db.get(`actions/${n}`).then(a => actionsLog[n] = JSON.parse(a));
        })).then(() => {
          console.log(`Loaded data for ${nTotal} actions.`);
        });
      })
      .catch(ifNotFound(() => { actionsLog = []; console.log("No action data found."); })),
  ]);
}


////////////////////////////////////////////////////////////////////////////////
// Some processing to handle sessions.

function getSessionSecret(db) {
  return db.get("session_secret")
    .catch(err => {
      if (err && err.notFound) {
        let secret = require('crypto-random-string')({length: 12, type: 'base64'});
        db.put("session_secret", secret);
        return secret;
      } else {
        throw err;
      }
    });
}

function buildSessionParser(session_secret, db) {
  // ensure the db has the length key, since LevelStore doesn't make it properly
  const key = '_session/__length__';
  return db.get(key)
    .catch((err, length) => {
      if (err && err.type !== 'NotFoundError') { throw err; }
      length = parseInt(length, 10) || 0;
      db.put(key, length);
    })
    .then(length => {
      return session({
        secret: session_secret,
        resave: false,
        saveUninitialized: false,
        cookie: {},
        store: new LevelStore(db),
      });
    });
}


////////////////////////////////////////////////////////////////////////////////
// The Express app to specify the HTML server bit; pretty standard.

function buildExpressApp(sessionParser) {
  const app = express();
  app.set('view engine', 'pug');
  app.set('query parser', 'extended');
  app.use(express.urlencoded({extended: false}));
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
      title: 'DIRE, the DIE Internet Rolling Experience',
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
      if (!settings.allowMultipleGMs) {
        let active = getActiveGMs();
        if (active.length) {
            req.session.msg = `There's already a GM (${active[0].username}),
              and they're not allowing other GMs right now.`;
            res.redirect('/');
            return;
        }
      }
      res.redirect('/GM/');
    }
  });

  function getActiveGMs(not) {
    let res = [];
    for (let [key, user] of userData) {
      if (key == not) {
        continue;
      }
      if (user.role === "GM" && user.connection &&
          user.connection.readyState === WebSocket.OPEN) {
        res.push(user);
      }
    }
    return res;
  }

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
        let msg = JSON.stringify([{
          action: 'kick',
          reason: 'You logged in somewhere else.',
        }]);
        if (args.debug)
          console.log(`Sending ${username}:`, msg);
        conn.send(msg);
      }

      fn(req, res);
    };
  }

  app.get('/play/', loginRequired((req, res) => {
    res.render('player', {
      title: `DIRE - Playing`,
      username: req.session.username,
      role: 'player'
    });
  }));

  app.get('/GM/', loginRequired((req, res) => {
    if (!settings.allowMultipleGMs) {
      let others = getActiveGMs(req.session.username);
      if (others.length > 0) {
        req.session.msg = `There's already a GM (${others[0].username}),
          and they're not allowing other GMs right now.`;
        res.redirect('/');
        return;
      }
    }

    res.render('gm', {
      title: `DIRE – GMing`,
      username: req.session.username,
      role: 'GM',
      classNames: classNames,
      sidesByKind: sidesByKind,
      allowMultipleGMs: settings.allowMultipleGMs,
    });
  }));

  return Promise.resolve(app);
}


////////////////////////////////////////////////////////////////////////////////
// Build the webserver object, to be used by the websocket server.

function buildWebserver(express_app) {
  if (args.ssl_key) {
    console.log("Running on https://");
    if (!args.port) { args.port = 443; }
    return Promise.resolve(https.createServer({
      key: fs.readFileSync(args.ssl_key),
      cert: fs.readFileSync(args.ssl_cert)
    }, express_app));
  } else {
    console.log("Running on http://; pass --ssl_cert and --ssl_key to use https");
    if (!args.port) { args.port = 80; }
    return Promise.resolve(http.createServer(express_app));
  }
}


////////////////////////////////////////////////////////////////////////////////
// The websocket server, which actually talks to the client page.

function buildSocketServer(webserver) {
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

  socketserver.tellGMsOne = function(msg) {
    if (args.debug)
      console.log(`Broadcasting to GMs:`, msg);

    let str = JSON.stringify([msg]);
    for (let client of this.activeGMs()) {
      client.send(str);
    }
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
    db.put(`actions/${actionsLog.length - 1}`, JSON.stringify(act));
    db.put('n-actions', actionsLog.length);

    if (args.debug)
      console.log(`Broadcasting action:`, act);

    let msg = JSON.stringify([act]);
    for (let client of socketserver.activeClients()) {
      if (!act.private || client.role === "GM" || client.username === act.username) {
        client.send(msg);
      }
    }
  }

  function sendUserOne(user, msg) {
    let conn = user.connection;
    if (conn && conn.readyState === WebSocket.OPEN) {
      if (args.debug)
        console.log(`Sending to ${user.username}:`, msg);

      conn.send(JSON.stringify([msg]));
    }
  }

  function tellGMsAboutUsers() {
    let userInfo = [];
    for (let user of userData.values()) {
      let res = userDataForSending(user);
      if (res) {
        userInfo.push(res);
      }
    }
    userInfo = _.sortBy(userInfo, ['role', 'username']);
    socketserver.tellGMsOne({action: "users", users: userInfo});
  }

  function fillDefaults(user) {
    if (user.class === undefined) {
      user.class = "none";
    }
    switch (user.class) {
      case "fool":
        if (user.dieWithGM === undefined) {
          user.dieWithGM = false;
        }
        if (user.foolVariant === undefined) {
          user.foolVariant = "1.1";
        }
        if (user.foolDie === undefined) {
          if (user.foolVariant == "1.1") {
            user.foolDie = {
              symbol: "?",
              side: 0,
            };
          } else {
            if (user.foolVariant != "1.2") {
              if (user.foolVariant) {
                console.error(`Unknown fool variant ${user.foolVariant}; assuming 1.2`);
              }
              user.foolVariant = "1.2";
            }
            user.foolDie = {
              posSymbol: foolDefaultGood,
              negSymbol: foolDefaultBad,
              sides: [".", ".", ".", ".", ".", "."],
              effect: "Your opponent gets talking and confesses something useful to you.",
            };
          }
        }
        break;
    }
  }

  function userDataForSending(user) {
    if (!user.role) return null;
    fillDefaults(user);
    let res = {
      username: user.username,
      role: user.role,
      connected: user.connection && user.connection.readyState === WebSocket.OPEN,
      class: user.class,
    };
    switch (user.class) {
      case "fool":
        res.dieWithGM = user.dieWithGM;
        res.foolVariant = user.foolVariant;
        res.foolDie = user.foolDie;
        break;
      case "dictator":
        res.dieWithGM = user.dieWithGM;
        break;
    }
    return res;
  }

  function refreshUserData(user) {
    sendUserOne(user, Object.assign({action: "getUserData"}, userDataForSending(user)));
    tellGMsAboutUsers();

    db.put('usernames', JSON.stringify([...userData.keys()]));
    db.put(`users/${user.username}`, JSON.stringify(
        Object.assign({}, user, {connection: undefined})));
  }


  function checkUserAttr(attrname, test, fn) {
    return (data, source) => {
      let user = userData.get(source.username);
      fillDefaults(user);
      if (!test(user[attrname])) {
        console.error(
          `Bad attempt by ${user.username} (${attrname} = ${user[attrname]}):`,
          data);
        return;
      }
      fn(user, data, source);
    };
  }
  checkUserClass = (cls, fn) => checkUserAttr("class", c => c == cls, fn);
  checkUserClassIn = (classes, fn) => checkUserAttr("class", c => classes.includes(c), fn);
  checkUserIsGM = fn => checkUserAttr("role", r => r == "GM", fn);


  // the core of the server

  let handlers = new Map();

  handlers.set("hello", (data, source) => {
    source.username = data.username;
    let user = userData.get(source.username);
    user.role = data.role;
    user.connection = source;

    let theLog;
    if (user.role === "player") {
      refreshUserData(user);
      theLog = _.filter(actionsLog, e => !e.private || e.username === user.username);
    } else {
      tellGMsAboutUsers();
      theLog = actionsLog;
    }

    if (args.debug)
      console.log(`Sending ${source.username} the action log (length ${theLog.length})`);
    source.send(JSON.stringify(theLog));
  });


  function getRollStatus(roll) {
    if (roll >= 6) {
      return "special";
    } else if (roll >= 4) {
      return "success";
    } else if (roll == 1) {
      return "fail-threat";
    } else {
      return "fail";
    }
  }

  handlers.set("roll", (data, source) => {
    let user = userData.get(source.username);
    fillDefaults(user);

    let rolls = (data.dice || []).map(d => {
      let res = {};
      res.kind = d === "class" ? user.class : d;
      res.sides = sidesByKind[res.kind];
      res.roll = Math.floor(Math.random() * res.sides) + 1;

      switch (res.kind) {
        case "bad":
          res.status = res.roll >= 4 ? "badness" : "nothing";
          break;
        case "fool":
          [res.display, res.status] = getFoolDisplay(user, res.roll);
          break;
        case "dictator":
        case "knight":
          res.status = "n/a";
          break;
        case "neo":
          if (res.roll == 10) {
            res.status = "special neo-break";
            // TODO: is a 0 >= 6?
          } else {
            res.status = getRollStatus(res.roll);
          }
          break;
        default:
          res.status = getRollStatus(res.roll);
          break;
      }

      return res;
    });

    sendAction(user, {action: "rolls", rolls: rolls});
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
  handlers.set("user-status", (data, source) => {
    sendAction(userData.get(source.username), {action: "user-status", text: data.text});
  });


  handlers.set("set-class", checkUserIsGM((doer, data, source) => {
    let target = userData.get(data.username);
    target.class = data.class;
    refreshUserData(target);
  }));

  handlers.set("fool-set-variant", checkUserIsGM((doer, data, source) => {
    let target = userData.get(data.username);
    if (target.foolVariant != data.foolVariant) {
      target.foolVariant = data.foolVariant;
      delete target.foolDie;  // different format...
      refreshUserData(target);
    }
  }));

  let dieHanders = ['fool', 'dictator'];
  handlers.set("player-hand-die", checkUserClassIn(dieHanders, (user, data, source) => {
    if (!user.dieWithGM) {
      user.dieWithGM = true;
      sendAction(user, {action: 'user-status', text: `${user.username} handed their die to the GM.`});
      refreshUserData(user);
    }
  }));
  handlers.set("player-take-die", checkUserClassIn(dieHanders, (user, data, source) => {
    if (user.dieWithGM) {
      user.dieWithGM = false;
      sendAction(user, {action: 'user-status', text: `${user.username} took their die back from the GM.`});
      refreshUserData(user);
    }
  }));

  handlers.set("gm-take-die", checkUserIsGM((doer, data, source) => {
    let user = userData.get(data.username);
    if (dieHanders.includes(user.class) && !user.dieWithGM) {
      user.dieWithGM = true;
      sendAction(doer, {action: 'user-status', text: `The GM took ${user.username}'s die.`});
      refreshUserData(user);
    }
  }));
  handlers.set("gm-return-die", checkUserIsGM((doer, data, source) => {
    let user = userData.get(data.username);
    if (dieHanders.includes(user.class) && user.dieWithGM) {
      user.dieWithGM = false;
      sendAction(doer, {action: 'user-status', text: `The GM gave ${user.username} back their die.`});
      refreshUserData(user);
    }
  }));


  function checkFoolSymbol(s, def=foolDefaultGood) {
    if (!s)
      return def;
    let wanted = splitGraphemes(s.trim())[0];
    if (Number.isInteger(parseInt(wanted, 10))) {
      return def;  // can't write numbers, lol
    } else {
      return wanted;
    }
  }

  function getFoolDisplay(user, i) {
    fillDefaults(user);
    if (user.foolVariant == "1.1") {
      if (i == user.foolDie.side) {
        return [user.foolDie.symbol, "special"];
      } else {
        return [i, getRollStatus(i)];
      }
    } else {
      switch (user.foolDie ? user.foolDie.sides[i - 1] : ".") {
        case "+":
          return [`${i}→${user.foolDie.posSymbol}`, `${getRollStatus(i)}`];
        case "-":
          return [`${i}→${user.foolDie.negSymbol}`, `${getRollStatus(i)}`];
        default:
          console.error(`Invalid fool sides value ${user.foolDie.sides[i-1]}`);
          /* falls through */
        case ".":
          return [i, getRollStatus(i)];
      }
    }
  }

  handlers.set("fool-set-die", checkUserClass('fool', (user, data, source) => {
    let extraText = '';
    if (user.foolVariant == "1.1") {
      user.foolDie = {
        symbol: checkFoolSymbol(data.symbol),
        side: data.side,
      };
    } else {
      user.foolDie = {
        posSymbol: checkFoolSymbol(data.posSymbol),
        negSymbol: checkFoolSymbol(data.negSymbol, foolDefaultBad),
        sides: data.sides,
        effect: data.effect.trim(),
      };
      extraText = ` Effect: ${user.foolDie.effect}`;
    }

    let valDisplay = _.range(6).map(i => getFoolDisplay(user, i + 1)[0]);
    let text = `${user.username} scribbled on their die: ${valDisplay.join(" / ")}.` + extraText;
    sendAction(user, {action: 'user-status', text: text, private: true});
    refreshUserData(user);
  }));


  handlers.set("kick", checkUserIsGM((doer, data, source) => {
    sendUserOne(userData.get(data.username), {action: "kick", reason: "Kicked by GM."});
  }));


  handlers.set("delete", checkUserIsGM((doer, data, source) => {
    let conn = userData.get(data.username).connection;
    if (conn && conn.readyState === WebSocket.OPEN) {
      console.error(`Attempt to delete active user ${data.username}:`, data);
      return;
    }

    userData.delete(data.username);
    tellGMsAboutUsers();
    db.del(`users/${data.username}`);
    db.put('usernames', JSON.stringify([...userData.keys()]));
  }));


  handlers.set("allowMultipleGMs", checkUserIsGM((user, data, source) => {
    settings.allowMultipleGMs = data.value;
    socketserver.tellGMsOne({action: 'allowMultipleGMs', value: data.value});
  }));



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
      tellGMsAboutUsers();
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

  return Promise.resolve(socketserver);
}


////////////////////////////////////////////////////////////////////////////////
// Finally, actually do stuff.

const db = level(args.db);
initializeFromDB(db)
  .then(() => getSessionSecret(db))
  .then(sessionSecret => buildSessionParser(sessionSecret, db))
  .then(sessionParser => buildExpressApp(sessionParser))
  .then(expressApp => buildWebserver(expressApp))
  .then(webserver => buildSocketServer(webserver).then(() => webserver))
  .then(webserver => {
    webserver.listen(args.port, () => {
      console.log(`Server running on port ${webserver.address().port}`);
    });
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
