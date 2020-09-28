import './dom-polyfills';
import range from 'lodash/range';
import GraphemeSplitter from 'grapheme-splitter';

import {emoLevels} from './game-data';
import {capFirst, ready, selectorValue, getIndefiniteArticle,
        fillKnightKindSelector, fillKnightLevelSelector} from './helpers';
import {ws, sidesByKind, classNames, selectedToggler} from './rolls';

const splitter = new GraphemeSplitter();

function hasDie(user) {
  if (!sidesByKind[user.class])
    return false;
  if (user.dieWithGM)
    return false;
  return true;
}

ws.handlers.set("getUserData", msg => {
  let classId = document.getElementById("class-id"),
      controls = document.getElementById("class-controls");

  if (hasDie(msg)) {
    // get or create #my-die, inside #dice
    let die = document.getElementById('my-die');
    if (!die) {
      die = document.createElement('img');
      die.setAttribute('id', 'my-die');
      die.dataset.kind = "class";
      die.addEventListener("click", selectedToggler(die));
      document.getElementById('dice').prepend(die);
    }
    die.setAttribute("src", `/img/${msg.class}.png`);

    let className;
    if (msg.class == "knight" && msg.emoKind !== undefined) {
      className = `${getIndefiniteArticle(msg.emoKind)} ${capFirst(msg.emoKind)} Knight`;
    } else {
      className = classNames[msg.class];
    }
    classId.innerHTML = `You're <a target="_new" href="/pdfs/${msg.class}.pdf">${className}</a>.`;
  } else {
    document.querySelectorAll("#my-die").forEach(d => d.remove());
    if (classNames[msg.class]) {
      classId.innerHTML = `You're <a target="_new" href="/pdfs/${msg.class}.pdf">${classNames[msg.class]}</a>.`;
    } else {
      classId.innerHTML = "";
    }
  }

  switch (msg.class) {
    case "dictator":
      handleDieTaking(msg, classId, controls);
      break;

    case "fool":
      handleFool(msg, classId, controls);
      break;

    case "knight":
      handleKnight(msg, classId, controls);
      break;

    default:
      controls.innerHTML = "";
      break;
  }
});

function handleDieTaking(msg, classId, controls) {
  if (msg.dieWithGM) {
    classId.innerHTML = classId.innerHTML.trim().slice(0, -1) + ', but the GM has your die.';

    controls.innerHTML = `
      <button id="take-die">Take die back from the GM</button>
    `;
    controls.querySelector("#take-die").addEventListener("click", () => {
      ws.send(JSON.stringify({action: "player-take-die"}));
    });
  } else {
    controls.innerHTML = '<button id="hand-die">Hand the GM your die</button>';
    controls.querySelector("#hand-die").addEventListener("click", () => {
      ws.send(JSON.stringify({action: "player-hand-die"}));
    });
  }
}

function handleKnight(msg, classId, controls) {
  controls.innerHTML = `
    <label>Sacred Emotion: <select id="emoKind" name="emoKind"></select></label>
    <label>Level: <select id="emoLevel" name="emoLevel"></select></label>
    <br><span id="emoCapabilities"></span>
  `;
  let kind = controls.querySelector('#emoKind');
  fillKnightKindSelector(kind, msg.emoKind);
  kind.addEventListener('change', (event) => {
    ws.send(JSON.stringify({action: "set-knight-kind", emoKind: selectorValue(kind)}));
  });

  let level = controls.querySelector('#emoLevel');
  fillKnightLevelSelector(level, msg.emoKind, msg.emoLevel);
  level.addEventListener('change', (event) => {
    ws.send(JSON.stringify({action: "set-knight-level",
                            emoLevel: parseInt(selectorValue(level), 10)}));
  });

  controls.querySelector('#emoCapabilities').innerHTML = emoLevels[msg.emoLevel][1];
}

