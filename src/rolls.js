import ready from './ready';
import escape from 'lodash/escape'; 
export {sidesByKind, classNames} from './game-data';

export function nickname() {
  return document.getElementById('metadata').dataset.nickname;
}
export function role() {
  return document.getElementById('metadata').dataset.role;
}

export let can_notify;

export class WSHandler {
  constructor() {
    this.proto = `ws${window.location.protocol == "https:" ? "s" : ""}`;
    this.handlers = new Map();
    this.handlers.set("results", showResults);
    this.handlers.set("safety", showSafety);
    this.handlers.set("chat", showChat);
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
    ws.send(JSON.stringify({action: `hello`, role: role(), nickname: nickname()}));
  }

  onclose(event) {
    let err = document.getElementById('error');
    err.style.display = 'flex';
    err.innerHTML = "Disconnected from server! Trying to reconnect&hellip;but reloading the page might help too.";
    this.connect();
  }

  onmessage(event) {
    let data = JSON.parse(event.data);
    for (var msg of data) {
      if (this.handlers.has(msg.action)) {
        this.handlers.get(msg.action)(msg);
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
  node.innerHTML = `
    <div class="meta">
      <div class="name ${response.role}">
        ${response.nickname}
        ${response.role !== 'player' ? "<span class='role'>(" + response.role + ")</span>" : ""}
      </div>
      <div class="time">${time.toLocaleTimeString()}</div>
    </div>
    <div class="body"></div>
  `;

  let rolls = document.getElementById('rolls');
  rolls.insertBefore(node, rolls.firstChild);

  return node.querySelector('.body');
}

export function showResults(response) {
  let bodynode = setupResultLine(response);
  for (let i = 0; i < response.dice.length; i++) {
    let child = document.createElement('span');
    child.dataset.kind = response.dice[i];
    child.innerHTML = `d${response.sides[i]}: <b>${response.rolls[i]}</b>`;
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


export function selectedToggler(img) {
  return event => {
    if (img.classList.contains("selected")) {
      img.classList.remove("selected");
    } else {
      img.classList.add("selected");
    }
  };
}

export function safetyHitter(button) {
  return event => {
    let sel = document.getElementById('safety-anon');
    let anon_or_not = sel.options[sel.selectedIndex].value;

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

ready(() => {
  for (let img of document.querySelectorAll("#dice img")) {
    img.addEventListener("click", selectedToggler(img));
  }
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
