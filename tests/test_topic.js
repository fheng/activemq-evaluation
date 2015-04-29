/**
 * Test sending and receving via topics.
 * Receivers should receive messages based on the patterns specified.
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(false);
var c2 = amqp.getConnection(false);

var t = {address:'topic://amqp.test.>'};
var p = amqp.getSender(connection, {target: t, durable: 2});
var r = amqp.getReceiver(c2, {source: {address: 'topic://amqp.test.r1.*', durable: 2}});
var r2 = amqp.getReceiver(c2, {source: {address: 'topic://amqp.test.r2.*', durable: 2}});

amqp.sub(r);
amqp.sub(r2);

var sent = 0;
connection.on('sendable', function(sender){
  console.log('got sendable single');
  var s = ('amqp.test.') + (sent%2 === 0? 'r1':'r2') + '.message';
  amqp.pub(sender, null, null, {body: s, destination: s, subject:s}, null);
  sent++;
});