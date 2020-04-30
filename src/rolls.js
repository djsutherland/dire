import escape from 'lodash/escape'; 
import hotkeys from 'hotkeys-js';

import {ready, selectorValue, toggleCheckbox} from './helpers';
export {sidesByKind, classNames} from './game-data';

export function username() {
  return document.getElementById('metadata').dataset.username;
}
export function role() {
  return document.getElementById('metadata').dataset.role;
}

export let can_notify;

export class WSHandler {
  constructor() {
    this.proto = `ws${window.location.protocol == "https:" ? "s" : ""}`;
    this.handlers = new Map();
    this.handlers.set("rolls", showRolls);
    this.handlers.set("safety", showSafety);
    this.handlers.set("chat", showChat);
    this.handlers.set("user-status", showUserStatus);
    this.handlers.set("kick", getKicked);
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
  let bodynode = setupResultLine(response);
  for (let i = 0; i < response.rolls.length; i++) {
    let roll = response.rolls[i];
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
  document.getElementById('base-dice').prepend(die);

  document.getElementById("fewer-d6").removeAttribute("disabled");
  if (document.querySelectorAll('#base-dice img[data-kind="d6"]').length > 12) {
    document.getElementById("more-d6").setAttribute("disabled", true);
  }
}

export function removeAd6(event) {
  let dice = document.querySelectorAll("#base-dice img[data-kind='d6']");
  dice[0].remove();

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
  let n_dice = document.querySelectorAll("#base-dice img[data-kind='d6']").length;
  for (let j = 0; j < n - n_dice; j++)
    addAd6();

  let dice = document.querySelectorAll("#base-dice img[data-kind='d6']");
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
