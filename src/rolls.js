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
  drawCanvas();
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

let diceCanvases = {};
function drawDie(ctx, klass, value, cx, cy, size) {
  let dieCanvas = diceCanvases[klass];
  if (!dieCanvas) {
    dieCanvas = diceCanvases[klass] = document.createElement('canvas');
    dieCanvas.setAttribute("width", size);
    dieCanvas.setAttribute("height", size);
    let c = dieCanvas.getContext('2d');
    c.scale(size / 500, size / 500);
    c.fillStyle = classDieFill;
    c.fill(new Path2D(dicePaths[klass].fill));
    c.strokeStyle = classDieStroke;
    c.stroke(new Path2D(dicePaths[klass].stroke));
  }

  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  let scale = size / parseInt(dieCanvas.getAttribute("width"), 10);
  if (scale != 1)
    ctx.scale(scale, scale);

  ctx.drawImage(dieCanvas, 0, 0);

  ctx.fillStyle = classDieTextColor;
  ctx.font = `${floor(size * 0.3)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, floor(size / 2), floor(dicePaths[klass].text * size));

  ctx.restore();
}


function drawD6Pips(ctx, cx, cy, size, value, dieColor="white", dotColor="black") {
  ctx.save();

  ctx.fillStyle = dieColor;
  roundedRect(ctx, floor(cx - size / 2), floor(cy - size / 2), size, size,
              floor(size / 10));
  ctx.fill();

  // based, ish, on https://codepen.io/rheajt/pen/MOMGKK

  let dots = [];
  switch (value) {
    case 1: dots = ['cc']; break;
    case 2: dots = ['nw', 'se']; break;
    case 3: dots = ['nw', 'cc', 'se']; break;
    case 4: dots = ['nw', 'ne', 'sw', 'se']; break;
    case 5: dots = ['nw', 'ne', 'cc', 'sw', 'se']; break;
    case 6: dots = ['nw', 'ne', 'cw', 'ce', 'sw', 'se']; break;
    default: console.error(`Invalid d6 value ${value}`); return;
  }

  ctx.fillStyle = dotColor;
  for (let loc of dots) {
    let x, y;
    switch (loc[0]) {
      case 'n': y = cy - 0.25 * size; break;
      case 'c': y = cy; break;
      case 's': y = cy + 0.25 * size; break;
    }
    switch (loc[1]) {
      case 'w': x = cx - 0.25 * size; break;
      case 'c': x = cx; break;
      case 'e': x = cx + 0.25 * size; break;
    }
    ctx.beginPath();
    ctx.arc(floor(x), floor(y), floor(size * 0.06) + 1, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

let canvas, lastRoll;
export function drawCanvas() {
  if (!canvas) canvas = document.getElementById('canvas');
  if (!canvas.getContext) return;
  let ctx = canvas.getContext('2d');

  let height = canvas.height, width = canvas.width;

  // draw table - TODO turn into an image or sth
  let tabLeft = 0, tabTop = 0, tabWidth = width, tabHeight = height;
  // let tabLeft = floor(width * 0.15), tabTop = floor(height * 0.5),
  //     tabWidth = floor(width * 0.7), tabHeight = floor(height * 0.5);
  let tabMidX = floor(tabLeft + tabWidth / 2),
      tabMidY = floor(tabTop + tabHeight / 2);
  roundedRect(ctx, tabLeft, tabTop, tabWidth, tabHeight, 20);
  ctx.fillStyle = 'rgb(20, 112, 37)';
  ctx.fill();

  if (lastRoll) {
    // TODO: wrap if too wide
    const nRolls = lastRoll.rolls.length;
    const sz = 100, pad = 0, w = sz + 2 * pad;
    lastRoll.rolls.forEach((roll, i) => {
      let x = tabMidX + w * (i - (nRolls - 1) / 2),
          y = tabMidY;
      if (roll.kind == "d6") {
        drawD6Pips(ctx, x, y, sz * 0.7, roll.roll, "white", "black");
      } else if (roll.kind == "bad") {
        drawD6Pips(ctx, x, y, sz * 0.7, roll.roll, "#f55", "white");
      } else {
        drawDie(ctx, roll.kind, roll.roll, x, y, sz);
      }
    });
  }

}
ready(drawCanvas);


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
  drawCanvas();

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
