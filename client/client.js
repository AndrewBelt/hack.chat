var frontpage = [
	"                            _           _         _       _   ",
	"                           | |_ ___ ___| |_   ___| |_ ___| |_ ",
	"                           |   |_ ||  _| '_| |  _|   |_ ||  _|",
	"                           |_|_|__/|___|_,_|.|___|_|_|__/|_|  ",
	"",
	"",
	"Welcome to hack.chat, a minimal, distraction-free chat application.",
	"Channels are created and joined by going to https://hack.chat/?your-channel. There are no channel lists, so a secret channel name can be used for private discussions.",
	"",
	"Here are some pre-made channels you can join:",
	"?lobby ?meta ?random",
	"?technology ?programming",
	"?math ?physics ?asciiart",
	"And here's a random one generated just for you: ?" + Math.random().toString(36).substr(2, 8),
	"",
	"",
	"Formatting:",
	"Whitespace is preserved, so source code can be pasted verbatim.",
	"Surround LaTeX with a dollar sign for inline style $\\zeta(2) = \\pi^2/6$, and two dollars for display.",
	"$$\\int_0^1 \\int_0^1 \\frac{1}{1-xy} dx dy = \\frac{\\pi^2}{6}$$",
	"",
	"GitHub repo: https://github.com/AndrewBelt/hack.chat",
	"Server and client released under the GNU General Public License.",
	"No message history is retained on the hack.chat server.",
].join("\n")

function $(query) {return document.querySelector(query)}

function localStorageGet(key) {
	if (localStorage) {
		return localStorage[key]
	}
}

function localStorageSet(key, val) {
	if (localStorage) {
		localStorage[key] = val
	}
}


var ws
var myNick = localStorageGet('my-nick')
var myChannel = window.location.search.replace(/^\?/, '')
var lastSent = ""

// Ping server every 50 seconds to retain WebSocket connection
window.setInterval(function() {
	send({cmd: 'ping'})
}, 50000)


function join(channel) {
	if (document.domain == 'hack.chat') {
		// For https://hack.chat/
		ws = new WebSocket('wss://hack.chat/chat-ws')
	}
	else {
		// for local installs
		ws = new WebSocket('ws://' + document.domain + ':6060')
	}

	var wasConnected = false

	ws.onopen = function() {
		if (!wasConnected) {
			myNick = prompt('Nickname:', myNick)
		}
		if (myNick) {
			localStorageSet('my-nick', myNick)
			send({cmd: 'join', channel: channel, nick: myNick})
		}
		wasConnected = true
	}

	ws.onclose = function() {
		if (wasConnected) {
			pushMessage('!', "Server disconnected. Attempting to reconnect...", Date.now(), 'warn')
		}
		window.setTimeout(function() {
			join(channel)
		}, 2000)
	}

	ws.onmessage = function(message) {
		var args = JSON.parse(message.data)
		var cmd = args.cmd
		var command = COMMANDS[cmd]
		command.call(null, args)
	}
}


var COMMANDS = {
	chat: function(args) {
		var cls
		if (args.admin) {
			cls = 'admin'
		}
		else if (myNick == args.nick) {
			cls = 'me'
		}
		pushMessage(args.nick, args.text, args.time, cls)

		if (!windowActive && $('#notifications-chat').checked && args.nick != myNick) {
			new Notification('?' + myChannel, {body: args.nick + ": " + args.text});
		}
		else if(!windowActive && $('#notifications-mention').checked && args.text.indexOf('@' + myNick) !== -1) {
			new Notification('?' + myChannel, {body: args.nick + ": " + args.text});
		}
	},
	info: function(args) {
		pushMessage('*', args.text, args.time, 'info')
	},
	warn: function(args) {
		pushMessage('!', args.text, args.time, 'warn')
	},
	onlineSet: function(args) {
		var nicks = args.nicks
		usersClear()
		nicks.forEach(function(nick) {
			userAdd(nick)
		})
		pushMessage('*', "Users online: " + nicks.join(", "), Date.now(), 'info')
	},
	onlineAdd: function(args) {
		var nick = args.nick
		userAdd(nick)
		if ($('#joined-left').checked) {
			pushMessage('*', nick + " joined", Date.now(), 'info')
		}

		if (!windowActive && $('#notifications-joinLeave').checked) {
			new Notification('?' + myChannel, {body: nick + ' joined'});
		}
	},
	onlineRemove: function(args) {
		var nick = args.nick
		userRemove(nick)
		if ($('#joined-left').checked) {
			pushMessage('*', nick + " left", Date.now(), 'info')
		}

		if (!windowActive && $('#notifications-joinLeave').checked) {
			new Notification('?' + myChannel, {body: nick + ' left'});
		}
	},
}


