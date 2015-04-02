var crypto = require('crypto');

function toKey(seed) {
	var buf = new Buffer(crypto.createHash('sha1').update(seed).digest('hex'), 'hex');
	return buf.toString('hex');
}

// calculate the distance using XOR between two IDs
function distance(id1, id2) {
	var buf1 = hex2Buf(id1);
	var buf2 = hex2Buf(id2);
	var distance = new Buffer(buf1.length);

	for (var i = 0; i < distance.length; i++) {
		distance[i] = buf1[i] ^ buf2[i];
	}

	return buf2Int(distance);
}

// convert a buffer to an integer value
function buf2Int(buf) {
	var hex = buf.toString('hex');

	return parseInt(hex, 16);
}

function hex2Buf(hex) {
	var buf = new Buffer(20);
	buf.write(hex, 0, 'hex');
	return buf;
}

// generate a random ID
function randomID() {
	// generate random seed
	var seed = crypto.randomBytes(20);
	// use seed to generate random sha1 ID
	return toKey(seed);
}

// generate a random key is in the range of a given bucket
function generateKeyInBucket(bucketIndex, id) {
	var inBucket = false;
	var key;

	while(!inBucket) {
		key = generateKeyLessThanBucket(bucketIndex, id);
		if (getBucketIndex(key, id) == bucketIndex) inBucket = true;
	}

	return key;
}

// will be less than the bucket only half the time
function generateKeyLessThanBucket(bucketIndex, id) {
	var idBuf = hex2Buf(id);
	var randKey = new Buffer(20);
	var maxByteIndex = 19 - Math.floor(bucketIndex / 8);

	for (var i = 19; i > maxByteIndex; i--) {
		randKey[i] = Math.floor(Math.random() * 256);
	}

	var maxBitIndex = (bucketIndex % 8) + 1;
	var maxByte = idBuf[maxByteIndex];
	var maxInt = Math.pow(2, maxBitIndex);

	// set the bits to be randomized to 0 and add new randomized bits (maxBitIndex-1 must be opposite)
	randKey[maxByteIndex] = ((maxByte >> maxBitIndex) << maxBitIndex) + (Math.floor(Math.random() * maxInt));

	// fill the rest of the key the same bits as the original id
	for (var i = maxByteIndex - 1; i >= 0; i--) {
		randKey[i] = idBuf[i];
	}

	return randKey.toString('hex');
}

// find the bucket from ID2 that should hold ID1 
function getBucketIndex(id1, id2) {
	return Math.floor(Math.log(distance(id1, id2)) / Math.LN2);
}

// sort by ascending distance
function sortContacts(key, contacts) {
	contacts.sort(function(a, b) {
		return distance(key, a.nodeID) - distance(key, b.nodeID);
	});
}

// index of a contact in a list of contacts
function contactIndex(contact, list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i].nodeID === contact.nodeID) return i;
	}

	return -1;
}

// remove every instance of a contact in the list
function removeContact(contact, list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i].nodeID === contact.nodeID) list.splice(i, 1);
	}
}

// index of a node in a list of nodes
function nodeIndex(id, list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i].id === id) return i;
	}

	return -1;
}

// find the n closest nodes to the key given an array of contacts of any size
function findNClosest(key, arr, n) {
	var nClosest = [];

	for (var i = 0; i < arr.length; i++) {
		// ensure there are no duplicates
		var dup = false;
		for (var j = 0; j < nClosest.length; j++) {
			if (arr[i].nodeID === nClosest[j].nodeID) {
				dup = true;
				break;
			}
		}
		
		if (!dup) {
			nClosest.push(arr[i]);

			if (nClosest.length > n) {
				sortContacts(key, nClosest);

				// remove the last element
				nClosest.pop();
			}
		}
	}

	return deepClone(nClosest);
}

// find a key/value pair in a list of them
function pairIndex(key, list) {
	for (var i = 0; i < list.length; i++) {
		if (list[i].key === key) return i;
	}

	return -1;
}

// Inefficient way of deep cloning a list of contacts
function deepClone(list) {
	return JSON.parse(JSON.stringify(list));
}

// print out rpc messages
function logMessage(message, toID, fromID, received) {
	var direction, to, from;
	if (received) {
		direction = 'RECEIVED';
		to = 'BY: ';
		from = 'FROM: ';
	} else {
		direction = 'SENT';
		to = 'TO: ';
		from = 'BY: ';
	}

	console.log('****************************************');
	console.log('MESSAGE ' + direction);
	console.log(to + toID);
	console.log(from + fromID);
	console.log(message);
	console.log('****************************************\n');
}

module.exports = {
	toKey: toKey,
	distance: distance,
	buf2Int: buf2Int,
	randomID: randomID,
	generateKeyInBucket: generateKeyInBucket,
	getBucketIndex: getBucketIndex,
	sortContacts: sortContacts,
	contactIndex: contactIndex,
	removeContact: removeContact,
	nodeIndex: nodeIndex,
	findNClosest: findNClosest,
	pairIndex: pairIndex,
	deepClone: deepClone,
	logMessage: logMessage
}