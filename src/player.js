import './dom-polyfills';
import ready from './ready';
import {ws, sidesByKind, classNames, selectedToggler} from './rolls';

ws.handlers.set("getClass", msg => {
  let classId = document.getElementById("class-id"),
      controls = document.getElementById("class-controls");

  if (!sidesByKind[msg.class]) {
    document.querySelectorAll("#my-dice").forEach(d => d.remove());
    if (classNames[msg.class]) {
      classId.innerHTML = ` You're ${classNames[msg.class]}.`;
    } else {
      classId.innerHTML = "";
    }
  } else {
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
    classId.innerHTML = ` You're ${classNames[msg.class]}.`;
  }

  switch (msg.class) {
    case "fool":
      controls.innerHTML = `
        <button id="hand-die">Hand the GM my die</button>
      `;
      controls.querySelector("#hand-die").addEventListener("click", () => {
        ws.send(JSON.stringify({action: "hand-die"}));
      });
      break;

    case "fool_nodie":
      controls.innerHTML = `
        <button id="take-die">Take die back from the GM</button>
      `;
      controls.querySelector("#take-die").addEventListener("click", () => {
        ws.send(JSON.stringify({action: "take-die"}));
      });
      break;

    default:
      controls.innerHTML = "";
      break;
  }
});
