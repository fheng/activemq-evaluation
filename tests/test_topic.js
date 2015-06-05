/**
 * Test sending and receving via topics.
 * Receivers should receive messages based on the patterns specified.
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(true);
//var c2 = amqp.getConnection(true);

var p = amqp.getSender(connection);
var r = amqp.getReceiver(connection, {source: {address: 'topic://amqp.test.r1.*', durable: 2}});
var r2 = amqp.getReceiver(connection, {source: {address: 'topic://amqp.test.r2.*', durable: 2}});

amqp.sub(r);
amqp.sub(r2);

var sent = 0;
connection.on('sendable', function(sender){
  console.log('got sendable single');
  var s = 'topic://amqp.test.' + (sent%2 === 0? 'r1':'r2') + '.message';
  amqp.pub(sender, null, null, {body: s, to: s, subject:s}, null);
  sent++;
});