function handleFool(msg, classId, controls) {
  handleDieTaking(msg, classId, controls);

  if (!msg.dieWithGM) {
    let scribbler = document.createElement('form');
    scribbler.setAttribute('id', 'die-scribbler');
    if (msg.foolVariant == "1.1") {
      scribbler.innerHTML = `
        <label>
          Symbol:
          <select name="symbol">
            <option value="?" disabled>Choose a symbol</option>
          </select>
        </label>
        on
        <label>
          die side:
          <select name="side">
            <option value="0" disabled>–</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
        </label>
      `;
      let symbsel = scribbler.querySelector(`select[name="symbol"]`);
      let anySelected = false;
      for (let [symb, effect] of Object.entries(foolEffects11)) {
        let opt = document.createElement('option');
        opt.innerHTML = `${symb}: ${effect}`;
        opt.setAttribute('value', symb);
        if (msg.foolDie.symbol == symb) {
          opt.setAttribute("selected", true);
          anySelected = true;
        }
        symbsel.append(opt);
      }
      if (!anySelected) {
        symbsel.querySelector('option[value="?"]').setAttribute("selected", true);
      }

      scribbler.querySelector(`select[name="side"] [value="${msg.foolDie.side}"]`)
               .setAttribute("selected", true);
      scribbler.addEventListener('change', (event) => {
        event.preventDefault();
        ws.send(JSON.stringify({
          action: "fool-set-die",
          symbol: selectorValue(scribbler.querySelector('[name="symbol"]')),
          side: parseInt(selectorValue(scribbler.querySelector('select[name="side"]')), 10),
        }));
      });
    } else {
      scribbler.innerHTML = `
        <label>Good symbol: <input type="text" value="${msg.foolDie.posSymbol}" name="posSymbol" size="2" /></label>
        <label>Bad symbol: <input type="text" value="${msg.foolDie.negSymbol}" name="negSymbol" size="2" /></label>
        <label>1: <select name="1"><option value=".">1</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <label>2: <select name="2"><option value=".">2</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <label>3: <select name="3"><option value=".">3</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <label>4: <select name="4"><option value=".">4</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <label>5: <select name="5"><option value=".">5</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <label>6: <select name="6"><option value=".">6</option><option value="+">${msg.foolDie.posSymbol}</option><option value="-">${msg.foolDie.negSymbol}</option></select></label>
        <br>
        <label>Good fluke: <input type="text" name="fluke" size="80"></label>
      `;
      for (let i = 1; i <= 6; i++) {
        scribbler.querySelector(`[name="${i}"] [value="${msg.foolDie.sides[i-1]}"]`).setAttribute("selected", true);
      }
      scribbler.querySelector("[name='fluke']").value = msg.foolDie.effect;  // avoid worrying about escaping
      for (let inp of scribbler.querySelectorAll("input[name$='Symbol']")) {
        inp.addEventListener('input', event => {
          let optval = event.target.name == "posSymbol" ? "+" : "-";
          let symb = splitter.splitGraphemes(event.target.value.trim())[0] || optval;
          for (let opt of scribbler.querySelectorAll(`option[value="${optval}"]`)) {
            opt.innerHTML = symb;
          }
        });
      }

      // Scribble away; send code 2 seconds after *last* change.
      let scribbleTimeout;

      function updateFoolDie() {
        ws.send(JSON.stringify({
          action: "fool-set-die",
          posSymbol: scribbler.querySelector('[name="posSymbol"]').value,
          negSymbol: scribbler.querySelector('[name="negSymbol"]').value,
          sides: range(1, 7).map(i => selectorValue(scribbler.querySelector(`select[name="${i}"]`))),
          effect: scribbler.querySelector('[name="fluke"]').value,
        }));
        scribbleTimeout = undefined;
      }

      scribbler.addEventListener('input', (event) => {
        if (scribbleTimeout !== undefined)
          window.clearTimeout(scribbleTimeout);
        scribbleTimeout = window.setTimeout(updateFoolDie, 1500);
      });
    }
    controls.append(scribbler);
  }
}
