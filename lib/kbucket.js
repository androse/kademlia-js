var network = require('./config/network.js');
var utils = require('./utils.js');

function KBucket(id, rpc, refreshTimeout) {
	this.id = id;
	this.rpc = rpc;
	this.refreshTimeout = refreshTimeout;
	this.bucket = [];
}

KBucket.prototype.update = function(contact) {
	var bucketIndex = utils.contactIndex(contact, this.bucket);

	// if the contact is already in the bucket
	if (bucketIndex > -1) {
		// remove the contact from the bucket
		this.bucket.splice(bucketIndex, 1); 
		// and move to the end of the bucket
		this.bucket.push(contact);
	} else {
		// if the bucket is full
		if (this.bucket.length === network.k) {
			// ping the contact at the head of the bucket
			this.rpc.ping(this.bucket[0], this.id, function() {
				// do nothing if a pong is received
				// if no pong is received failure callback
				// remove the first element
				this.bucket.shift();
				// new contact added to tail
				this.bucket.push(contact);
			}.bind(this));
		} else {
			this.bucket.push(contact);
		}
	}
}

module.exports = KBucket;