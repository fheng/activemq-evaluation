/**
 * Test sending & receiving via virtual topics
 * The messages should replicated across all the virtual queues, and then distributed between subscribers on the same queue.
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(true);

var p = amqp.getSender(connection);
var r10 = amqp.getReceiver(connection, {source: {address: 'queue://Consumer.r1.VirtualTopic.Tests.message', durable: 2}, name:'testSub1'});
var r11 = amqp.getReceiver(connection, {source: {address: 'queue://Consumer.r1.VirtualTopic.Tests.message', durable: 2}, name:'testSub2'});
var r20 = amqp.getReceiver(connection, {source: {address: 'queue://Consumer.r2.VirtualTopic.Tests.message', durable: 2}, name:'testSub3'});
var r21 = amqp.getReceiver(connection, {source: {address: 'queue://Consumer.r2.VirtualTopic.Tests.message', durable: 2}, name:'testSub4'});

amqp.sub(r10);
amqp.sub(r11);

amqp.sub(r20);
amqp.sub(r21);

var sent = 0;
connection.on('sendable', function(sender){
  var addr = 'topic://VirtualTopic.Tests.message';
  amqp.pub(sender, null, null, {to:addr, body:'sequence-' + (sent++)}, null);
});