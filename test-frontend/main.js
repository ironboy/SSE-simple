let user = prompt('User');
let channel = prompt('Channel');
let create = confirm('Create new channel? (Cancel to just join...)');
let $ = x => document.querySelector(x);
let urlPrefix = 'http://localhost:4000';

start();

async function start() {

  if (create) {
    let r = await (await fetch(urlPrefix + `/api/channel/create/${channel}`, { mode: 'cors' })).json();
  }

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

  const eventSource = new EventSource(urlPrefix + `/api/channel/listen/${channel}/${user}/10`);

  eventSource.onmessage = event => {
    print(JSON.parse(event.data));
  }

  eventSource.onerror = error => {
    console.error(error);
    eventSource.close();
  }

}

async function send(message) {
  return await (await fetch(urlPrefix + `/api/send-message/${channel}/${user}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    mode: 'cors'
  })).json();
}

function print(d) {
  let { timestamp, user, data } = d;
  let div = document.createElement('div');
  div.innerHTML = `
    <p>${timestamp.split('T').join(' ').split('.')[0]}</p>
    <p>${user}: ${data}</p><br>
  `;
  $('.messages').append(div);
  window.scrollTo(0, 1000000);
}