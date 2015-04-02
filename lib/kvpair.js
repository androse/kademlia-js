// key/value are obvious
// publisher is true if the this node is the original publisher of the pair
function KVPair(key, value, publisher, expireTimeout) {
	this.key = key;
	this.value = value;
	this.publisher = publisher;
	this.expireTimeout = expireTimeout;
}

module.exports = KVPair;