var dgram = require('dgram');
var events = require('events');
var network = require('./config/network.js');
var KBucket = require('./kbucket.js');
var RPC = require('./rpc.js');
var KVPair = require('./kvpair.js');
var utils = require('./utils.js');

function KadNode(port) {
	// generate a random id
	this.id = utils.randomID();

	// create a udp socket that listens on the specified port and calls 
	// onMessage when a message is received
	this.port = port;
	this.socket = dgram.createSocket('udp4', this.onMessage.bind(this));

	// create a new event emitter
	this.eventEmitter = new events.EventEmitter();

	// create a new RPC object
	this.rpc = new RPC(this.socket, this.eventEmitter);

	// generate 160 empty buckets with a refresh timer
	this.kBuckets = [];
	for (var i = 0; i < 160; i++) {
		// passing the callback this way ensures the proper i is used in the function
		var refreshTimeout = setTimeout(this.refresh.bind(this), network.tRefresh, [i]);
		this.kBuckets[i] = new KBucket(this.id, this.rpc, refreshTimeout);
	}

	// create an empty array to hold key/value pairs 
	this.kvPairs = [];

	// start the replicate and republish timers
	setInterval(this.replicate, network.tReplicate);
	setInterval(this.republish, network.tRepublish);
}

KadNode.prototype.join = function(knownContact) {
	// bind to the desired socket
	this.socket.bind(this.port, function() {
		// Do nothing if there is no known contact (the first in the network)
		if (knownContact) {
			// add the known contact to the appropriate bucket
			this.kBuckets[utils.getBucketIndex(knownContact.nodeID, this.id)].bucket.push(knownContact);

			// perform a node lookup on the node's own id
			this.iterativeFindNode(this.id, function(closestNodes) {
				// refresh all buckets further away than closest neighbour/
				// (buckets with index higher than the lowest non-empty bucket)
				var refreshMin;
				for (var i = 0; i < this.kBuckets.length; i++) {
					if (this.kBuckets[i].bucket.length !== 0) {
						refreshMin = i + 1;
						break;
					}
				}

				for (var i = refreshMin; i < this.kBuckets.length; i++) {
					this.refresh(i);
				}
			}.bind(this));
		}
	}.bind(this));
}

KadNode.prototype.leave = function() {
	// close the socket
	this.socket.close();
	// stop listening for any events
	this.eventEmitter.removeAllListeners();
}

// add a key/value pair to the dht
KadNode.prototype.put = function(strKey, value, callback) {
	var key = utils.toKey(strKey);

	// set the expire timeout (when to remove the key/value pair)
	var expireTimeout = setTimeout(function() {
		// find and remove the key/value pair
		var index = utils.pairIndex(key, this.kvPairs);
		this.kvPairs.splice(index, 1);
	}.bind(this), network.tExpire)

	// create a new key/value pair and knowing that this is not the publisher
	var kvPair = new KVPair(key, value, true, expireTimeout);

	var index = utils.pairIndex(kvPair.key, this.kvPairs);
	// if the key already exists, replace/update it
	if (index > -1) {
		// clear the old expire timeout
		clearTimeout(this.kvPairs[index].expireTimeout);
		this.kvPairs[index] = kvPair;
	// if it does't already exist, add the new pair to the end of the array
	} else this.kvPairs.push(kvPair);

	// need a way to determine who is publisher
	this.iterativeStore(key, value, callback);
}

// retrieve a value 
KadNode.prototype.get = function(strKey, successCB, failureCB) {
	var key = utils.toKey(strKey);

	this.iterativeFindValue(key, function(result, valueFound) {
		if (valueFound) {
			// pass the found value to the cb
			successCB(result);
		} else {
			// k closest contacts passed to the cb
			failureCB(result);
		}
 	});
}

// Replicate all the nodes key/value pairs
KadNode.prototype.replicate = function() {
	for (var i = 0; i < this.kvPairs.length; i++) {
		this.iterativeStore(this.kvPairs[i].key, this.kvPairs[i].pair);
	}
}

