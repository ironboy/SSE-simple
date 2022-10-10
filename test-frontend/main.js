let user = prompt('User');
let channel = prompt('Channel');
let token, latest = 0;
let $ = x => document.querySelector(x);
let urlPrefix = location.href.indexOf('https') === 0 ? 'https://sse.nodehill.com' : '';

start();

async function start() {

  document.body.innerHTML = `
      <h3>Channel ${channel}</h3>
      <div class="messages"></div>
      <div class="inputbar" style="width:80vw;position:fixed;bottom:10px"><form><input style="width:100%" type="text"></form></div>
    `;
  $('.inputbar form').addEventListener('submit', e => {
    e.preventDefault();
    let v = $('.inputbar input').value;
    $('.inputbar input').value = '';
    send(v);
  });

  startConnection();

}

function startConnection() {
  const eventSource = new EventSource(urlPrefix + `/api/listen/${channel}/${user}/${latest}`);

  eventSource.addEventListener('token', event => {
    token = JSON.parse(event.data);
  });

  eventSource.onmessage = event => {
    print(JSON.parse(event.data));
  }

  eventSource.onerror = error => {
    console.error(error);
    eventSource.close();
    setTimeout(startConnection, 1000)
  }
}


async function send(message) {
  return await (await fetch(urlPrefix + `/api/send/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    mode: 'cors'
  })).json();
}

function print(d) {
  let { timestamp, user, data } = d;
  let date = new Date(timestamp);
  latest = timestamp;
  let div = document.createElement('div');
  div.innerHTML = `
    <p>
      ${date.toLocaleDateString('sv-SE')}
      ${date.toLocaleTimeString('sv-SE')}
      </p>
    <p>${user}: ${data}</p><br>
  `;
  $('.messages').append(div);
  window.scrollTo(0, 1000000);
}