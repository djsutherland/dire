import escape from 'lodash/escape'; 
import hotkeys from 'hotkeys-js';
const floor = Math.floor, ceil = Math.ceil;

import {ready, selectorValue} from './helpers';
import {sidesByKind, classNames, dicePaths} from './game-data';
export {sidesByKind, classNames} from './game-data';

export function username() {
  return document.getElementById('metadata').dataset.username;
}
export function role() {
  return document.getElementById('metadata').dataset.role;
}

export let can_notify; // status of html notifications

export class WSHandler {
  constructor() {
    this.proto = `ws${window.location.protocol == "https:" ? "s" : ""}`;
    this.handlers = new Map();
    this.handlers.set("rolls", showRolls);
    this.handlers.set("safety", showSafety);
    this.handlers.set("chat", showChat);
    this.handlers.set("user-status", showUserStatus);
    this.handlers.set("kick", getKicked);
    this.handlers.set("users", getUsersUpdate);
    this.wasKicked = false;
  }

  connect() {
    this.ws = new WebSocket(`${this.proto}://${window.location.host}`);
    this.ws.onopen = (event) => { this.onopen(event); };
    this.ws.onerrror = (event) => { this.onerrror(event); };
    this.ws.onclose = (event) => { this.onclose(event); };
    this.ws.onmessage = (event) => { this.onmessage(event); };
  }

  send(message) {
    this.ws.send(message);
  }

  onopen(event) {
    let err = document.getElementById('error');
    err.style.display = 'none';
    err.innerHTML = "";
    rolls.innerHTML = "";
    ws.send(JSON.stringify({action: `hello`, role: role(), username: username()}));
  }

  onclose(event) {
    if (!this.wasKicked) {
      let err = document.getElementById('error');
      err.style.display = 'flex';
      err.innerHTML = "Disconnected from server! Trying to reconnect&hellip;but reloading the page might help too.";
      this.connect();
    }
  }

  onmessage(event) {
    let data = JSON.parse(event.data);
    for (var msg of data) {
      if (this.handlers.has(msg.action)) {
        this.handlers.get(msg.action)(msg, this);
      } else {
        console.error(`Unknown action:`, msg);
      }
    }
  }
}
export let ws = new WSHandler();

export function roll() {
  let selected = document.querySelectorAll("#dice img.selected");
  if (selected.length == 0) {
    return;
  }

  ws.send(JSON.stringify({
    action: "roll",
    dice: Array.from(selected).map(e => e.dataset.kind)
  }));
  
  selected.forEach(img => img.classList.remove("selected"));
}


export let userData = {};
export function getUsersUpdate(msg) {
  userData = msg.users;
  // drawCanvas();
}

function roundedRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x+w,  y , x+w, y+h, r);
  ctx.arcTo(x+w, y+h,  x , y+h, r);
  ctx.arcTo( x , y+h,  x ,  y , r);
  ctx.arcTo( x ,  y , x+w,  y , r);
  ctx.closePath();
}

const classDieFill = "purple",
      classDieStroke = "black",
      classDieTextColor = "rgb(230,170,100)";

