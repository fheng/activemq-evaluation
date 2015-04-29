/**
 * Test sending and receving via queues.
 * Expect messages should be distributed between receivers
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(false);
var c2 = amqp.getConnection(false);

var q = 'directQ';
var p = amqp.getSender(connection, {target: q, durable: 2});
var r = amqp.getReceiver(c2, {source: q, durable: 2});
var r2 = amqp.getReceiver(c2, {source: q, durable: 2});

amqp.sub(r);
amqp.sub(r2);

var sent = 0;
connection.on('sendable', function(sender){
  console.log('got sendable single');
  amqp.pub(sender, null, null, {body: 'sequence-' + (++sent)}, null);
});