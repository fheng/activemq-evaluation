/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
 */

'use strict';

var proton = require("./qpid-proton.js");
var net = require("net");
var EventEmitter = require('events').EventEmitter;
var debug = false;

function foreach_startswith(prefix, o, f) {
    var p;
    for (p in o) {
        if (p.indexOf(prefix) == 0) {
            f(p.substring(prefix.length));
        }
    }
};

function to_proton_message(message, pn_message) {
    if (typeof message === 'string') {
        pn_message.set_body(message);
    } else {
        foreach_startswith('set_', pn_message, function (f) {
            if (message[f]) {
                pn_message['set_' + f](message[f]);
            }
        });
    }

    return pn_message;
};
function from_proton_message(pn_message) {
    var message = {};
        foreach_startswith('get_', pn_message, function (f) {
            var val = pn_message['get_' + f]();
            if (val) {
                message[f] = val;
            }
        });
    return message;
};

function generate_uuid() {
    // from http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript:
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    return uuid;
};

function dispatch(emitters, name, context, extra) {
    var i;
    for (i = 0; i < emitters.length; i++) {
        if (emitters[i].listeners(name).length || i === (emitters.length - 1)) {
            if (debug) console.log('Emitting ' + name + ' through ' + (i+1) + ' of ' + emitters.length + ' (' +emitters[i].listeners(name).length + ' listeners)');
            emitters[i].emit(name, context, extra);
            return emitters[i].listeners.length;
        }
    }
    return 0;
};

function get_socket_id(socket) {
    return socket.localAddress + ':' + socket.localPort + ' -> ' + socket.remoteAddress + ':' + socket.remotePort;
};

var Sender = function (connection, sender) {
    this.connection = connection;
    this.link = sender;
    this.name = this.link.get_name();
    this.role = 'sender';
};

Sender.prototype = Object.create(EventEmitter.prototype);
Sender.prototype.constructor = Sender;

Sender.prototype.credit = function () {
    return this.link.credit();
};
Sender.prototype.queued = function () {
    return this.link.queued();
};
Sender.prototype.close = function () {
    this.link.close();
    this.connection.process();
};
Sender.prototype.detach = function () {
    this.link.detach();
    this.connection.process();
};

Sender.prototype.send = function (message, tag) {
    //TODO: reuse message instance
    var dtag = tag ? tag : 'TODO';
    var outgoing = proton.message();
    to_proton_message(message, outgoing);
    this.link.send(outgoing, dtag);
    if (debug) console.log('sender ' + this.name + '['+ this.sender +'] sent message ' + message.body + ', credit is now ' + this.link.credit() + ' and have ' + this.link.queued() + ' messages queued');
    outgoing.free();
};

var Receiver = function (connection, receiver, options) {
    this.connection = connection;
    this.link = receiver;
    this.name = this.link.get_name();
    this.role = 'receiver';
    if (!options || options.prefetch === undefined) {
        this.prefetch = 500;
    } else {
        this.prefetch = options.prefetch;
    }
    if (this.prefetch) {
        this.link.flow(this.prefetch);
    }
};

Receiver.prototype = Object.create(EventEmitter.prototype);
Receiver.prototype.constructor = Receiver;

Receiver.prototype.source_address = function () {
    return this.link.remote_source().get_address();
};
Receiver.prototype.credit = function () {
    return this.link.credit();
};
Receiver.prototype.flow = function (credit) {
    return this.link.flow(credit);
};
Receiver.prototype.available = function () {
    return this.link.available();
};
Receiver.prototype.close = function () {
    this.link.close();
    this.connection.process();
};
Receiver.prototype.detach = function () {
    this.link.detach();
    this.connection.process();
};

var conn_counter = 1;

