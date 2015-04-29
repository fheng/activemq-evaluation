/**
 * Test sending & receiving via virtual topics
 * The messages should replicated across all the virtual queues, and then distributed between subscribers on the same queue.
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(false);
var c2 = amqp.getConnection(false);

var t = {address:'topic://VirtualTopic.Tests'};
var p = amqp.getSender(connection, {target: t,durable: 2});
var r10 = amqp.getReceiver(c2, {source: {address: 'queue://Consumer.r1.VirtualTopic.Tests'}, durable: 2});
var r11 = amqp.getReceiver(c2, {source: {address: 'queue://Consumer.r1.VirtualTopic.Tests'}, durable: 2});
var r20 = amqp.getReceiver(c2, {source: {address: 'queue://Consumer.r2.VirtualTopic.Tests'}, durable: 2});
var r21 = amqp.getReceiver(c2, {source: {address: 'queue://Consumer.r2.VirtualTopic.Tests'}, durable: 2});

amqp.sub(r10);
amqp.sub(r11);

amqp.sub(r20);
amqp.sub(r21);

var sent = 0;
connection.on('sendable', function(sender){
  console.log('got sendable single');
  amqp.pub(sender, null, null, {body:'sequence-' + (++sent)}, null);
});