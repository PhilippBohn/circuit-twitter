var config = require('./config.json');
var user = require('./user.json');
var Circuit = require('circuit');
var Twit = require('twit');
var bunyan = require('bunyan');
var logger = bunyan.createLogger({
	name: 'CircuitBot',
	stream: process.stderr,
	level: config.apiLogLevel
});

// Twitter RW connection
var T = new Twit({
	consumer_key:			config.consumer_key,
	consumer_secret:		config.consumer_secret,
	access_token:			config.access_token,
	access_token_secret:	config.access_token_secret
});

Circuit.setLogger(logger);
var _user, _state, _lastLogin, _lastStateChange;
var tweetedMessages = [];

console.info('init----------------------------------------');

function registerEventListeners()
{
	console.info('registerEventListeners');

	_user.addEventListener('itemAdded', function (evt) {
		console.info('user.onitemAdded-----------------------------');
		console.log(JSON.stringify(evt, null, 2));
		if (user[evt.item.creator.emailAddress] !== undefined)
		{
			T.post('statuses/update', { status: evt.item.text }, function(err, data, response) {
				console.info('tweet.sent.via.API-----------------------------');
				//console.log(data);
				// save tweet id to not publish tweet back to Circuit
				tweetedMessages.push(data.id_str);
			})
		}
	});

	_user.addEventListener('itemUpdated', function (evt) {
		//console.info('user.onItemUpdated---------------------------');
		//console.log(JSON.stringify(evt, null, 2));
	});

	_user.addEventListener('renewTokenError', function () {
		console.info('user.onRenewTokenError----------------------');
		console.log(JSON.stringify(evt, null, 2));
		reconnectCircuit();
	});
}

function connectCircuit()
{
	console.info('connect-------------------------------------');
	_lastLogin = new Date();
	Circuit.logon(config.user, config.password, config.domain).then(function(user) {
		_user=user;
		console.info('logonResponse-------------------------------');
		console.info('starting as ' + _user.emailAddress);
		registerEventListeners();
	}, function(err) {
		console.error('onLogonResponse: UNABLE TO LOGON ' + err + ' - ' + _state);
		console.error('will retry to connect in ' + config.minLogonInterval + ' [ms]');
		global.setTimeout(connectCircuit, config.minLogonInterval);
	});
}

function reconnectCircuit() {
	console.info('reconnect-----------------------------------');
	//logout raises onRegistrationStateChange with state Disconnected
	_user.logout();
};

Circuit.addEventListener('registrationStateChange', function (evt) {
	console.info('Circuit.onRegistrationStateChange------------');
	var now = new Date();
	console.info('old state  : ' + _state + '  ' + _lastStateChange);
	console.info('new state  : ' + evt.state + ' ' + now);
	_state = evt.state;
	_lastStateChange = new Date();
	if ( _state === 'Disconnected') {
		var delay = (Number(now) - Number(_lastLogin) < config.minLogonInterval) ? config.minLogonInterval : 0;
		global.setTimeout(connectCircuit, delay);
	}
});

connectCircuit();

/*
 *
 *	Twitter integration
 *
 */

var stream = T.stream('user');

stream.on('tweet', function (tweet) {

	console.info('tweet.received.via.Twitter-----------------------------');
	console.log(tweet);
	
	if (_state === 'Registered' && tweetedMessages.indexOf(tweet.id_str) === -1) {
		_user.getConversation(config.conversation, function (err, conv) {
			if (err) {
				console.error(err);
				return;
			}
			conv.sendMessage('<i>@' + tweet.user.screen_name + '</i><br><br>' + tweet.text, function (err, item) {
				if (err) {
					console.error(err);
					return;
				}
				console.info('circuit.API.feedback-----------------------------');
				console.log(JSON.stringify(item, null, 2))
			});
		});
	}
	// if we find our own tweet, we can remove it from the array
	else if (tweetedMessages.indexOf(tweet.id_str) > -1)
	{
		tweetedMessages.splice(tweetedMessages.indexOf(tweet.id_str), 1);
	}
});
