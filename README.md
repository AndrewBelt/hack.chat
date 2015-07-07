# [hack.chat](http://hack.chat/)

## Install a local version

### Server side
* `$ git clone https://github.com/AndrewBelt/hack.chat.git && cd hack.chat`
* `$ npm install`
* `$ npm start`

### Client side
* `cd hack.chat/client`
* Edit `join` function in `client.js`

```
...
function join(channel, nick) {
  // ws = new WebSocket('wss://' + document.domain + '/chat-ws')
  ws = new WebSocket('ws:/' + document.domain + ':6060')
...
```
* `make`
* `npm install -g http-server && http-server`

### How to use
* Your machine go to http://127.0.0.1:8080
* Others machines on the same network go to http://192.168.x.x:8080
