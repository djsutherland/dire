import './dom-polyfills';
import ready from './ready';
import {ws, sidesByKind, classNames, selectedToggler} from './rolls';

ws.handlers.set("getClass", msg => {
  let classId = document.getElementById("class-id");

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
      die.addEventListener("click", selectedToggler(die));
      div.prepend(die);
      console.log("#my-die created", die);
    }
    console.log("setting on #my-die");
    die.setAttribute("src", `/img/${msg.class}.png`);
    classId.innerHTML = ` You're ${classNames[msg.class]}.`;
    console.log("done");
  }
});
