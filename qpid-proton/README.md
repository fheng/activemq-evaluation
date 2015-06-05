qpid-proton is a library for the [AMQP](http://amqp.org/) protocol for
both clients and servers

* [Hello World!](#hello-world)
* [API](#api)

## Hello World!

Brief example of sending and receiving a message through a
broker/server listening on port 5672:

```js
var Container = require("qpid-proton");

var container = new Container();
var connection = container.connect({port:5672});
connection.on('message', function (message) {
    console.log(message.body);
    connection.close();
});
connection.once('sendable', function (sender) {
    sender.send({body:'Hello World!'});
});
connection.create_receiver({source:'examples'});
connection.create_sender({target:'examples'});
```

output:
```
Hello World!
```

## API

There are four core types of object in the API:

  * <a href="#container">Containers</a>,
  * <a href="#connection">Connections</a>,
  * <a href="#receiver">Receivers</a>,
  * and <a href="#sender">Senders</a>

Each of these inherits all the methods of EventEmitter, allowing
handlers for particular events to be attached. Events that are not
handled at sender or receiver scope are then propagated up to possibly
be handled at connection scope. Events that are not handled at
connection scope are then propagated up to possibly be handled at
container scope.

---------------------------------------------------------------------
### Container

An AMQP container from which outgoing connections can be made and/or
to which incoming connections can be accepted. Created using the
constructor that is exported by qpid-proton. The constructor takes an
options argument which is an object with an option <code>id</code>
field specifying the container identifier. If not specified a unique
identifier is generated.

#### methods:

##### connect(options)

Connects to the server specified by the host and port supplied in the
options and returns a <a href="#connection">Connection</a>.

The options argument is an object that may contain any of the
following fields:

  * host
  * port
  * user
  * password
  * id (overrides the container identifier)
  * reconnect - if true, library will automatically reconnect if
    disconnected

##### listen(options)

Starts a server socket listening for incoming connections on the port
(and optionally interface) specified in the options.

The options argument is an object that may contain any of the
following fields:

  * host
  * port

##### generate_uuid()

Simple utility for generating a stringified uuid, useful if you wish
to specify distinct container ids for different connections.

---------------------------------------------------------------------
### Connection

#### methods:

##### create_receiver(options)

Establishes a link over which messages can be received and returns a
<a href="#receiver">Receiver</a> representing that link. A receiving
link is a subscription, i.e. it expresses a desire to receive
messages.

The options argument is an object that may contain any of the
following fields:

  * source - The source from which messages are received. This can be
    a simple string address/name or a nested object itself containing
    the fields:
    * address
    * dynamic
    * expiry_policy
    * durable
  * target - The target of a receiving link is the local
    identifier. It is often not needed, but can be set if it is,
  * name - The name of the link. This should be unique for the
    container. If not specified a unqiue name is generated.
  * prefetch - A 'prefetch' window controlling the flow of messages
    over this receiver. Defaults to 500 if not specified. A value of 0
    can be used to turn of automatic flow control and manage it
    directly.

##### create_sender(options)

Establishes a link over which messages can be sent and returns a <a
href="#sender">Sender</a> representing that link. A sending link is an
analogous concept to a subscription for outgoing rather than incoming
messages. I.e. it expresses a desire to send messages.

The options argument is an object that may contain any of the
following fields:

  * target - The target to which messages are sent. This can be a
    simple string address/name or a nested object itself containing
    the fields:
    * address
    * dynamic
    * expiry_policy
    * durable
  * source - The source of a sending link is the local identifier. It
    is usually not needed, but can be set if it is,
  * name - The name of the link. This should be unique for the
    container. If not specified a unqiue name is generated.

##### close()

Closes a connection.

#### events:

##### connection_opened

Raised when a connection that was locally initiated is confirmed open
by the remote peer.

##### connection_opening

Raised when the remote peer initiates the opening of a connection.

##### connection_closed

Raised when a connection that was closed locally initiated is
confirmed as closed by the remote peer.

##### connection_closing

Raised when the remote peer initiates the closing of a connection.

##### disconnected

Raised when the underlying tcp connection is lost.

---------------------------------------------------------------------
### Receiver

#### methods:

##### source_address()

Returns the address of the source from which this receiver is
receiving messages. This can be useful when the source name is
generated by the peer, i.e. for so-called dyanmic nodes (like
temporary queues) used in some request-response patterns.

##### close()

Closes a receiving link (i.e. cancels the subscription).

##### detach()

Detaches a link without closing it. For durable subscriptions this
means the subscription is inactive, but not cancelled.

##### flow(n)

By default, receivers have a prefetch window that is moved
automatically by the library. However if desired the application can
set the prefecth to zero and manage credit itself. The flow() method
issues credit for 'n' messages to be sent by the peer over this
receiving link.

##### credit()

Returns the amount of outstanding credit that has been issued.

#### events:

##### message

Raised when a message is received.

##### receiver_opened

Raised when a locally initiated receiver is confirmed attached by the
remote peer.

##### receiver_opening

Raised when the remote peer initiates the attaching of a link for
messages coming into the local process.

---------------------------------------------------------------------
### Sender

#### methods:

##### send(msg)

Sends a message. A message is an object that may contain the following fields:

  * durable
  * first_acquirer
  * priority
  * ttl
  * delivery_count
  * reply_to
  * to
  * subject
  * content_type
  * content_encoding
  * group_id
  * body
  * id
  * correlation_id

##### close()

Closes a sending link.

##### detach()

Detaches a link without closing it.

##### credit()

Returns the amount of outstanding credit that has been issued by the
peer. This is the number of messages that can be transferred over the
link. If messages are sent for which there is no credit, they are not
transmitted, but are buffered locally until sufficent credit has been
allocated by the peer.

##### queued()

Returns the number of messages that have been sent but not yet
transmitted.

#### events:

##### sendable

Raised when the sender has sufficient credit to be able to transmit
messages to its peer.

##### accepted

Raised when a sent message is accepted by the peer.

##### released

Raised when a sent message is released by the peer.

##### rejected

Raised when a sent message is rejected by the peer.

##### sender_opened

Raised when a locally initiated sender is confirmed attached by the
remote peer.

##### sender_opening

Raised when the remote peer initiates the attaching of a link for
messages going out of the local process.