var Connection = function (container, options) {
    this.options = options ? options : {};
    this.conn = proton.connection();
    if (this.options.user) {
        this.conn.set_user(this.options.user);
    }
    if (this.options.password) {
        this.conn.set_password(this.options.password);
    }
    if (this.options.id) {
        this.conn.set_container(options.id);
    } else {
        this.conn.set_container(container.container_id);
    }
    this.collector = proton.collector();
    this.conn.collect(this.collector);
    this.container = container;
    this.conn.open();
    this.links = {};
    this.id = 'connection-' + conn_counter++;

    //setup internal event handlers:
    this.on('PN_CONNECTION_REMOTE_OPEN', this.connection_remote_open.bind(this));
    this.on('PN_CONNECTION_REMOTE_CLOSE', this.connection_remote_close.bind(this));
    this.on('PN_SESSION_REMOTE_OPEN', this.session_remote_open.bind(this));
    this.on('PN_LINK_REMOTE_OPEN', this.link_remote_open.bind(this));
    this.on('PN_LINK_FLOW', this.link_flow.bind(this));
    this.on('PN_DELIVERY', this.delivery.bind(this));
    this.on('PN_TRANSPORT_CLOSED', this.transport_closed.bind(this));
    //this.on('PN_TRANSPORT', this.output);
};

Connection.prototype = Object.create(EventEmitter.prototype);
Connection.prototype.constructor = Connection;

Connection.prototype.initialise = function (socket) {
    this.socket = socket;
    this.socket.on('data', this.input.bind(this));
    this.socket.on('error', this.eof.bind(this));
    this.socket.on('end', this.eof.bind(this));
    this.data = [];
};

Connection.prototype.session = function (socket) {
    if (!this.ssn) {
        //TODO: more flexible session policy
        this.ssn = this.conn.create_session();
        this.ssn.open();
    }
    return this.ssn;
};

Connection.prototype.connect = function () {
    try {
        var socket = net.connect(this.options, this.connected.bind(this));
        this.initialise(socket);
    } catch (e) {
        console.log(e);
        //TODO: exponential backoff up to some limit
        setTimeout(this.connect.bind(this), 500);
    }
    return this;
};

Connection.prototype.connection_remote_open = function (event) {
    if (this.conn.get_state() & proton.PN_LOCAL_ACTIVE) {
        dispatch([this, this.container], 'connection_opened', this);
    } else if (this.conn.get_state() & proton.PN_LOCAL_UNINIT) {
        dispatch([this, this.container], 'connection_opening', this);
        this.conn.open();
    } else {
        console.log('[' + this.id + '] Unexpected connection state: ' + this.conn.get_state());
    }
};

Connection.prototype.connection_remote_close = function (event) {
    if (this.conn.get_state() & proton.PN_LOCAL_CLOSED) {
        dispatch([this, this.container], 'connection_closed', this);
    } else if (this.conn.get_state() & proton.PN_LOCAL_ACTIVE) {
        dispatch([this, this.container], 'connection_closing', this);
        this.conn.close();
    }
    this.conn.free();
};

Connection.prototype.is_closed = function (event) {
    return this.conn.get_state() & (proton.PN_LOCAL_CLOSED | proton.PN_REMOTE_CLOSED);
}

Connection.prototype.transport_closed = function (event) {
    if (this.is_closed()) {
        if (this.socket) {
            this.socket.end();
        }
    }
};

Connection.prototype.session_remote_open = function (event) {
    var session = event.session();
    if (session.get_state() & proton.PN_LOCAL_UNINIT) {
        this.ssn = session;
        session.open();
    }
};

