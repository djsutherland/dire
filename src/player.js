import './dom-polyfills';
import {ready, selectorValue} from './helpers';
import range from 'lodash/range';
import GraphemeSplitter from 'grapheme-splitter';
import {ws, sidesByKind, classNames, selectedToggler} from './rolls';

const splitter = new GraphemeSplitter();

function hasDie(user) {
  if (!sidesByKind[user.class])
    return false;
  if (user.class === "fool" && user.foolDieWithGM)
    return false;
  return true;
}

ws.handlers.set("getUserData", msg => {
  let classId = document.getElementById("class-id"),
      controls = document.getElementById("class-controls");

  if (hasDie(msg)) {
    // get or create #my-die, inside #my-dice, inside #dice
    let die = document.getElementById('my-die');
    if (!die) {
      let div = document.getElementById("my-dice");
      if (!div) {
        div = document.createElement('div');
        div.setAttribute('id', 'my-dice');
        document.getElementById("dice").prepend(div);
      }
      die = document.createElement('img');
      die.setAttribute('id', 'my-die');
      die.dataset.kind = "class";
      die.addEventListener("click", selectedToggler(die));
      div.prepend(die);
    }
    die.setAttribute("src", `/img/${msg.class}.png`);
    classId.innerHTML = `You're <a target="_new" href="/pdfs/${msg.class}.pdf">${classNames[msg.class]}</a>.`;
  } else {
    document.querySelectorAll("#my-dice").forEach(d => d.remove());
    if (classNames[msg.class]) {
      classId.innerHTML = `You're <a target="_new" href="/pdfs/${msg.class}.pdf">${classNames[msg.class]}</a>.`;
    } else {
      classId.innerHTML = "";
    }
  }

  switch (msg.class) {
    case "fool":
      handleFool(msg, classId, controls);
      break;

    default:
      controls.innerHTML = "";
      break;
  }
});

function handleFool(msg, classId, controls) {
  if (msg.foolDieWithGM) {
    classId.innerHTML = classId.innerHTML.trim().slice(0, -1) + ', but the GM has your die.';

    controls.innerHTML = `
      <button id="take-die">Take die back from the GM</button>
    `;
    controls.querySelector("#take-die").addEventListener("click", () => {
      ws.send(JSON.stringify({action: "fool-take-die"}));
    });

  } else {
    controls.innerHTML = '<button id="hand-die">Hand the GM your die</button>';
    controls.querySelector("#hand-die").addEventListener("click", () => {
      ws.send(JSON.stringify({action: "fool-hand-die"}));
    });

    let scribbler = document.createElement('form');
    scribbler.setAttribute('id', 'die-scribbler');
    if (msg.foolVariant == "1.1") {
      scribbler.innerHTML = `
        <label>
          Symbol:
          <select name="symbol">
            <option value="?" disabled>Choose a symbol</option>
            <option value="X">X: Disarm a foe</option>
            <option value="O">O: Knock a foe over; they lose all guard</option>
            <option value="V">V: Inspire all allies to get advantage next round</option>
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
      scribbler.querySelector(`select[name="symbol"] [value="${msg.foolDie.symbol}"]`).setAttribute("selected", true);
      scribbler.querySelector(`select[name="side"] [value="${msg.foolDie.side}"]`).setAttribute("selected", true);
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
      for (let inp of scribbler.querySelectorAll("input")) {
        inp.addEventListener('input', event => {
          let optval = event.target.name == "posSymbol" ? "+" : "-";
          let symb = splitter.splitGraphemes(event.target.value.trim())[0] || optval;
          for (let opt of scribbler.querySelectorAll(`option[value="${optval}"]`)) {
            opt.innerHTML = symb;
          }
        });
      }
      scribbler.addEventListener('change', (event) => {
        ws.send(JSON.stringify({
          action: "fool-set-die",
          posSymbol: scribbler.querySelector('[name="posSymbol"]').value,
          negSymbol: scribbler.querySelector('[name="negSymbol"]').value,
          sides: range(1, 7).map(i => selectorValue(scribbler.querySelector(`select[name="${i}"]`))),
          effect: scribbler.querySelector('[name="fluke"]').value,
        }));
      });
    }
    controls.append(scribbler);
  }
}