function pushMessage(nick, text, time, cls) {
	// Message container
	var messageEl = document.createElement('div')
	messageEl.classList.add('message')
	if (cls) {
		messageEl.classList.add(cls)
	}

	// Nickname
	var nickEl = document.createElement('a')
	nickEl.textContent = nick || ''
	if (time) {
		var date = new Date(time)
		nickEl.title = date.toLocaleString()
	}
	nickEl.onclick = function() {
		insertAtCursor("@" + nick + " ")
		$('#chatinput').focus()
	}
	var nickSpanEl = document.createElement('span')
	nickSpanEl.classList.add('nick')
	nickSpanEl.appendChild(nickEl)
	messageEl.appendChild(nickSpanEl)

	// Text
	var textEl = document.createElement('pre')
	textEl.classList.add('text')

	textEl.textContent = text || ''
	textEl.innerHTML = textEl.innerHTML.replace(/(\?|https?:\/\/)\S+?(?=[,.!?:)]?\s|$)/g, parseLinks)

	if ($('#parse-latex').checked) {
		// Temporary hotfix for \rule spamming, see https://github.com/Khan/KaTeX/issues/109
		textEl.innerHTML = textEl.innerHTML.replace(/\\rule|\\\\\s*\[.*?\]/g, '')
		try {
			renderMathInElement(textEl, {delimiters: [
				{left: "$$", right: "$$", display: true},
				{left: "$", right: "$", display: false},
			]})
		}
		catch (e) {
			console.warn(e)
		}
	}

	messageEl.appendChild(textEl)

	// Scroll to bottom
	var atBottom = isAtBottom()
	$('#messages').appendChild(messageEl)
	if (atBottom) {
		window.scrollTo(0, document.body.scrollHeight)
	}

	unread += 1
	updateTitle()
}


function insertAtCursor(text) {
	var input = $('#chatinput')
	var start = input.selectionStart || 0
	input.value = input.value.substr(0, start) + text + input.value.substr(start)
}


function send(data) {
	if (ws && ws.readyState == ws.OPEN) {
		ws.send(JSON.stringify(data))
	}
}


function parseLinks(g0) {
	var a = document.createElement('a')
	a.innerHTML = g0
	var url = a.textContent
	if (url[0] == '?') {
		url = "/" + url
	}
	a.href = url
	a.target = '_blank'
	return a.outerHTML
}


var windowActive = true
var unread = 0

window.onfocus = function() {
	windowActive = true
	updateTitle()
}

window.onblur = function() {
	windowActive = false
}

window.onscroll = function() {
	if (isAtBottom()) {
		updateTitle()
	}
}

function isAtBottom() {
	return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 1)
}

function updateTitle() {
	if (windowActive && isAtBottom()) {
		unread = 0
	}

	var title
	if (myChannel) {
		title = "?" + myChannel
	}
	else {
		title = "hack.chat"
	}
	if (unread > 0) {
		title = '(' + unread + ') ' + title
	}
	document.title = title
}

/* footer */

$('#footer').onclick = function() {
	$('#chatinput').focus()
}

$('#chatinput').onkeydown = function(e) {
	if (e.keyCode == 13 /* ENTER */ && !e.shiftKey) {
		if (e.target.value != '') {
			var text = e.target.value
			e.target.value = ''
			send({cmd: 'chat', text: text})
			lastSent = text
			updateInputSize()
		}
		e.preventDefault()
	}
	else if (e.keyCode == 38 /* UP */) {
		// Restore previous sent message
		if (e.target.value == '') {
			e.target.value = lastSent
			e.target.selectionStart = e.target.value.length
			updateInputSize()
			e.preventDefault()
		}
	}
	else if (e.keyCode == 27 /* ESC */) {
		// Clear input field
		e.target.value = ''
		updateInputSize()
	}
}

function updateInputSize() {
	var atBottom = isAtBottom()

	var input = $('#chatinput')
	input.style.height = 0
	input.style.height = input.scrollHeight + 'px'
	document.body.style.marginBottom = $('#footer').offsetHeight + 'px'

	if (atBottom) {
		window.scrollTo(0, document.body.scrollHeight)
	}
}

