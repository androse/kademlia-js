#JS Kademlia

A Node.js Implementation of Kademlia

##Running it

To run the test script:
- Ensure that Node.js is installed
- Run the following in a command line or terminal:
	- To test the get operation: `node test.js testget [network size] [number of nodes to fail]`
	- To test the put operation: `node test.js testput [network size] [number of nodes to fail]`

To run the web GUI:
- Ensure that Node.js is installed
- Run the following in a command line or terminal: `node app.js`
- open a web browser and visit localhost:8080

##Notes

This code was intended as an academic project so is by no means ready for proper use.

All code used to implement Kademlia can be found in the `lib` directory.
