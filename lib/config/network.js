module.exports = {
	// timeout period (time to wait for reply)
	'timeout': 200,
	// degree of parallelism of a network call
	'alpha': 3,
	// size of a bucket
	'k': 20,
	// how long a key/value pair should last at a node
	'tExpire': 86400000,
	// how often a bucket should be refreshed (an hour in real kademlia)
	'tRefresh': 3600000,
	// how often a node should replicate its key/value pairs in the network
	'tReplicate': 3600000,
	// how often a node should republish the key/value pairs it originally published
	'tRepublish': 86400000
}