// Republish only the nodes that have the node has published
KadNode.prototype.republish = function() {
	for (var i = 0; i < this.kvPairs.length; i++) {
		if (this.kvPairs[i].publisher) {
			this.iterativeStore(this.kvPairs[i].key, this.kvPairs[i].pair);
		}
	}
}

// If no lookup has been performed on an id in a buckets range for a given refresh period
// a lookup for a random id in the range is performed
KadNode.prototype.refresh = function(bucketIndex) {
	// generate a random number in the bucket's range
	var randKey = utils.generateKeyInBucket(bucketIndex, this.id);

	// do a iterative find node on that key and do nothing with the result
	this.iterativeFindNode(randKey, function(closestNodes) {});

	this.resetRefresh(randKey);
}

// If a lookup has been performed on an id in the buckets range, reset the refresh timer
KadNode.prototype.resetRefresh = function(id) {
	// get the bucket to which the id belongs
	var bucketIndex = utils.getBucketIndex(id, this.id);

	// prevent current timeout
	clearTimeout(this.kBuckets[bucketIndex].refreshTimeout);

	// restart the timer
	this.kBuckets[bucketIndex].refreshTimeout = setTimeout(this.refresh.bind(this), network.tRefresh, [bucketIndex]);
}

KadNode.prototype.iterativeStore = function(key, value, callback) {
	// obtain the k closest nodes to the key
	this.iterativeFindNode(key, function(closestNodes) {
		// store the value in each of these nodes
		for (var i = 0; i < closestNodes.length; i++) {
			this.rpc.store(closestNodes[i], this.id, key, value);
		} 

		callback(closestNodes.length);
	}.bind(this));
}

function findNClosestContacts(key, ownID, n, buckets) {
	var closest = [];
	var closestBucket;

	// if looking for yourself
	if (key === ownID) {
		// start looking from the center of the list of buckets
		closestBucket = Math.floor(159 / 2);
	} else {
		// get the bucket that would hold the key and add it to a list of possible n closest contacts
		closestBucket = utils.getBucketIndex(key, ownID);
		closest = closest.concat(utils.deepClone(buckets[closestBucket].bucket));
	}

	// add more contacts until there is at least n to select from or there are none left
	var it = 1;
	while (closest.length < n && (it * 2) <= buckets.length)  {
		var above = closestBucket + it;
		var below = closestBucket - it;

		if (above < (buckets.length)) {
			closest = closest.concat(utils.deepClone(buckets[above].bucket));
		} 

		if (below >= 0) {
			closest = closest.concat(utils.deepClone(buckets[below].bucket));
		}

		it++
	}

	// return exactly n closest contacts from the possibly larger list
	return utils.findNClosest(key, closest, n);
}

// return true if all contacts in a list are active, false otherwise
function allActive(list) {
	if (list.length === 0) return false;

	for (var i = 0; i < list.length; i++) {
		if ((typeof list[i].status === 'undefined') || (list[i].status === 'queried')) {
			return false;
		}
	}

	return true;
}

KadNode.prototype.iterativeFindNode = function(key, callback) {
	var queryNumber = network.alpha;

	var shortlist = findNClosestContacts(key, this.id, queryNumber, this.kBuckets);	

	this.findNode(key, shortlist, queryNumber, callback);
}

