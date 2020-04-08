const api = (() => {
  var ws, nickname;

  function connect_ws() {
    var proto = `ws${window.location.protocol == "https:" ? "s" : ""}`;
    ws = new WebSocket(`${proto}://${window.location.host}`);
    ws.onmessage = event => {
      let data = JSON.parse(event.data);
      for (var msg of data) {
        switch (msg.action) {
          case "results":
            showResults(msg);
            break;
          default:
            console.error(`Unknown action:`, msg);
            break;
        }
      }
    };
    ws.onopen = event => {
      var err = document.getElementById('error');
      err.style.display = 'none';
      err.innerHTML = "";
      ws.send(JSON.stringify({action: "hello", nickname: nickname}));
    };
    ws.onerror = event => { console.error(event); };
    ws.onclose = event => {
      var err = document.getElementById('error');
      err.style.display = 'flex';
      err.innerHTML = "Disconnected from server! Trying to reconnect&hellip;but reloading the page might help too.";
      connect_ws();
    };
  }


  function setup() {
    nickname = document.getElementById('welcome').dataset.nickname;

    connect_ws();

    for (let img of document.querySelectorAll("#dice img")) {
      img.addEventListener("click", toggleSelected(img));
    }
    document.getElementById("roll").addEventListener("click", roll);
  }

  function roll() {
    let selected = document.querySelectorAll("#dice img.selected");

    ws.send(JSON.stringify({
      action: "roll",
      dice: Array.from(selected).map(e => e.dataset.kind)
    }));
    
    selected.forEach(img => img.classList.remove("selected"));
  }

  function showResults(response) {
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

  function toggleSelected(img) {
    return event => {
      if (img.classList.contains("selected")) {
        img.classList.remove("selected");
      } else {
        img.classList.add("selected");
      }
    };
  }

  return {
    setup: setup
  };
})();

function ready(fn) {
  if (document.readyState != 'loading') {
    fn();
  } else {
    document.addEventListener('DOMContentLoaded', fn);
  }
}
ready(api.setup);
