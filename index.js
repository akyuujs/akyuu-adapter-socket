/**
 * Created by maple on 2017/8/10.
 */
"use strict";

const SocketIo = require('./lib/socket_io');

exports.create = function(config) {
    return new SocketIo(config);
};