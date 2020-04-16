import {ready, selectorValue} from './helpers';
import {ws, can_notify, username} from './rolls';

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
function setFoolVariant(event) {
    sendAction(event, {action: "fool-set-variant", foolVariant: selectorValue(event.target)});
}
function setFoolHasDie(event) {
    sendAction(event, {
        action: event.target.checked ? "take-fool-die" : "give-fool-die",
    });
}
function sendKick(event) { sendAction(event, {action: "kick"}); }
function sendDelete(event) { sendAction(event, {action: "delete"}); }

ws.handlers.set("users", msg => {
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

        if (user.class === "fool") {
            let extras = tr.querySelector('.extra-actions');
            extras.innerHTML = `
                <select name="foolVariant">
                    <option value="1.1">1.1</option>
                    <option value="1.2">1.2</option>
                </select>
                <label>
                    GM has die:
                    <input type="checkbox" name="GM-has-die" ${user.foolDieWithGM ? "checked" : ""}>
                </label>
            `;
            let sel = extras.querySelector('select[name="foolVariant"]');
            sel.querySelector(`[value="${user.foolVariant}"]`).setAttribute("selected", true);
            sel.addEventListener("change", setFoolVariant);

            extras.querySelector('[name="GM-has-die"]').addEventListener("change", setFoolHasDie);

            if (user.foolVariant == "1.1") {
                let symb = document.createElement("span");
                symb.innerHTML = user.foolDie.symbol;
                extras.appendChild(symb);
            } else {
                let summary = document.createElement("span");
                let n_pos = 0, n_neg = 0;
                for (let v of user.foolDie.sides) {
                    if (v == '+') {
                        n_pos++;
                    } else if (v == '-') {
                        n_neg++;
                    }
                }
                summary.innerHTML = `(${n_pos} good, ${n_neg} bad)`;
                summary.setAttribute("title", user.foolDie.effect);
                extras.appendChild(summary);
            }
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
ready(() => {
    let checkbox = document.getElementById('allowMultipleGMs');
    checkbox.addEventListener('change', () => {
        ws.send(JSON.stringify({action: 'allowMultipleGMs', value: checkbox.checked}));
    });

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
