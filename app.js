var express = require('express'),
	app = express(),
	port = process.env.PORT || 8080,
	utils = require('./lib/utils.js');
	KadNode = require('./lib/kadnode.js');

// Configure templating engine
app.set('views', __dirname + '/views');
// Change to the desired templating engine
app.set('view engine', 'jade');

app.use(express.bodyParser()); // Parse form data

// ----------------------------------------------------------------------------

var nodePort = 9990;
var nodes = [];

// initial node
nodes.push(new KadNode(nodePort));
nodes[0].join(null);

var nodeNum = 1;

// ---------------------------------------------------------------------------- 

// add info about each node
function addInfo(req, res, next) {
	var infos = [];

	for (var i = 0; i < nodes.length; i++) {
		infos.push(nodes[i].getInfo());
	}

	req.nodes = infos;

	return next();
}


function newNode() {
	nodePort++;
	var node = new KadNode(nodePort);
	// use the oldest node as the known contact
	node.join(nodes[0].getContact());
	nodes.push(node);
}

function removeNode(index) { 
	nodes[index].leave();
	nodes.splice(index, 1);
}

// ---------------------------------------------------------------------------- 

// get info about entire network
app.get('/', addInfo, function(req, res) {
	res.render('index', {
		nodes: req.nodes
	});
});

// create a new node
app.get('/newnode', function(req, res) {
	newNode();
	res.redirect('/');
});

app.post('/newnodes', function(req, res) {
	var num = req.body.num;

	// create the new node every 200ms to avoid problems
	var newNodeInterval = setInterval(function() {
		if (num <= 0) clearInterval(newNodeInterval);
		else {
			newNode();
			num--;
		}
	}, 500);

	res.redirect('/');
})

app.post('/deletenodes', function(req, res) {
	var num = req.body.num;

	for (var i = 0; i < num; i++) {
		var randIndex = Math.floor(Math.random() * nodes.length); 
		removeNode(randIndex);
	}

	res.redirect('/');
})

// get info on a specific node
app.get('/node/:id', function(req, res) {
	res.render('node', {
		node: nodes[utils.nodeIndex(req.params.id, nodes)].getInfo()
	});
});

// put a new key/value pair as a specific node
app.post('/node/:id/pair', function(req, res) {
	var index = utils.nodeIndex(req.params.id, nodes);
	nodes[index].put(req.body.key, req.body.value, function(numStored) {
		console.log('STORED AT ' + numStored);
	});
	
	res.redirect('/node/' + req.params.id);
});

// get a value as a specific node
app.get('/node/:id/pair', function(req, res) {
	var index = utils.nodeIndex(req.params.id, nodes);
	nodes[index].get(req.query.key, 
		function(value) {
			res.render('query', {value: value});
		},
		function(results) {
			res.render('query');
		});
});

// remove a node from the netork
app.get('/node/:id/delete', function(req, res) {
	var index = utils.nodeIndex(req.params.id, nodes);
	removeNode(index);

	res.redirect('/');
});

app.listen(port);
console.log('App listening on port ' + port);