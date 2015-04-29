/**
 * Test user authentication support
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(true);

var exchange = 'authTest';
var p = amqp.getSender(connection, {target: exchange});
var r = amqp.getReceiver(connection, {source: exchange});
amqp.sub(r);

var limit = 10;
var counter = 0;

function publish(sender){
  if(counter <= limit){
    var m = 'couter : ' + counter;
    amqp.pub(p, null, null, {body: m}, null);
    counter++;
  }
}

connection.on('sendable', function(sender){
  console.log('got sendable single');
  publish(sender);
});