KadNode.prototype.findNode = function(key, shortlist, queryNumber, callback) {
	var remaining = 0;
	var toRemove = [];
	for (var i = 0; (i < shortlist.length) && (remaining < queryNumber); i++) {
		if (typeof shortlist[i].status == 'undefined') {
			remaining++;
			shortlist[i].status = 'queried';

			// find node called so reset the refresh
			this.resetRefresh(shortlist[i].nodeID);

			// using shortlistIndex instead of i ensures that the index is not a reference to one that changes
			this.rpc.findNode(shortlist[i], this.id, key, i, function(rpcID, shortlistIndex) {
				// timeout for replies
				var replyTimeout = setTimeout(function() {
					// stop listening for this rpcID event
					this.eventEmitter.removeAllListeners(rpcID);

					// add it to a list of inactive nodes to remove
					toRemove.push(shortlist[shortlistIndex]);
					remaining--;

					// make sure that all queried have responded or timedout
					if (remaining === 0) {
						// save the previous closest node
						var prevClosestNode = shortlist[0];
						
						// remove all instances of an inactive contact
						for (var j = 0; j < toRemove.length; j++) {
							utils.removeContact(toRemove[j], shortlist);
						}
						// update the shortlist
						shortlist = utils.findNClosest(key, shortlist, network.k);

						// check if all contacts are active and therefore the lookup is complete
						if (allActive(shortlist)) callback(shortlist);
						else {
							// if the closest node hasn't changed query all unqueried nodes in the shortlist
							if (utils.contactIndex(prevClosestNode, shortlist) === 1) queryNumber = network.k;
							// if it has changed, query a max of alpha unqueried nodes in the shortlist
							else queryNumber = network.alpha;

							this.findNode(key, shortlist, queryNumber, callback);
						}
					}
				}.bind(this), network.timeout);

				// triggered when the return message is recieved
				this.eventEmitter.on(rpcID, function(message) {
					// stop the timeout timer
					clearTimeout(replyTimeout);
					// stop listening for this rpcID event
					this.eventEmitter.removeAllListeners(rpcID);

					shortlist[shortlistIndex].status = 'active';

					// add the received contacts to the shortlist
					shortlist = shortlist.concat(message.body.contacts);
					remaining--;

					// make sure that all queried have responded or timedout
					if (remaining === 0) {
						// save the previous closest node
						var prevClosestNode = shortlist[0];

						// remove all instances of an inactive contact
						for (var j = 0; j < toRemove.length; j++) {
							utils.removeContact(toRemove[j], shortlist);
						}
						// update the shortlist
						shortlist = utils.findNClosest(key, shortlist, network.k);

						// check if all contacts are active and therefore the lookup is complete
						if (allActive(shortlist)) callback(shortlist);
						else {
							// if the closest node hasn't changed query all unqueried nodes in the shortlist
							if (utils.contactIndex(prevClosestNode, shortlist) === 1) queryNumber = network.k;
							// if it has changed, query a max of alpha unqueried nodes in the shortlist
							else queryNumber = network.alpha;

							this.findNode(key, shortlist, queryNumber, callback);
						}
					}
				}.bind(this));
			}.bind(this));
		}
	}
}

KadNode.prototype.iterativeFindValue = function(key, callback) {
	var queryNumber = network.alpha;

	var shortlist = findNClosestContacts(key, this.id, queryNumber, this.kBuckets);	

	this.findValue(key, shortlist, queryNumber, callback);
}

