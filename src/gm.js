import ready from './ready';
import {ws, can_notify, username} from './rolls';

function sendAction(event, params) {
    ws.send(JSON.stringify(Object.assign(
        {username: event.target.closest('tr').dataset.username},
        params
    )));
    event.preventDefault();
}

function setClass(event) {
    sendAction(event, {
        action: "setClass",
        class: event.target.options[event.target.selectedIndex].value,
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

        tbody.appendChild(tr);
    }

    for (let select of tbody.querySelectorAll("select"))
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
});
