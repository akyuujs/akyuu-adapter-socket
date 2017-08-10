/**
 * Created by maple on 2017/8/9.
 */
'use strict';

const events = require('events');
const net = require('net');

class SocketIo extends events.EventEmitter {
    constructor(socket, options) {
        super();

        if(!options) {
            options = socket || {};
            socket = new net.Socket(options);
        }

        this.socket = socket;
        this.connected = true;

        this.retry = {
            retries: 0,
            max: options.maxRetries || 10,
            interval: options.retryInterval || 5000,
            wait: options.retryInterval || 5000
        };

        if(parseInt(options.port)) {
            this.port = parseInt(options.port);
        }
        if(options.host) {
            this.host = options.host;
        }

        this.$reconnect = options.reconnect || false;
        this.$options = options;

        this._setup();
    }

    _setup() {
        const self = this;

        this.socket.on('connect', function() {
            self.emit('connect');
        });

        this.socket.on('close', function(hadError) {
            self.connected = false;

            if(hadError) {
                self.emit('close', hadError, arguments[1]);
            } else {
                self.emit('close');
            }

            if(self.socket && self.$reconnect) self.reconnect();
        });

        this.socket.on('data', function(data) {
            self.emit('data', data);
        });

        this.socket.on('error', function(error) {
            self.connected = false;

            self.retry.waiting = false;
            if(self.$reconnect) {
                self.reconnect();
            } else {
                self.emit('error', error || new Error('Unknown error occurred in ISocket'));
            }
        });

        this.socket.on('timeout', function() {
            self.emit('idle');
            if(self.$timeout) self.socket.setTimeout(self.$timeout);
        });
    }

    reconnect() {
        const self = this;

        if(self.retry.waiting) {
            return; // eslint-disable-line
        }

        function doReconnect() {
            if(self.socket) {
                self.socket.end();
                self.socket.destroy();
                self.socket.removeAllListeners();
                self.socket = null;
            }

            self.socket = new net.Socket(self.options);

            self.socket.once('conncet', function() {
                self.retry.waiting = false;
                self.retry.retries = 0;
            });

            self._setup();
            self.connect();
        }

        function tryConnect() {
            if(self.retry.retries >= self.retry.max) {
                return self.emit('error',
                    new Error(`Did not reconnect after maximum retries: ${self.retry.max}.`));
            }
            doReconnect();
        }

        this.retry.waiting = true;
        this.retry.wait = this.retry.interval * Math.pow(2, this.retry.retries);
        this.retry.retries++;

        self.emit('tryReconnect', this.retry.wait);

        setTimeout(tryConnect, this.retry.wait);
    }

    connect() {
        let args = Array.prototype.slice.call(arguments);
        const self = this;
        let callback;
        let host;
        let port;

        /* eslint-disable */
        args.forEach(function(arg) {
            switch(typeof arg) {
                case 'number':
                    port = arg;
                    break;
                case 'string':
                    host = arg;
                    break;
                case 'function':
                    callback = arg;
                    break;
                default:
                    self.emit('error', new Error('Bad argument to connect'));
                    break;
            }
        });
        /* eslint-enable */

        this.port = port || this.port;
        this.host = host || this.host || '127.0.0.1';
        args = this.port ? [ this.port, this.host ] : [ this.host ];

        function finish() {
            self.retry.waiting = false;
            self.retry.retries = 0;
            if(callback) callback.apply(null, arguments);
        }
        args.push(finish);
        const errHandlers = this.listeners('error');
        if(errHandlers.length > 0) {
            this.socket.on('error', errHandlers[errHandlers.length - 1]);
        }
        this.connected = true;
        this.socket.connect.apply(this.socket, args);
    }

    setKeepAlive(/** ... **/) {
        this.socket.setKeepAlive.apply(this.socket, arguments);
    }

    destroy() {
        this.removeAllListeners();
        if(this.socket) {
            try {
                this.socket.end();
                this.socket.destroy();
            } catch(e) {
                // do nothing...
            }
        }

        this.emit('destroy');
    }

    send(data, callback) {
        let buff;

        if(typeof data === 'string') {
            buff = new Buffer(data);
        } else if(Buffer.isBuffer(buff)) {
            buff = data;
        } else {
            return callback(new Error('illegal parameter type'));
        }
        this.socket.write(buff, callback);
    }

    setIdle(time) {
        this.socket.setTimeout(time);
        this.$timeout = time;
    }
}

module.exports = SocketIo;
