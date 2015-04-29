var hosts = require('./hosts');
var Container = require('../qpid-proton/lib/container.js');

module.exports = {
  getConnection: function(auth){
    var c = new Container();
    var hostInfo = hosts;
    if(auth){
      hostInfo.user = 'user';
      hostInfo.pass = 'password';
    }
    var connection = c.connect(hostInfo);
    return connection;
  },

  getSender: function(connection, options){
    return connection.create_sender(options);
  },

  getReceiver: function(connection, options){
    return connection.create_receiver(options);
  },

  pub: function(sender, exchange, queue, message, ops){
    if(sender.credit()){
      console.log('publishing message : ' + JSON.stringify(message));
      sender.send(message);
    }
  },

  sub: function(receiver){
    receiver.on('message', function(message){
      console.log('[' + receiver.name + ']' + JSON.stringify(message));
    });
  }
};