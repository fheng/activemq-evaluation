/**
 * Test user authentication support
 */
var amqp = require('./amqp');

var connection = amqp.getConnection(true);

var exchange = 'authTest';
var p = amqp.getSender(connection, {target: exchange});
var r = amqp.getReceiver(connection, {source: exchange});

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

connection.on('connection_closed', function(){
  console.log('connection closed');
});
connection.on('connection_opened', function(){
  counter = 0;
  console.log('connection opened');
  amqp.sub(r);
});