KadNode.prototype.findValue = function(key, shortlist, queryNumber, callback) {
	var remaining = 0;
	var toRemove = [];
	var found = false;
	var value;
	for (var i = 0; (i < shortlist.length) && (remaining < queryNumber); i++) {
		if (typeof shortlist[i].status == 'undefined') {
			remaining++;
			shortlist[i].status = 'queried';

			// find value called so reset the refresh
			this.resetRefresh(shortlist[i].nodeID);

			this.rpc.findValue(shortlist[i], this.id, key, i, function(rpcID, shortlistIndex) {
				// timeout for replies
				var replyTimeout = setTimeout(function() {
					// stop listening for this rpcID event
					this.eventEmitter.removeAllListeners(rpcID);

					// add it to a list of inactive nodes to remove
					toRemove.push(shortlist[shortlistIndex]);
					remaining--;
					
					// make sure that all queried have responded or timedout
					if (remaining === 0) {
						// save the previous closest node
						var prevClosestNode = shortlist[0];

						// remove all instances of an inactive contact
						for (var j = 0; j < toRemove.length; j++) {
							utils.removeContact(toRemove[j], shortlist);
						}
						// update the shortlist
						shortlist = utils.findNClosest(key, shortlist, network.k);

						if (found) {
							// store the key value pair at the closest node that did not return the value
							for (var j = 0; j < shortlist.length; j++) {
								if (typeof shortlist[j].status != 'undefined'
									&& shortlist[j].status === 'active') {
									this.rpc.store(shortlist[j], this.id, key, value);
									break;
								}
							}
						// check if all contacts are active and therefore the lookup is complete
						} else if (allActive(shortlist)) {
							callback(shortlist, false);
						} else {
							// if the closest node hasn't changed query all unqueried nodes in the shortlist
							if (utils.contactIndex(prevClosestNode, shortlist) === 1) queryNumber = network.k;
							// if it has changed, query a max of alpha unqueried nodes in the shortlist
							else queryNumber = network.alpha;

							this.findValue(key, shortlist, queryNumber, callback);
						}
					}
				}.bind(this), network.timeout);

				// triggered when the return message is recieved
				this.eventEmitter.on(rpcID, function(message) {
					// stop the timeout timer
					clearTimeout(replyTimeout);
					// stop listening for this rpcID event
					this.eventEmitter.removeAllListeners(rpcID);

					shortlist[shortlistIndex].status = 'active';

					remaining--;

					// if the value is returned
					if (typeof message.body.value != 'undefined') {
						value = message.body.value;
						// if first to find it pass the found value to the callback
						if (!found) callback(value, true);
						found = true;
						shortlist[shortlistIndex].status = 'returner';
					// if not found and contacts returned
					} else if (typeof message.body.contacts != 'undefined') {
						// add the received contacts to the shortlist
						shortlist = shortlist.concat(message.body.contacts);
					}

					// make sure that all queried have responded
					if (remaining === 0) {
						// save the previous closest node
						var prevClosestNode = shortlist[0];

						// remove all instances of an inactive contact
						for (var j = 0; j < toRemove.length; j++) {
							utils.removeContact(toRemove[j], shortlist);
						}
						// update the shortlist
						shortlist = utils.findNClosest(key, shortlist, network.k);

						if (found) {
							// store the key value pair at the closest node that did not return the value
							for (var j = 0; j < shortlist.length; j++) {
								if (typeof shortlist[j].status != 'undefined'
									&& shortlist[j].status === 'active') {
									this.rpc.store(shortlist[j], this.id, key, value);
									break;
								}
							}
						// check if all contacts are active and therefore the lookup is complete
						} else if (allActive(shortlist)) {
							callback(shortlist, false);
						} else {
							// if the closest node hasn't changed query all unqueried nodes in the shortlist
							if (utils.contactIndex(prevClosestNode, shortlist) === 1) queryNumber = network.k;
							// if it has changed, query a max of alpha unqueried nodes in the shortlist
							else queryNumber = network.alpha;

							this.findValue(key, shortlist, queryNumber, callback);
						}
					}
				}.bind(this));
			}.bind(this));
		}
	}
}

KadNode.prototype.onMessage = function(data, rinfo) {
	var message = JSON.parse(data.toString('utf8'));
	var fromContact = {nodeID: message.fromID, ip: rinfo.address, port: rinfo.port};

	// update the appropriate bucket
	this.kBuckets[utils.getBucketIndex(fromContact.nodeID, this.id)].update(fromContact);

	switch (message.type) {
		case 'PING':
			this.onPing(message, fromContact);
			break;
		case 'PONG':
			this.eventEmitter.emit(message.rpcID, message);
			break;
		case 'STORE':
			this.onStore(message);
			break;
		case 'FIND_NODE': 
			this.onFindNode(message, fromContact);
			break;
		case 'FIND_VALUE':
			this.onFindValue(message, fromContact);
			break;
		case 'REPLY':
			this.eventEmitter.emit(message.rpcID, message);
			break;
	}
} 

KadNode.prototype.onPing = function(message, fromContact) {
	// pong back
	this.rpc.pingReply(message.rpcID, fromContact, this.id);
}

