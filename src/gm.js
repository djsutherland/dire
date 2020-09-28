import hotkeys from 'hotkeys-js';

import {ready, selectorValue} from './helpers';
import {ws, can_notify, username, getUsersUpdate} from './rolls';
import {foolEffects11} from './game-data';

function sendAction(event, params) {
    ws.send(JSON.stringify(Object.assign(
        {username: event.target.closest('tr').dataset.username},
        params
    )));
    event.preventDefault();
}
function setClass(event) {
    sendAction(event, {action: "set-class", class: selectorValue(event.target)});
}
function setHasDie(event) {
    sendAction(event, {
        action: event.target.checked ? "gm-take-die" : "gm-return-die",
    });
}
function sendKick(event) { sendAction(event, {action: "kick"}); }
function sendDelete(event) { sendAction(event, {action: "delete"}); }

function addHasDie(user, extras) {
    let label = document.createElement('label');
    label.innerHTML = `
        GM has die:
        <input type="checkbox" name="GM-has-die" ${user.dieWithGM ? "checked" : ""}>
    `;
    label.querySelector('input').addEventListener("change", setHasDie);
    extras.append(label);
}

function addFoolDieInfo(user, extras) {
    let summary = document.createElement("span");
    let die = user.foolDie, n_pos = 0, n_neg = 0, disp = new Array(6);
    die.sides.forEach((v, i) => {
        if (v == '+') {
            n_pos++;
            disp[i] = `${i+1}: ${die.posSymbol}`;
        } else if (v == '-') {
            n_neg++;
            disp[i] = `${i+1}: ${die.negSymbol}`;
        } else {
            disp[i] = i + 1;
        }
    });
    summary.innerHTML = `(${n_pos} good, ${n_neg} bad)`;
    summary.setAttribute("title", `${disp.join(' / ')}\n${die.posSymbol}: ${user.foolDie.effect}`);
    extras.appendChild(summary);
}


ws.handlers.set("users", msg => {
    getUsersUpdate(msg);
    let me = username();
    let tbody = document.querySelector('#clients tbody');
    tbody.innerHTML = "";
    for (let user of msg.users) {
        let is_me = user.username == me;
        let tr = document.createElement('tr');
        tr.dataset.username = user.username;
        tr.dataset.role = user.role;
        tr.innerHTML = `
            <th>
                ${user.username}
                ${user.role == 'player' ? "" : `(${user.role || "???"})`}
                ${user.connected ? "" : `(disconnected)`}
            </th>
            <td class="class-picker"></td>
            <td class="extra-actions"></td>
            <td>${is_me ?
                  "" :
                  user.connected ?
                  `<a class="kicker" href="#">kick</a>` :
                  `<a class="deleter" href="#">delete</a>`
                 }</td>
        `;

        let classtr = tr.querySelector('.class-picker');
        if (user.role === "player") {
            classtr.innerHTML = document.getElementById("diceselector").innerHTML;
            classtr.querySelector(`[value="${user.class}"]`)
                   .setAttribute("selected", "selected");
        }

        let extras = tr.querySelector('.extra-actions');
        if (user.class === "fool") {
            addHasDie(user, extras);
            addFoolDieInfo(user, extras);
        } else if (user.class === "dictator") {
            addHasDie(user, extras);
        }

        tbody.appendChild(tr);
    }

    for (let select of tbody.querySelectorAll(".class-picker select"))
        select.addEventListener("change", setClass);
    for (let a of tbody.querySelectorAll(".kicker"))
        a.addEventListener("click", sendKick);
    for (let a of tbody.querySelectorAll(".deleter"))
        a.addEventListener("click", sendDelete);
});

ws.handlers.set("allowMultipleGMs", msg => {
    document.getElementById('allowMultipleGMs').checked = msg.value;
});

function updateAllDice() {
    let shown = document.getElementById('showAllDice').checked;
    for (let die of document.querySelectorAll('img.otherclasses')) {
        if (shown) {
            die.classList.remove("nodisplay");
        } else {
            die.classList.add("nodisplay");
            die.classList.remove("selected");
        }
    }
}


ready(() => {
    let multiGMs = document.getElementById('allowMultipleGMs');
    multiGMs.addEventListener('change', () => {
        ws.send(JSON.stringify({action: 'allowMultipleGMs', value: multiGMs.checked}));
    });

    document.getElementById('showAllDice').addEventListener('change', updateAllDice);

    let emoteForm = document.getElementById('emote-form');
    emoteForm.addEventListener('submit', (event) => {
      event.preventDefault();
      let textbox = document.getElementById('emotebox');
      if (textbox.value.trim()) {
        ws.send(JSON.stringify({action: "user-status", text: textbox.value}));
      }
      textbox.value = textbox.dataset.default;
    });
});


hotkeys('a', () => {
    let box = document.getElementById('showAllDice');
    box.checked = !box.checked;
    updateAllDice();
});
