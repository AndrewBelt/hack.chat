#!/usr/bin/env python3
import json
from collections import defaultdict
import sqlite3
import websockets
import asyncio
import uvloop
import time
asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

with open('config.json') as f:
    cfg = json.load(f)

db = sqlite3.connect('messages.db', check_same_thread=False)
db.execute(
    'create table if not exists msgs '
    '(time integer primary key, channel text, nick text, msg text)'
)

rooms = defaultdict(set)


def get_now():
    return int(1000*time.time())


async def broadcast(obj, channel):
    for client in rooms[channel]:
        await client.send(obj)


def get_messages(channel):
    yield from db.execute(
        f'select time, nick, msg from msgs where channel = "{channel}" order by time'
    )


def log_message(now, channel, nick, text):
    db.execute('insert into msgs values (?,?,?,?)', (now, channel, nick, text))
    db.commit()


class Client:
    def __init__(self, ws):
        self.ws = ws
        self.nick = None
        self.channel = None

    async def send(self, obj):
        await self.ws.send(json.dumps(obj))

    async def recv(self):
        data = await self.ws.recv()
        return json.loads(data)

    cmds = 'join chat'.split()

    async def join(self, channel, nick, **kwargs):
        rooms[channel].add(self)
        self.nick = nick
        self.channel = channel
        for ttime, nick, text in get_messages(channel):
            await self.send({
                'cmd': 'chat',
                'time': ttime,
                'nick': nick,
                'text': text
            })
        await broadcast({'cmd': 'onlineAdd', 'nick': nick}, channel)
        await self.send({
            'cmd': 'onlineSet',
            'nicks': [cl.nick for cl in rooms[channel]]
        })

    async def chat(self, text, **kwargs):
        if not self.channel:
            return
        now = get_now()
        await broadcast({
            'cmd': 'chat',
            'time': now,
            'nick': self.nick,
            'text': text
        }, self.channel)
        log_message(now, self.channel, self.nick, text)


async def handler(ws, path):
    client = Client(ws)
    try:
        while True:
            args = await client.recv()
            if args['cmd'] in client.cmds:
                await getattr(client, args['cmd'])(**args)
    except websockets.exceptions.ConnectionClosed as e:
        if not client.channel:
            return
        rooms[client.channel].remove(client)
        await broadcast({
            'cmd': 'onlineRemove',
            'nick': client.nick
        }, client.channel)


loop = asyncio.get_event_loop()
loop.run_until_complete(websockets.serve(handler, cfg['host'], cfg['port']))
print(f'Started server on {cfg["host"]}:{cfg["port"]}')
loop.run_forever()
