var ws = require('ws')


var server = new ws.Server({host: '127.0.0.1', port: 6060})

server.on('connection', function(socket) {
	socket.on('message', function(data) {
		try {
			var args = JSON.parse(data)
			var cmd = args.shift()
			var command = COMMANDS[cmd]
			if (command) {
				command.apply(socket, args)
			}
		}
		catch (e) {
			console.warn(e.stack)
		}
	})

	socket.on('close', function() {
		if (socket.channel !== undefined) {
			broadcast(socket.channel, {nick: '*', text: socket.nick + " left"})
		}
	})
})

function send(client, data) {
	// Add timestamp to command
	data.time = Date.now()
	try {
		client.send(JSON.stringify(data))
	}
	catch (e) {
		console.warn(e.stack)
	}
}

function broadcast(channel, data) {
	for (var client of server.clients) {
		if (client.channel === channel) {
			send(client, data)
		}
	}
}

function nicknameValid(nick) {
	return /^[_A-Za-z0-9\-`~!@#%^&()]{1,32}$/.test(nick)
}

function getAddress(client) {
	return client.upgradeReq.headers['x-forwarded-for'] || client.upgradeReq.connection.remoteAddress
}


// `this` bound to client
var COMMANDS = {
	join: function(channel, nick) {
		if (this.nick) {
			return
		}

		// Process channel name
		channel += ''
		channel = channel.trim()

		// Process nickname
		nick += ''
		nick = nick.trim()
		if (!nicknameValid(nick)) {
			send(this, {nick: '*', text: 'Nickname invalid'})
			return
		}
		for (var client of server.clients) {
			if (client.channel === channel && client.nick === nick) {
				send(this, {nick: '*', text: 'Nickname taken'})
				return
			}
		}

		if (POLICE.frisk(getAddress(this), 1)) {
			send(this, {nick: '*', text: "You cannot join a channel while your IP is being rate-limited. Wait a moment and try again."})
			return
		}

		// Welcome the new user
		var nicks = []
		for (var client of server.clients) {
			if (client.channel === channel) {
				nicks.push(client.nick)
			}
		}
		var welcome = "Welcome!"
		if (nicks.length > 0) {
			welcome += " Users online: " + nicks.join(', ')
		}
		else {
			welcome += " No users online"
		}
		send(this, {nick: '*', text: welcome})

		// Announce the new user
		broadcast(channel, {nick: '*', text: nick + " joined"})
		this.channel = channel
		this.nick = nick
	},

	chat: function(text) {
		if (this.channel === undefined) return
		text += ''
		// strip newlines from beginning and end
		text = text.replace(/^\s*\n|^\s+$|\n\s*$/g, '')
		// replace 3+ newlines with just 2 newlines
		text = text.replace(/\n{3,}/g, "\n\n")
		if (text == '') return

		if (POLICE.frisk(getAddress(this), 1 + text.length / 300)) {
			send(this, {nick: '*', text: "Your IP is sending too much text. Wait a moment and try again. Here was your message:\n\n" + text})
			return
		}

		broadcast(this.channel, {nick: this.nick, text: text})
	},
}


// rate limiter
var POLICE = {
	records: {},
	halflife: 5000, // ms
	threshold: 10,

	frisk: function(id, deltaScore) {
		var record = this.records[id]
		if (!record) {
			record = this.records[id] = {
				time: Date.now(),
				score: 0
			}
		}

		record.score *= Math.pow(2, -(Date.now() - record.time)/POLICE.halflife)
		record.score += deltaScore
		record.time = Date.now()
		return record.score >= this.threshold
	}
}
