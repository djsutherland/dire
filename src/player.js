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
      console.log(msg);
      let v = msg.foolDie;
      controls.innerHTML = `
        <button id="hand-die">Hand the GM my die</button>
        <form id="die-scribbler">
          <span>Your die is currently:</span>
          <label for="die-1">1:</label><input type="text" name="die-1" size="2" value="${v[0] || ''}" />
          <label for="die-2">2:</label><input type="text" name="die-2" size="2" value="${v[1] || ''}" />
          <label for="die-3">3:</label><input type="text" name="die-3" size="2" value="${v[2] || ''}" />
          <label for="die-4">4:</label><input type="text" name="die-4" size="2" value="${v[3] || ''}" />
          <label for="die-5">5:</label><input type="text" name="die-5" size="2" value="${v[4] || ''}" />
          <label for="die-6">6:</label><input type="text" name="die-6" size="2" value="${v[5] || ''}" />
          <input type="submit" value="Scribble" />
        </form>
      `;
      controls.querySelector("#hand-die").addEventListener("click", () => {
        ws.send(JSON.stringify({action: "hand-die"}));
      });
      controls.querySelector("#die-scribbler").addEventListener("submit", (event) => {
        event.preventDefault();
        let values = [];
        for (let i = 1; i <= 6; i++) {
          values.push(controls.querySelector(`[name="die-${i}"]`).value.trim() || null);
        }
        ws.send(JSON.stringify({
          action: "scribble",
          foolDie: values,
        }));
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
