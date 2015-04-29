/**
 * Test failover. 
 * The client should connect to the next available broker if the current connection is interrupted.
 */
var amqp = require('./amqp');
var Container = require('../qpid-proton/lib/container.js');

var c = new Container();
var connection = c.connect({
  host: 'localhost, 192.168.33.10',
  port: 5672,
  user: 'user',
  pass: 'password'
});

var q = 'failover';
var p = amqp.getSender(connection, {target: q, durable: 2});
var r = amqp.getReceiver(c2, {source: q, durable: 2});


amqp.sub(r);

var sent = 0;
connection.on('sendable', function(sender){
  console.log('got sendable single');
  amqp.pub(sender, null, null, {body: 'sequence-' + (++sent)}, null);
});