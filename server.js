var ws = require('ws')

var server = new ws.Server({port: 6060})

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
			console.warn(e)
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
	client.send(JSON.stringify(data))
}

function broadcast(channel, data) {
	for (var client of server.clients) {
		if (client.channel === channel) {
			send(client, data)
		}
	}
}

function nicknameValid(nick) {
	return /^[^$*,]+$/.test(nick)
}


// `this` bound to client
var COMMANDS = {
	join: function(channel, nick) {
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

		broadcast(this.channel, {nick: this.nick, text: text})
	},
}
