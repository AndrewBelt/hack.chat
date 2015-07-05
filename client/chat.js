// jQuery in 3 lines:
function $(query) {
	return document.querySelector(query)
}

var myNick
var ws = new WebSocket('ws://' + document.domain + '/chat-ws')

ws.onopen = function() {
	var channel = window.location.search.replace(/^\??/, '')
	if (channel != '') {
		join(channel)
	}
}

ws.onmessage = function(message) {
	var data = JSON.parse(message.data)
	pushMessage(data)
}

ws.onclose = function() {
	pushMessage({nick: '*', text: "Server disconnected"})
}


$('#chattext').onkeydown = function(e) {
	if (e.keyCode == 13 && !e.shiftKey) {
		submitMessage()
		e.preventDefault()
	}
}

$('#chattext').focus()


function join(channel) {
	myNick = prompt('Nickname:')
	if (myNick) {
		ws.send(JSON.stringify(['join', channel, myNick]))
	}
}


function submitMessage() {
	if ($('#chattext').value != '') {
		ws.send(JSON.stringify(['chat', $('#chattext').value]))
		$('#chattext').value = ''
	}
}


function pushMessage(data) {
	var nick = document.createElement('span')
	nick.classList.add('nick')
	if (data.nick == myNick) {
		nick.classList.add('me')
	}
	nick.textContent = data.nick || ''
	if (data.time) {
		var time = new Date(data.time)
		nick.title = time.toLocaleString()
	}

	var textEl = document.createElement('pre')
	textEl.classList.add('text')

	var text = data.text || ''
	textEl.textContent = text
	textEl.innerHTML = textEl.innerHTML.replace(/\B`(.*?)`\B/g, '<code>$1</code>')
	textEl.innerHTML = urlize(textEl.innerHTML, {target: '_blank'})
	try {
		renderMathInElement(textEl, {delimiters: [
			{left: '$$', right: '$$', display: true},
			{left: '\\[', right: '\\]', display: true},
			{left: '$', right: '$', display: false},
			{left: '\\(', right: '\\)', display: false},
		]})
	} catch(e) {
		console.warn(e.message)
	}

	var message = document.createElement('div')
	message.appendChild(nick)
	message.appendChild(textEl)
	message.classList.add('message')

	var atBottom = ((window.innerHeight + window.scrollY) >= document.body.scrollHeight)
	$('#messages').appendChild(message)
	if (atBottom) {
		window.scrollTo(0, document.body.scrollHeight)
	}

	// Change title if inactive
	if (!windowActive) {
		unread += 1
		updateTitle()
	}
}


var windowActive = true
var unread = 0

window.onfocus = function() {
	windowActive = true
	unread = 0
	updateTitle()
}

window.onblur = function() {
	windowActive = false
}

function updateTitle() {
	var title = ''
	if (unread > 1) {
		title += '(' + unread + ') '
	}
	title += 'hack.chat'
	document.title = title
}
