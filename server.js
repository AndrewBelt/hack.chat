var fs = require('fs')
var ws = require('ws')

var config = JSON.parse(fs.readFileSync('./config.json'))

var server = new ws.Server({host: '0.0.0.0', port: 6060})

server.on('connection', function(socket) {
	socket.on('message', function(data) {
		try {
			// ignore ridiculously large packets
			if (data.length > 65536) {
				return
			}
			var args = JSON.parse(data)
			var cmd = args.cmd
			var command = COMMANDS[cmd]
			if (command && args) {
				command.call(socket, args)
			}
		}
		catch (e) {
			console.warn(e.stack)
		}
	})

	socket.on('close', function() {
		if (socket.channel) {
			broadcast(socket.channel, {cmd: 'onlineRemove', nick: socket.nick})
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
	// allow all actual ascii characters
	return /^[\x20-\x7e]{1,32}$/.test(nick)
}

function getAddress(client) {
	return client.upgradeReq.headers['x-forwarded-for'] || client.upgradeReq.connection.remoteAddress
}


// `this` bound to client
var COMMANDS = {
	join: function(args) {
		channel = String(args.channel)
		nick = String(args.nick)

		if (this.nick) {
			// Already joined
			return
		}

		// Process channel name
		channel = channel.trim()
		if (!channel) {
			// Must join an actual channel
			return
		}

		// Process nickname
		nick = nick.trim()
		if (nick.toLowerCase() == config.admin.toLowerCase()) {
			send(this, {cmd: 'warn', text: "Cannot impersonate the admin"})
			return
		}
		if (nick == config.password) {
			nick = config.admin
			this.admin = true
		}
		if (!nicknameValid(nick)) {
			send(this, {cmd: 'warn', text: "Nickname invalid"})
			return
		}

		var address = getAddress(this)
		for (var client of server.clients) {
			if (client.channel === channel) {
				if (client.nick.toLowerCase() === nick.toLowerCase()) {
					send(this, {cmd: 'warn', text: "Nickname taken"})
					return
				}
			}
		}

		if (POLICE.frisk(getAddress(this), 2)) {
			send(this, {cmd: 'warn', text: "You cannot join a channel while your IP is being rate-limited. Wait a moment and try again."})
			return
		}

		// Announce the new user
		broadcast(channel, {cmd: 'onlineAdd', nick: nick})

		// Formally join channel
		this.channel = channel
		this.nick = nick

		// Set the online users for new user
		var nicks = []
		for (var client of server.clients) {
			if (client.channel === channel) {
				nicks.push(client.nick)
			}
		}
		send(this, {cmd: 'onlineSet', nicks: nicks})
	},

	chat: function(args) {
		text = String(args.text)

		if (!this.channel) return
		// strip newlines from beginning and end
		text = text.replace(/^\s*\n|^\s+$|\n\s*$/g, '')
		// replace 3+ newlines with just 2 newlines
		text = text.replace(/\n{3,}/g, "\n\n")
		if (text == '') return

		if (POLICE.frisk(getAddress(this), 1 + text.length / 300)) {
			send(this, {cmd: 'warn', text: "Your IP is sending too much text. Wait a moment and try again. Here was your message:\n\n" + text})
			return
		}

		var args = {cmd: 'chat', nick: this.nick, text: text}
		if (this.admin) {
			args.admin = true
		}
		broadcast(this.channel, args)
	},

	ban: function(args) {
		nick = String(args.nick)

		if (!this.admin) {
			return
		}

		var badClient
		for (var client of server.clients) {
			if (client.channel == this.channel && client.nick == nick) {
				badClient = client
			}
		}

		if (badClient) {
			POLICE.arrest(getAddress(badClient))
			send(badClient, {cmd: 'warn', text: "You have been banned. :("})
			send(this, {cmd: 'info', text: "Banned " + badClient.nick})
		}
	}
}


// rate limiter
var POLICE = {
	records: {},
	halflife: 10000, // ms
	threshold: 10,

	frisk: function(id, deltaScore) {
		var record = this.records[id]
		if (!record) {
			record = this.records[id] = {
				time: Date.now(),
				score: 0
			}
		}

		if (record.arrested) {
			return true
		}

		record.score *= Math.pow(2, -(Date.now() - record.time)/POLICE.halflife)
		record.score += deltaScore
		record.time = Date.now()
		return record.score >= this.threshold
	},

	arrest: function(id) {
		var record = this.records[id]
		if (record) {
			record.arrested = true
		}
	},
}
