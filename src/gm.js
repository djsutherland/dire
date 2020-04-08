import ready from './ready';
import {ws} from './rolls';

ws.handlers.set("users", (msg) => {
    console.log(msg.users);
    let tbody = document.querySelector('#clients tbody');
    tbody.innerHTML = "";
    for (let user of msg.users) {
        let tr = document.createElement('tr');
        tr.innerHTML = `
            <th>${user.nickname}${user.role !== 'player' ? " (" + user.role + ")" : ""}</th>
            <td>${user.conns}</td>
            <td></td>
        `;
        tbody.appendChild(tr);
    }
});
