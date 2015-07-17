/* jshint asi: true */
/* jshint esnext: true */

var fs = require('fs')
var ws = require('ws')
var XRegExp = require('xregexp').XRegExp

var config = JSON.parse(fs.readFileSync('./config.json'))

var server = new ws.Server({host: config.host, port: config.port})
console.log("Started server on " + config.host + ":" + config.port)

server.on('connection', function(socket) {
	socket.on('message', function(data) {
		try {
			// Don't penalize yet, but check whether IP is rate-limited
			if (POLICE.frisk(getAddress(socket), 0)) {
				send({cmd: 'warn', text: "Your IP is being rate-limited."}, socket)
				return
			}
			// Penalize here, but don't do anything about it
			POLICE.frisk(getAddress(socket), 1)

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
		try {
			if (socket.channel) {
				broadcast({cmd: 'onlineRemove', nick: socket.nick}, socket.channel)
			}
		}
		catch (e) {
			console.warn(e.stack)
		}
	})
})

function send(data, client) {
	// Add timestamp to command
	data.time = Date.now()
	try {
		if (client.readyState == ws.OPEN) {
			client.send(JSON.stringify(data))
		}
	}
	catch (e) {
		// Ignore exceptions thrown by client.send()
	}
}

/** Sends data to all clients
channel: if not null, restricts broadcast to clients in the channel
*/
function broadcast(data, channel) {
	for (var client of server.clients) {
		if (channel ? client.channel === channel : client.channel) {
			send(data, client)
		}
	}
}

function nicknameValid(nick) {
	if (/[$,*!?]/.test(nick)) return false
	// allow all other "normal" ascii characters
  var unicodeNick = XRegExp('^[\\p{L}\\p{N}]{1,32}')
	return unicodeNick.test(nick)
}

function getAddress(client) {
	if (config.x_forwarded_for) {
		// The remoteAddress is 127.0.0.1 since if all connections
		// originate from a proxy (e.g. nginx).
		// You must write the x-forwarded-for header to determine the
		// client's real IP address.
		return client.upgradeReq.headers['x-forwarded-for']
	}
	else {
		return client.upgradeReq.connection.remoteAddress
	}
}


// `this` bound to client
var COMMANDS = {
	ping: function() {
		// Don't do anything
	},

	join: function(args) {
		var channel = String(args.channel)
		var nick = String(args.nick)

		if (POLICE.frisk(getAddress(this), 3)) {
			send({cmd: 'warn', text: "You are joining channels too fast. Wait a moment and try again."}, this)
			return
		}

		if (this.nick) {
			// Already joined
			return
		}

		// Process channel name
		channel = channel.trim()
		if (!channel) {
			// Must join a non-blank channel
			return
		}

		// Process nickname
		nick = nick.trim()
		if (nick.toLowerCase() == config.admin.toLowerCase()) {
			send({cmd: 'warn', text: "Cannot impersonate the admin"}, this)
			return
		}
		if (nick == config.password) {
			nick = config.admin
			this.admin = true
		}
		if (!nicknameValid(nick)) {
			send({cmd: 'warn', text: "Nickname invalid"}, this)
			return
		}

		var address = getAddress(this)
		for (var client of server.clients) {
			if (client.channel === channel) {
				if (client.nick.toLowerCase() === nick.toLowerCase()) {
					send({cmd: 'warn', text: "Nickname taken"}, this)
					return
				}
			}
		}

		// Announce the new user
		broadcast({cmd: 'onlineAdd', nick: nick}, channel)

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
		send({cmd: 'onlineSet', nicks: nicks}, this)
	},

	chat: function(args) {
		var text = String(args.text)

		if (!this.channel) {
			return
		}
		// strip newlines from beginning and end
		text = text.replace(/^\s*\n|^\s+$|\n\s*$/g, '')
		// replace 3+ newlines with just 2 newlines
		text = text.replace(/\n{3,}/g, "\n\n")
		if (!text) {
			return
		}

		var score = text.length / 83 / 4
		if (POLICE.frisk(getAddress(this), score)) {
			send({cmd: 'warn', text: "You are sending too much text. Wait a moment and try again.\nPress the up arrow key to restore your last message."}, this)
			return
		}

		var data = {cmd: 'chat', nick: this.nick, text: text}
		if (this.admin) {
			data.admin = true
		}
		broadcast(data, this.channel)
	},

	invite: function(args) {
		var nick = String(args.nick)
		if (!this.channel) {
			return
		}

		if (POLICE.frisk(getAddress(this), 2)) {
			send({cmd: 'warn', text: "You are sending invites too fast. Wait a moment before trying again."}, this)
			return
		}

		var friend
		for (var client of server.clients) {
			// Find friend's client
			if (client.channel == this.channel && client.nick == nick) {
				friend = client
				break
			}
		}
		if (!friend) {
			send({cmd: 'warn', text: "Could not find user in channel"}, this)
			return
		}
		if (friend == this) {
			// Ignore silently
			return
		}
		var channel = Math.random().toString(36).substr(2, 8)
		send({cmd: 'info', text: "You invited " + friend.nick + " to ?" + channel}, this)
		send({cmd: 'info', text: this.nick + " invited you to ?" + channel}, friend)
	},

	// Admin stuff below this point

	ban: function(args) {
		var channel = args.channel ? String(args.channel) : this.channel
		var nick = String(args.nick)

		if (!this.admin) {
			return
		}
		if (!channel) {
			return
		}

		var badClient
		for (var client of server.clients) {
			if (client.channel == channel && client.nick == nick) {
				badClient = client
				break
			}
		}

		if (!badClient) {
			send({cmd: 'warn', text: "Could not find " + nick + " in ?" + channel}, this)
			return
		}

		POLICE.arrest(getAddress(badClient))
		send({cmd: 'warn', text: "You have been banned. :("}, badClient)
		send({cmd: 'info', text: "Banned " + nick + " in ?" + channel}, this)
	},

	listUsers: function() {
		if (!this.admin) {
			return
		}
		var channels = {}
		for (var client of server.clients) {
			if (client.channel) {
				if (!channels[client.channel]) {
					channels[client.channel] = []
				}
				channels[client.channel].push(client.nick)
			}
		}

		var lines = []
		for (var channel in channels) {
			lines.push("?" + channel + " " + channels[channel].join(", "))
		}
		var text = server.clients.length + " users online:\n\n"
		text += lines.join("\n")
		send({cmd: 'info', text: text}, this)
	},

	broadcast: function(args) {
		var text = String(args.text)
		if (!this.admin) {
			return
		}
		broadcast({cmd: 'info', text: "Server broadcast: " + text})
	},
}


// rate limiter
var POLICE = {
	records: {},
	halflife: 30000, // ms
	threshold: 15,

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
