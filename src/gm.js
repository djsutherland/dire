import ready from './ready';
import {ws, can_notify} from './rolls';

function setClass(event) {
    ws.send(JSON.stringify({
        action: "setClass",
        nickname: this.closest('tr').dataset.nickname,
        class: this.options[this.selectedIndex].value
    }));
}

ws.handlers.set("users", msg => {
    let tbody = document.querySelector('#clients tbody');
    tbody.innerHTML = "";
    for (let user of msg.users) {
        let tr = document.createElement('tr');
        tr.dataset.nickname = user.nickname;
        tr.dataset.role = user.role;
        tr.innerHTML = `
            <th>${user.nickname}${user.role !== 'player' ? " (" + user.role + ")" : ""}</th>
            <td>${user.conns}</td>
        `;

        let classtr = document.createElement('td');
        if (user.role === "player") {
            classtr.innerHTML = document.getElementById("diceselector").innerHTML;
            classtr.querySelector(`[value="${user.class}"]`)
                   .setAttribute("selected", "selected");
            classtr.querySelector("select").addEventListener("change", setClass);
        }
        tr.appendChild(classtr);

        tbody.appendChild(tr);
    }
});