Connection.prototype.link_remote_open = function (event) {
    var link = event.link();
    var context = this.links[link.get_name()];
    if (context === undefined) {
        if (link.is_sender()) {
            context = new Sender(this, link);
        } else {
            context = new Receiver(this, link);
        }
        this.links[link.get_name()] = context;
        if (debug) console.log('[' + this.id + '] ' + context.role + ' link ' + link.get_name() + ' open initiated by peer');
    } else {
        if (debug) console.log('[' + this.id + '] ' + context.role + ' link ' + context.name + ' open confirmed by peer');
    }
    if (context.link.get_state() & proton.PN_LOCAL_ACTIVE) {
        dispatch([context, this, this.container], context.role + '_opened', context);
    } else if (context.link.get_state() & proton.PN_LOCAL_UNINIT) {
        dispatch([context, this, this.container], context.role + '_opening', context);
        context.link.open();
        if (context.role === 'receiver') {
            context.link.flow(1);//TODO: allow size of prefetch window to be controlled
        }
    } else {
        console.log('[' + this.id + '] Unexpected link state: ' + context.link.get_state());
    }
};

Connection.prototype.link_flow = function (event) {
    var link = event.link();
    var context = this.links[link.get_name()];
    if (link.is_sender() && link.credit() > 0) {
        dispatch([context, this, this.container], 'sendable', context);
    }
};

Connection.prototype.delivery = function (event) {
    var link = event.link();
    var context = this.links[link.get_name()];
    var dlv = event.delivery();
    if (context.link.is_sender()) {
        if (debug) console.log('[' + this.id + '] sender ' + context.name + ' handling outgoing delivery event');
        if (dlv.updated()) {
            var state = dlv.get_remote_state();
            if (state === proton.PN_ACCEPTED) {
                dispatch([context, this, this.container], 'accepted', dlv, context);
            } else if (state === proton.PN_RELEASED || state === proton.PN_MODIFIED) {
                dispatch([context, this, this.container], 'released', dlv, context);
            } else if (state === proton.PN_REJECTED) {
                dispatch([context, this, this.container], 'rejected', dlv, context);
            }
            if (dlv.settled()) {
                dispatch([context, this, this.container], 'settled', dlv, context);
            }
            dlv.settle();
        }
    } else {
        if (debug) console.log('[' + this.id + '] receiver ' + context.name + ' handling incoming delivery event');
        //TODO: reuse message instance
        var incoming = proton.message();
        if (context.link.recv(incoming)) {
            var message = from_proton_message(incoming);
            dispatch([context, this, this.container], 'message', message, context);
            if (debug) console.log('[' + this.id + '] receiver ' + context.name + ' received message');
            if (context.prefetch) {
                context.link.flow(context.prefetch - context.link.credit());
            }
            dlv.set_local_state(proton.PN_ACCEPTED);
            dlv.settle();
        } else {
            if (debug) console.log('[' + this.id + '] receiver ' + context.name + ' incoming delivery event did not result in message');
        }
        incoming.free();
    }
};

Connection.prototype.connected = function () {
    if (debug) console.log('[' + this.id + '] connected to server: ' + get_socket_id(this.socket));

    var old = this.transport;
    if (old) {
        old.unbind();
        old.free();
    }
    this.transport = proton.transport();
    this.transport.bind(this.conn);

    this.process();
};

Connection.prototype.input = function (buff) {
    if (debug) console.log('[' + this.id + '] entering input(): received ' + buff.length + ' bytes of data (' + this.data.length + ' unprocessed bytes already received)');
    var total_pushed = 0, pushed;
    var i;
    for (i = 0; i < buff.length; i++) {
        this.data.push(buff.readInt8(i));
    }
    do {
        pushed = this.transport.push(this.data);
        total_pushed += pushed;
        this.process();
        if (pushed < this.data.length) {
            this.data = this.data.slice(pushed);
        } else {
            this.data = []
        }
        if (debug) console.log('[' + this.id + '] returning from input(): pushed ' + total_pushed + ' (' + this.data.length + ' remaining)');
    } while (pushed > 0);
};

Connection.prototype.eof = function (data) {
    if (debug) console.log('[' + this.id + '] disconnected');
    if (this.transport) {
        this.transport.close_head();
        this.transport.close_tail();
    }
    if (!this.is_closed() && this.options.reconnect) {
        console.log('Disconnected, reconnecting....');
        //TODO: exponential backoff up to some limit
        setTimeout(this.connect.bind(this), 500);
        dispatch([this, this.container], 'disconnected', this);
    }
};