KadNode.prototype.onStore = function(message) {
	var key = message.body.key;

	// set the expire timeout (when to remove the key/value pair)
	var expireTimeout = setTimeout(function() {
		// find and remove the key/value pair
		var index = utils.pairIndex(key, this.kvPairs);
		this.kvPairs.splice(index, 1);
	}.bind(this), network.tExpire)

	// create a new key/value pair and knowing that this is not the publisher
	var kvPair = new KVPair(key, message.body.value, false, expireTimeout);

	var index = utils.pairIndex(kvPair.key, this.kvPairs);
	// if the key already exists, replace/update it
	if (index > -1) {
		// clear the old expire timeout
		clearTimeout(this.kvPairs[index].expireTimeout);
		this.kvPairs[index] = kvPair;
	// if it does't already exist, add the new pair to the end of the array
	} else this.kvPairs.push(kvPair);
 	
	// reply when successful?
}

KadNode.prototype.onFindNode = function(message, fromContact) {
	// find the k closest contacts
	var kContacts = findNClosestContacts(message.body.key, this.id, network.k + 1, this.kBuckets);	
	
	// ensure that a contact is not returned to itself
	var fromIndex = utils.contactIndex(fromContact, kContacts);
	if (fromIndex > -1) {
		// remove the contact
		kContacts.splice(fromIndex, 1);
	} else {
		// remove the extra contact
		kContacts.pop();
	}

	// reply with the k closest contacts
	this.rpc.findNodeReply(message.rpcID, fromContact, this.id, kContacts);
}

KadNode.prototype.onFindValue = function(message, fromContact) {
	// check to see if holding the key value pair
	var pairIndex = utils.pairIndex(message.body.key, this.kvPairs);
	var body;
	
	// if yes return it
	if (pairIndex > -1) {
		body = {value: this.kvPairs[pairIndex].value};
	// if no 
	} else {
		// find the k closest contacts
		var kContacts = findNClosestContacts(message.body.key, this.id, network.k + 1, this.kBuckets);

		// ensure that a contact is not returned to itself
		var fromIndex = utils.contactIndex(fromContact, kContacts);
		if (fromIndex > -1) {
			// remove the contact
			kContacts.splice(fromIndex, 1);
		} else {
			// remove the extra contact
			kContacts.pop();
		}

		// reply with the k closest contacts
		body = {contacts: kContacts};
	}

	this.rpc.findValueReply(message.rpcID, fromContact, this.id, body);
}

KadNode.prototype.getContact = function() {
	var contact = {
		nodeID: this.id,
		ip: '0.0.0.0',
		port: this.port
	}

	return contact;
}

KadNode.prototype.getInfo = function() {
	var node = {
		nodeID: this.id,
		port: this.port,
		pairs: this.kvPairs,
		numContacts: 0,
		buckets: []
	}

	for (var i = 0; i < this.kBuckets.length; i++) {
		if (this.kBuckets[i].bucket.length > 0) {
			node.numContacts += this.kBuckets[i].bucket.length;

			var bucket = {
				index: i,
				contacts: this.kBuckets[i].bucket
			};

			node.buckets.push(bucket);
		}
	}

	return node;
}

KadNode.prototype.logStats = function() {
	console.log('----------------------------------------');
	console.log('ID: ' + this.id);
	console.log('Key/Value Pairs:');
	console.log(this.kvPairs);
	console.log('Contacts:');
	for (var i = 0; i < this.kBuckets.length; i++) {
		if (this.kBuckets[i].bucket.length > 0) {
			console.log('\tBucket ' + i);
			for (var j = 0; j < this.kBuckets[i].bucket.length; j++) {
				console.log('\t\t' + this.kBuckets[i].bucket[j].nodeID);
				console.log('\t\t' + this.kBuckets[i].bucket[j].ip);
				console.log('\t\t' + this.kBuckets[i].bucket[j].port);
			}
		}
	}
	console.log('----------------------------------------\n');
}

module.exports = KadNode;