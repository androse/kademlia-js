var utils = require('./utils.js');
var network = require('./config/network.js');

function RPC(socket, eventEmitter) {
	this.socket = socket;
	this.eventEmitter = eventEmitter;
}

RPC.prototype.ping = function(to, fromID, failureCB) {
	// generate RPCID 
	var rpcID = utils.randomID();
	
	// send the ping message
	sendMessage(to, fromID, rpcID, '', 'PING', this.socket, function(err, bytes) {
		pingTimeout = setTimeout(failureCB, network.timeout);
		
		// on receiving a message with the same rpcID end the timer that would
		// call the failureCB
		this.eventEmitter.on(rpcID, function() {
			clearTimeout(pingTimeout);

			this.eventEmitter.removeAllListeners(rpcID);
		}.bind(this));
	}.bind(this));
}

// PONG
RPC.prototype.pingReply = function(rpcID, to, fromID) {
	sendMessage(to, fromID, rpcID, '', 'PONG', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

RPC.prototype.store = function(to, fromID, key, value) {
	var rpcID = utils.randomID();
	var body = {key: key, value: value};

	sendMessage(to, fromID, rpcID, body, 'STORE', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

RPC.prototype.findNode = function(to, fromID, findKey, shortlistIndex, callback) {
	var rpcID = utils.randomID();
	var body = {key: findKey};

	// sets the event listener for the return message event
	callback(rpcID, shortlistIndex);

	sendMessage(to, fromID, rpcID, body, 'FIND_NODE', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

RPC.prototype.findNodeReply = function(rpcID, to, fromID, kContacts) {
	var body = {contacts: kContacts};
	sendMessage(to, fromID, rpcID, body, 'REPLY', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

RPC.prototype.findValue = function(to, fromID, findKey, shortlistIndex, callback) {
	var rpcID = utils.randomID();
	var body = {key: findKey};

	callback(rpcID, shortlistIndex);

	sendMessage(to, fromID, rpcID, body, 'FIND_VALUE', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

RPC.prototype.findValueReply = function(rpcID, to, fromID, body) {
	sendMessage(to, fromID, rpcID, body, 'REPLY', this.socket, function(err, bytes) {
		if (err) console.log(err);
	});
}

function sendMessage(to, fromID, rpcID, messageBody, messageType, socket, callback) {
	var message = {
		type: messageType,
		fromID: fromID,
		rpcID: rpcID,
		body: messageBody
	};

	var bufMessage = new Buffer(JSON.stringify(message), 'utf8');

	socket.send(bufMessage, 0, bufMessage.length, to.port, to.ip, callback);
	//utils.logMessage(JSON.stringify(message), to.nodeID, fromID, false);
}

module.exports = RPC;