let svgDice = {};
function getDie(kind, value, fillColor, strokeColor, textColor) {
  const svg = document.getElementById('svgfield'),
        ns = svg.getAttribute("xmlns");

  if (kind != "d6" && kind != "bad") {
    if (!fillColor) fillColor = classDieFill;
    if (!strokeColor) strokeColor = classDieStroke;
    if (!textColor) textColor = classDieTextColor;

    let base = svgDice[kind];
    if (!base) {
      base = svgDice[kind] = document.createElementNS(ns, 'g');
      const data = dicePaths[kind];

      // try to get center to 0, 0
      let mover = document.createElementNS(ns, 'g');
      mover.setAttribute("transform", `translate(-212.5, -240)`);
      base.appendChild(mover);

      const fill = document.createElementNS(ns, 'path');
      fill.setAttribute("d", data.fill);
      fill.setAttribute("fill", fillColor);
      mover.appendChild(fill);

      const stroke = document.createElementNS(ns, 'path');
      stroke.setAttribute("d", data.stroke);
      stroke.setAttribute("fill", strokeColor);
      mover.appendChild(stroke);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute("x", data.textX);
      text.setAttribute("y", data.textY);
      text.setAttribute("alignment-baseline", "middle");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", textColor);
      text.style.fontFamily = "'Ubuntu Condensed-Regular', 'Ubuntu Condensed', sans-serif";
      text.style.fontSize = "140px";
      text.style.letterSpacing = "-10px";
      text.classList.add("text"); // to not querySelect by namespace, sigh
      mover.appendChild(text);

      base.dataset.size = 425;
      // const bbox = die.getBBox();
      // base.dataset.size = Math.max(bbox.width, bbox.height);
      base.classList.add("die");
    }

    let die = base.cloneNode(true);
    die.querySelector('.text').innerHTML = value;
    return die;

  } else {
    if (!fillColor) fillColor = kind == "bad" ? "red" : "white";
    if (!strokeColor) strokeColor = kind == "black";
    if (!fillColor) fillColor = kind == "bad" ? "white" : "black";

    let key = `${kind}-${value}`;
    let base = svgDice[key];
    if (!base) {
      base = svgDice[key] = document.createElementNS(ns, 'g');

      base.classList.add("die");
      base.dataset.size = 100;

      // want center at 0, 0
      // slightly smaller than the fool d6
      let width = 65, height = width, x = -width/2, y = x;

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", width);
      rect.setAttribute("height", height);
      rect.setAttribute("rx", (height + width) / 20);
      rect.setAttribute("fill", fillColor);
      rect.setAttribute("stroke", strokeColor);
      base.appendChild(rect);

      let dots = [];
      switch (value) {
        case 1: dots = ['cc']; break;
        case 2: dots = ['nw', 'se']; break;
        case 3: dots = ['nw', 'cc', 'se']; break;
        case 4: dots = ['nw', 'ne', 'sw', 'se']; break;
        case 5: dots = ['nw', 'ne', 'cc', 'sw', 'se']; break;
        case 6: dots = ['nw', 'ne', 'cw', 'ce', 'sw', 'se']; break;
        default: console.error(`Invalid d6 value ${value}`); break;
      }

      for (let loc of dots) {
        let cx, cy;
        switch (loc[0]) {
          case 'n': cy = y + 0.25 * height; break;
          case 'c': cy = y + 0.50 * height; break;
          case 's': cy = y + 0.75 * height; break;
        }
        switch (loc[1]) {
          case 'w': cx = x + 0.25 * width; break;
          case 'c': cx = x + 0.50 * width; break;
          case 'e': cx = x + 0.75 * width; break;
        }
        let dot = document.createElementNS(ns, 'circle');
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("r", 0.035 * (height + width));
        dot.setAttribute("fill", textColor);
        base.appendChild(dot);
      }
    }

    return base.cloneNode(true);
  }
}


function drawDie(kind, value, cx, cy, size, fillColor, strokeColor, textColor) {
  let die = getDie(kind, value, fillColor, strokeColor, textColor);
  die.setAttribute("transform",
    `translate(${cx}, ${cy}) scale(${size / die.dataset.size})`);
  document.getElementById('svgfield').appendChild(die);
  // TODO: fool die
}


let lastRoll;
export function drawLastRoll() {
  if (!lastRoll)
    return;

  let tabbox = document.getElementById('tablerect').getBBox(),
      midX = tabbox.x + tabbox.width / 2,
      midY = tabbox.y + tabbox.height / 2;

  const nRolls = lastRoll.rolls.length;
  let sz = 80, pad = 10, w = sz + 2 * pad;
  let scale = tabbox.width / (w * nRolls);
  if (scale < 1) {
    sz = sz * scale;
    pad = pad * scale;
    w = w * scale;
  }

  for (let d of document.querySelectorAll('#svgfield g.die')) {
    d.remove();
  }

  lastRoll.rolls.forEach((roll, i) => {
    let x = midX + w * (i - (nRolls - 1) / 2), y = midY;
    drawDie(roll.kind, roll.roll, x, y, sz);
  });
}
ready(drawLastRoll);


export function setupResultLine(response) {
  let time = new Date(response.time);

  let node = document.createElement("div");
  node.classList.add("result");
  node.classList.add(response.action);
  if (response.private) {
    node.classList.add("private");
  }
  node.innerHTML = `
    <div class="meta">
      <div class="name ${response.role}">
        ${response.username}
        ${response.role !== 'player' ? "<span class='role'>(" + response.role + ")</span>" : ""}
      </div>
      <div class="time">${time.toLocaleString()}</div>
    </div>
    <div class="body"></div>
  `;

  let rolls = document.getElementById('rolls');
  rolls.insertBefore(node, rolls.firstChild);

  return node.querySelector('.body');
}

export function showRolls(response) {
  lastRoll = response;
  drawLastRoll();

  let bodynode = setupResultLine(response);
  for (let roll of response.rolls) {
    let child = document.createElement('span');
    child.classList.add("roll");
    child.dataset.kind = roll.kind;
    child.dataset.status = roll.status;
    child.setAttribute("title", roll.roll);
    child.innerHTML = `<span class="label">d${roll.sides}:</span>
                       <span class="value">${roll.display || roll.roll}</span>`;
    bodynode.appendChild(child);
  }
}

export function showSafety(response) {
  let bodynode = setupResultLine(response);

  let button = document.querySelector(`#safety button[name="${response.choice}"]`);
  bodynode.innerHTML = `<button>${button.innerHTML}</button>`;
  if (response.text) {
    bodynode.innerHTML += "<br>" + escape(response.text); //escape(response.text);
  }

  if (response.live && can_notify) {
    new Notification(button.innerHTML, {body: `Someone used the ${button.innerHTML} safety tool.`});
  }
}

export function showChat(response) {
  let bodynode = setupResultLine(response);
  bodynode.innerHTML = escape(response.text);
}

