import ready from './ready';
import {ws} from './rolls';

ws.handlers.set("getClass", msg => {
  let die = document.getElementById("my-die"),
      classId = document.getElementById("class-id");
  if (msg.class == "none") {
    die.style.display = "none";
    die.removeAttribute("src");
    classId.innerHTML = "";
  } else {
    die.style.display = "block";
    die.setAttribute("src", `/img/${msg.class}.png`);
    classId.innerHTML = ` You're ${msg.className}.`;
  }
});