$('#chatinput').oninput = function() {
	updateInputSize()
}

updateInputSize()


/* sidebar */

$('#sidebar').onmouseenter = $('#sidebar').ontouchstart = function(e) {
	$('#sidebar-content').classList.remove('hidden')
	e.stopPropagation()
}

$('#sidebar').onmouseleave = document.ontouchstart = function() {
	if (!$('#pin-sidebar').checked) {
		$('#sidebar-content').classList.add('hidden')
	}
}

$('#clear-history').onclick = function() {
	// Delete children elements
	var messages = $('#messages')
	while (messages.firstChild) {
		messages.removeChild(messages.firstChild)
	}
}

// Restore settings from localStorage

if (localStorageGet('pin-sidebar') == 'true') {
	$('#pin-sidebar').checked = true
	$('#sidebar-content').classList.remove('hidden')
}
if (localStorageGet('joined-left') == 'false') {
	$('#joined-left').checked = false
}
if (localStorageGet('parse-latex') == 'false') {
	$('#parse-latex').checked = false
}
if (Notification.permission == 'granted') {
	if(localStorageGet('notifications-mention') == 'true') {
		$('#notifications-mention').checked = true
	}
	if(localStorageGet('notifications-chat') == 'true') {
		$('#notifications-chat').checked = true
	}
	if(localStorageGet('notifications-joinLeave') == 'true') {
		$('#notifications-joinLeave').checked = true
	}
}

$('#pin-sidebar').onchange = function(e) {
	localStorageSet('pin-sidebar', !!e.target.checked)
}
$('#joined-left').onchange = function(e) {
	localStorageSet('joined-left', !!e.target.checked)
}
$('#parse-latex').onchange = function(e) {
	localStorageSet('parse-latex', !!e.target.checked)
}

// Notifications

function updateNotifications(e)
{
	if(e.checked && window.Notification && Notification.permission != 'granted') {
		e.checked = false
		Notification.requestPermission(function() {
			if(Notification.permission == 'granted') {
				e.checked = true
				localStorageSet(e.id, true)
			}
		});
	}
	else if (e.checked) {
		localStorageSet(e.id, true)
	}
	else {
		localStorageSet(e.id, false)
	}
}

// User list

function userAdd(nick) {
	var user = document.createElement('a')
	user.textContent = nick
	user.onclick = userInvite
	var userLi = document.createElement('li')
	userLi.appendChild(user)
	$('#users').appendChild(userLi)
}

function userRemove(nick) {
	var users = $('#users')
	var children = users.children
	for (var i = 0; i < children.length; i++) {
		var user = children[i]
		if (user.textContent == nick) {
			users.removeChild(user)
		}
	}
}

function usersClear() {
	var users = $('#users')
	while (users.firstChild) {
		users.removeChild(users.firstChild)
	}
}

function userInvite(e) {
	var nick = e.target.textContent
	send({cmd: 'invite', nick: nick})
}

/* color scheme switcher */

var schemes = [
	'android',
	'atelier-dune',
	'atelier-forest',
	'atelier-heath',
	'atelier-lakeside',
	'atelier-seaside',
	'bright',
	'chalk',
	'default',
	'eighties',
	'greenscreen',
	'mocha',
	'monokai',
	'nese',
	'ocean',
	'pop',
	'railscasts',
	'solarized',
	'tomorrow',
]

var currentScheme = 'atelier-dune'

function setScheme(scheme) {
	currentScheme = scheme
	$('#scheme-link').href = "/schemes/" + scheme + ".css"
	localStorageSet('scheme', scheme)
}

// Add scheme options to dropdown selector
schemes.forEach(function(scheme) {
	var option = document.createElement('option')
	option.textContent = scheme
	option.value = scheme
	$('#scheme-selector').appendChild(option)
})

$('#scheme-selector').onchange = function(e) {
	setScheme(e.target.value)
}

// Load sidebar configaration values from local storage if available
if (localStorageGet('scheme')) {
	setScheme(localStorageGet('scheme'))
}

$('#scheme-selector').value = currentScheme


/* main */

if (myChannel == '') {
	pushMessage('', frontpage)
	$('#footer').classList.add('hidden')
	$('#sidebar').classList.add('hidden')
}
else {
	join(myChannel)
}