export function showUserStatus(response) {
  let bodynode = setupResultLine(response);
  bodynode.innerHTML = escape(response.text);
}

export function getKicked(msg, ws) {
  ws.wasKicked = true;  // prevent reconnection
  let error = document.getElementById("error");
  error.innerHTML = `<span>${msg.reason}<br><a href="/">Go home</a></span>`;
  error.style.display = "flex";
  document.getElementById("the-content").innerHTML = "";
  ws.ws.close();
  // window.location.href = `/?msg=${encodeURIComponent(msg.reason)}`;
}


export function selectedToggler(img) {
  return event => { img.classList.toggle("selected"); };
}

export function safetyHitter(button) {
  return event => {
    let anon_or_not = selectorValue(document.getElementById('safety-anon'));

    let textbox = document.getElementById('safety-text');

    ws.send(JSON.stringify({
      action: "safety",
      choice: button.getAttribute("name"),
      anon: anon_or_not,
      text: textbox.value
    }));

    textbox.value = '';
  };
}

export function sendChat(event) {
  let textbox = document.getElementById('chatbox');
  if (textbox.value.trim()) {
    ws.send(JSON.stringify({action: "chat", text: textbox.value}));
  }
  textbox.value = '';
  event.preventDefault();
}

export function addAd6(event) {
  let die = document.createElement('img');
  die.setAttribute("src", "/img/d6.png");
  die.setAttribute("data-kind", "d6");
  die.addEventListener("click", selectedToggler(die));

  let bad = document.querySelector('#dice img[data-kind="bad"]');
  bad.parentNode.insertBefore(die, bad);

  document.getElementById("fewer-d6").removeAttribute("disabled");
  if (document.querySelectorAll('#dice img[data-kind="d6"]').length > 12) {
    document.getElementById("more-d6").setAttribute("disabled", true);
  }
}

export function removeAd6(event) {
  let dice = document.querySelectorAll("#dice img[data-kind='d6']");
  dice[dice.length - 1].remove();

  document.getElementById('more-d6').removeAttribute('disabled');
  if (dice.length <= 4) {
    document.getElementById("fewer-d6").setAttribute("disabled", true);
  }
}


ready(() => {
  for (let img of document.querySelectorAll("#dice img")) {
    img.addEventListener("click", selectedToggler(img));
  }
  document.getElementById("more-d6").addEventListener("click", addAd6);
  document.getElementById("fewer-d6").addEventListener("click", removeAd6);
  document.getElementById("roll").addEventListener("click", roll);
  for (let button of document.querySelectorAll("#safety button")) {
    button.addEventListener("click", safetyHitter(button));
  }
  document.getElementById('chat-form').addEventListener('submit', sendChat);
});

ready(() => {
  ws.connect();
});

ready(() => {
  if (!("Notification" in window) || Notification.permission === "denied") {
    can_notify = false;
  } else if (Notification.permission === "granted") {
    can_notify = true;
  } else {
    can_notify = null;
    document.getElementById('notify-alert').style.display = 'flex';
    document.getElementById('enable-notifications').addEventListener('click', (event) => {
      let callback = permission => {
        if (!('permission' in Notification)) {
          Notification.permission = permission;
        }
        can_notify = Notification.permission == "granted";
        document.getElementById('notify-alert').style.display = 'none';
      };

      try {
        Notification.requestPermission().then(callback);
      } catch (e) {
        Notification.requestPermission(callback);
      }
    });
  }
});



hotkeys('0,1,2,3,4,5,6,7,8,9', (event, handler) => {
  let n = parseInt(handler.key, 10);
  // make sure we have enough
  let n_dice = document.querySelectorAll("#dice img[data-kind='d6']").length;
  for (let j = 0; j < n - n_dice; j++)
    addAd6();

  let dice = document.querySelectorAll("#dice img[data-kind='d6']");
  for (let i = 0; i < dice.length; i++) {
    if (i < n) {
      dice[i].classList.add("selected");
    } else {
      dice[i].classList.remove("selected");
    }
  }
});
hotkeys("`,b,c,d,f,k,n,g,m", (event, handler) => {
  let kind;
  switch (handler.key) {
    case "b": kind = "bad"; break;
    case "`": kind = "class"; break;
    case "c": kind = "class"; break;
    case "d": kind = "dictator"; break;
    case "f": kind = "fool"; break;
    case "k": kind = "knight"; break;
    case "n": kind = "neo"; break;
    case "g": kind = "godbinder"; break;
    case "m": kind = "master"; break;
  }
  let target = document.querySelector(`#dice img[data-kind="${kind}"]`);
  if (!target && kind != "bad") {
    target = document.querySelector(`#my-die`);
  }
  if (target && !target.classList.contains("nodisplay")) {
    target.classList.toggle("selected");
  }
});
hotkeys('-', () => { document.getElementById('fewer-d6').click(); });
hotkeys('=, shift+=', () => { document.getElementById('more-d6').click(); });
hotkeys('enter', () => { roll(); });
