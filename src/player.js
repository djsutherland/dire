import './dom-polyfills';
import ready from './ready';
import {ws} from './rolls';

ws.handlers.set("getClass", msg => {
  let classId = document.getElementById("class-id");
  if (msg.class === "none") {
    document.querySelectorAll("#my-dice").forEach(d => d.remove());
    classId.innerHTML = "";
  } else if (msg.class === "fallen") {
    document.querySelectorAll("#my-dice").forEach(d => d.remove());
    classId.innerHTML = ` You're ${msg.className}.`;
  } else {
    // get or create #my-die, inside #my-dice, inside #dice
    let die = document.getElementById('my-die');
    console.log("#my-die", die);
    if (!die) {
      let div = document.getElementById("my-dice");
      console.log("#my-dice", dice);
      if (!div) {
        div = document.createElement('div');
        div.setAttribute('id', 'my-dice');
        document.getElementById("dice").prepend(div);
      }
      die = document.createElement('img');
      die.setAttribute('id', 'my-die');
      div.prepend(die);
      console.log("#my-die created", die);
    }
    console.log("setting on #my-die");
    die.setAttribute("src", `/img/${msg.class}.png`);
    classId.innerHTML = ` You're ${msg.className}.`;
    console.log("done");
  }
});
