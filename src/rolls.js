import ready from './ready';

export function nickname() {
  return document.getElementById('metadata').dataset.nickname;
}
export function role() {
  return document.getElementById('metadata').dataset.role;
}


export class WSHandler {
  constructor() {
    this.proto = `ws${window.location.protocol == "https:" ? "s" : ""}`;
    this.handlers = new Map();
    this.handlers.set("results", showResults);
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

  ws.send(JSON.stringify({
    action: "roll",
    dice: Array.from(selected).map(e => e.dataset.kind)
  }));
  
  selected.forEach(img => img.classList.remove("selected"));
}

export function showResults(response) {
  let time = new Date(response.time);

  let node = document.createElement("div");
  node.classList.add("result");
  node.innerHTML = `
    <div class="meta">
      <div class="name">${response.nickname}</div>
      <div class="time">${time.toLocaleTimeString()}</div>
    </div>
    <div class="dice"></div>
  `;
  var dicenode = node.querySelector('.dice');
  for (let i = 0; i < response.dice.length; i++) {
    let child = document.createElement('span');
    child.dataset.kind = response.dice[i];
    child.innerHTML = `d${response.sides[i]}: <b>${response.rolls[i]}</b>`;
    dicenode.appendChild(child);
  }

  let rolls = document.getElementById('rolls');
  rolls.insertBefore(node, rolls.firstChild);
}

export function toggleSelected(img) {
  return event => {
    if (img.classList.contains("selected")) {
      img.classList.remove("selected");
    } else {
      img.classList.add("selected");
    }
  };
}

ready(() => {
  for (let img of document.querySelectorAll("#dice img")) {
    img.addEventListener("click", toggleSelected(img));
  }
  document.getElementById("roll").addEventListener("click", roll);
});

ready(() => {
  ws.connect();
});
