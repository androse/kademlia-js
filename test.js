var KadNode = require('./lib/kadnode.js');

var nodePort = 9990;
var nodes = [];
var mode = process.argv[2];
var networkSize = parseInt(process.argv[3], 10);
var numberToFail = parseInt(process.argv[4], 10);

// initial node
nodes.push(new KadNode(nodePort));
nodes[0].join(null);
networkSize--;


if (mode === 'testput') {
	// 1. create all nodes in network
	// 2. remove nodes from network
	// 3. test how long put takes
	createNetwork(killNodes, putKVPair, 
		function() {
			console.log('DONE');
			process.exit();
		}
	);
} 

if (mode === 'testget') {
	// 1. all nodes in network
	// 2. put a key/value pair in the network
	// 3. remove nodes from the network
	// 4. test getting the pair
	createNetwork(putKVPair, killNodes, getValue, 
		function(result) {
			console.log(result);
			process.exit();
		}	
	);
}

function createNetwork() {
	var numNodes = networkSize;
	var cbs = arguments;

	// create the new node every 1s to allow each node to build up their buckets properly
	var newNodeInterval = setInterval(function() {
		if (numNodes <= 0) {
			clearInterval(newNodeInterval);
			// wait for the network to stabilize
			setTimeout(function() {
				console.log('NETWORK WITH ' + networkSize + ' NODES STABILIZED');
				
				if (cbs.length === 3) {
					cbs[0](cbs[1], cbs[2]);
				}

				if (cbs.length === 4) {
					cbs[0](cbs[1], cbs[2], cbs[3]);
				}
			}, 5000);
		} else {
			newNode();
			numNodes--;
		}
	}, 500);
}

function killNodes() {
	for (var i = 0; i < numberToFail; i++) {
		var randIndex = Math.floor(Math.random() * nodes.length);
		removeNode(randIndex);
	}

	console.log(numberToFail + ' NODES FAILED');
	arguments[0](arguments[1]);
}

function getValue() {
	var cbs = arguments;

	// choose a random node and attempt to get a key/value pair
	var randIndex = Math.floor(Math.random() * nodes.length);
	nodes[randIndex].get('cool',
		function(value) {
			cbs[0]('SUCCESS')
		},
		function(results) {
			cbs[0]('FAIL with ' + results.length + ' nodes');
	});
}

function putKVPair() {
	// choose a random node and measure the amount of time it takes to store the key/value pair
	var randIndex = Math.floor(Math.random() * nodes.length);
	var cbs = arguments;

	// start timer
	console.time('PUT TIME');

	nodes[randIndex].put('cool', 'cool', function(numStored) {
		console.log('KEY/VALUE PAIR STORED AT ' + numStored + ' NODES IN ' );
		// end timer
		console.timeEnd('PUT TIME');

		if (cbs.length === 3) {
			cbs[0](cbs[1], cbs[2]);
		}

		if (cbs.length === 1) {
			cbs[0]();
		}
	});
}

function newNode() {
	nodePort++;
	var node = new KadNode(nodePort);
	// use the oldest node as the known contact
	node.join(nodes[0].getContact());
	//console.log(node.id + ' CREATED');
	nodes.push(node);
}

function removeNode(index) { 
	//console.log(nodes[index].id + ' REMOVED');
	nodes[index].leave();
	nodes.splice(index, 1);
}