Connection.prototype.in_process = false;
Connection.prototype.process = function () {
    if (debug) console.log('[' + this.id + '] process() called');
    if (!this.in_process) {
        this.in_process = true;
        var do_output;
        do {
            //var next = new Date(this.transport.tick(new Date().getTime()));
            if (do_output === undefined) {
                do_output = true;
            } else {
                do_output = false;
            }
            var event = this.collector.peek();
            while (event) {
                if (debug) console.log('[' + this.id + '] Got event: ' + event.type());
                this.emit(event.type(), event);
                this.collector.pop();
                do_output = true;
                event = this.collector.peek();
            }
        } while (do_output && this.output());
        this.in_process = false;
    } else {
        if (debug) console.log('[' + this.id + '] already processing');
    }
    if (debug) console.log('[' + this.id + '] returning from process()');
};

Connection.prototype.output = function () {
    if (this.transport === undefined) return;
    if (debug) console.log('[' + this.id + '] entered output()');
    var data = this.transport.peek(1024*10);
    if (data) {
        var buff = new Buffer(data);
        this.socket.write(buff);
        this.transport.pop(data.length);
        if (debug) console.log('[' + this.id + '] returning from output(), wrote ' + buff.length + ' bytes of data');
        return true;
    } else {
        if (data === null) {
            if (debug) console.log('[' + this.id + '] returning from output(), EOS');
        } else {
            if (debug) console.log('[' + this.id + '] returning from output(), nothing to write');
        }
        return false;
    }
};

function get_address(o) {
    if (typeof o === 'string') {
        return o;
    } else if (o && o.address) {
        return o.address;
    } else {
        return undefined;
    }
};

Connection.prototype.generate_link_name = function (a_source, a_target) {
    var my_source = get_address(a_source), my_target = get_address(a_target);
    var name = this.container.container_id;
    if (my_source) {
        name += '_' + my_source;
    }
    if (my_target) {
        name += '_' + my_target;
    }
    if (!my_source && !my_target) {
        name += '_link';
    }
    return name;
};

Connection.prototype.unique_link_name = function (base) {
    var name = base;
    var counter = 1;
    while (this.links[name]) {
        name = base + '_' + counter++;
    }
    return name;
};

Connection.prototype.create_receiver = function (options) {
    var opts = options ? options : {};
    var name = this.unique_link_name(opts.name ? opts.name : this.generate_link_name(opts.source, opts.target));
    var receiver = new Receiver(this, this.session().create_receiver(name, opts), opts);
    this.links[receiver.name] = receiver;
    this.process();
    return receiver;
};

Connection.prototype.create_sender = function (options) {
    var opts = options ? options : {};
    var name = this.unique_link_name(opts.name ? opts.name : this.generate_link_name(opts.source, opts.target));
    var sender = new Sender(this, this.session().create_sender(name, opts));
    this.links[sender.name] = sender;
    this.process();
    return sender;
};

Connection.prototype.close = function () {
    this.conn.close();
    this.process();
};

var Container = function (options) {
    this.options = options ? options : {};
    this.container_id = this.options.id ? this.options.id : generate_uuid();
};

Container.prototype = Object.create(EventEmitter.prototype);
Container.prototype.constructor = Container;

Container.prototype.connect = function (options) {
    return new Connection(this, options).connect();
};

Container.prototype.listen = function (options) {
    var server = net.createServer();
    var container = this;
    server.on('connection', function (socket) {
        var c = new Connection(container);
        console.log('[' + c.id + '] client accepted: '+ get_socket_id(socket));
        c.initialise(socket);
        c.connected();
    });
    server.listen(options.port);
    return server;
};
Container.prototype.generate_uuid = generate_uuid;

module.exports = Container
