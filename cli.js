#!/usr/bin/env node
'use strict';

var meow = require('meow');
var hackChat = require('./');

var cli = meow({
	help: [
		'Usage',
		'  $ hack-chat',
		'',
		'Options',
		'  --foo  Lorem ipsum. Default: false'
	]
});

hackChat();
