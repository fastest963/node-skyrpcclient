var util = require('util'),
    SRVClient = require('srvclient'),
    RPCLib = require('rpclib'),
    Log = require('modulelog')('skyrpcclient'),
    RPCClient = RPCLib.RPCClient,
    noop = function() {};

function SkyRPCClient(hostname) {
    this.hostname = hostname;
    this.targets = null;
    this.rpcClient = new RPCClient();
    this.fallbackOnDNSError = true;
}
SkyRPCClient.setDNSServers = function(servers) {
    SRVClient.setServers(servers);
};

SkyRPCClient.localHandlers = {};
SkyRPCClient.setHostnameHandler = function(hostname, callback) {
    if (typeof hostname !== 'string') {
        throw new TypeError('hostname sent to setOverrideCallback must be a string');
    }
    if (!callback) {
        delete SkyRPCClient.localHandlers[hostname];
        return;
    }
    if (typeof callback !== 'function') {
        throw new TypeError('callback sent to setOverrideCallback must be a function');
    }
    SkyRPCClient.localHandlers[hostname] = callback;
};

SkyRPCClient.prototype.resolve = function(cache, cb) {
    var callback = cb;
    if (typeof cache === 'function') {
        callback = cache;
        cache = 1000;
    }
    Log.debug('skyRPCClient resolving', {hostname: this.hostname});
    SRVClient.getRandomTargets(this.hostname, +cache, function(err, targets) {
        if (err || !targets) {
            if (this.fallbackOnDNSError && this.targets) {
                Log.info('falling back to cached dns targets', {
                    error: err,
                    hostname: this.hostname
                });
                callback(null, this.targets);
                return;
            }
            Log.error('skyRPCClient error with lookup', {error: err, hostname: this.hostname});
            this.targets = null;
            callback(err || (new Error('error looking up ' + this.hostname)));
            return;
        }
        this.targets = targets;
        callback(null, this.targets);
    }.bind(this));
};

function callWithTarget(client, name, params, cb, clientRes, idx) {
    var index = idx || 0,
        target = client.targets[index];
    if (!target) {
        return false;
    }
    //the result already ended so no point in continuing and respond that we didn't fail (read: succeeded)
    if (clientRes.ended) {
        return true;
    }
    target.resolve(function(err, address) {
        if (clientRes.ended) {
            return;
        }
        if (err) {
            Log.warn('error resolving target in skyRPCClient', {error: err, method: name});
            if (!callWithTarget(client, name, params, cb, clientRes, index + 1)) {
                //send along the last err we got since we don't have any targets left
                Log.error('skyRPCClient failed to find any more targets', {method: name});
                cb(err, null);
            }
            return;
        }
        var url = 'http://' + address + ':' + target.port + '/';
        Log.debug('skyRPCClient resolved address', {url: url, hostname: this.hostname});
        client.rpcClient.setEndpoint(url);
        clientRes._setRPCResult(client.rpcClient.call(name, params, function(err, result) {
            if (err && (err.type === 'http' || err.type === 'json' || err.type === 'timeout')) {
                Log.warn('skyRPCClient error connecting to service', {error: err, url: url, method: name});
                if (!callWithTarget(client, name, params, cb, clientRes, index + 1)) {
                    //send along the last err we got since we don't have any targets left
                    Log.error('skyRPCClient failed to find any more targets', {method: name, url: url});
                    cb(err, null);
                }
                return;
            }
            cb(err, result);
        }));
    });
    return true;
}
SkyRPCClient.prototype.call = function(name, params, cb) {
    var callback = cb,
        parameters = params,
        clientRes = null,
        promiseResolve = function(res) {
            resolvedRes = res;
        },
        promiseReject = function(err) {
            rejectedErr = err;
        },
        promise = new Promise(function(resolve, reject) {
            promiseResolve = resolve;
            promiseReject = reject;
            // if we already resolved before this ever ran... call
            // resolve/reject now
            if (resolvedRes !== undefined) {
                resolve(resolvedRes);
            } else if (rejectedErr !== undefined) {
                reject(rejectedErr);
            }
        }.bind(this)),
        // create a wrapper calback to send to callWithTarget so we know when it ends so we can end clientRes
        ourResolve = function(err, res) {
            if (clientRes) {
                //fallback in case res was ended already
                if (clientRes.ended) {
                    return;
                }
                //clear any timer that was set
                if (clientRes.timeout > 0) {
                    clientRes.setTimeout(0);
                }
                clientRes.ended = true;
            }
            if (err) {
                promiseReject(err);
            } else {
                promiseResolve(res);
            }
            if (callback) {
                var cb = callback;
                callback = null;
                cb(err, res);
            }
        },
        resolvedRes, rejectedErr;
    if (typeof params === 'function') {
        callback = params;
        parameters = null;
    }
    if (callback && typeof callback !== 'function') {
        throw new TypeError('callback sent to SkyRPCClient.call must be a function');
    }
    Log.debug('skyRPCClient calling method', {hostname: this.hostname, func: name});
    clientRes = new RPCResult(callback, promise);
    if (SkyRPCClient.localHandlers.hasOwnProperty(this.hostname)) {
        SkyRPCClient.localHandlers[this.hostname](name, parameters, ourResolve);
        return clientRes;
    }
    this.resolve(function() {
        if (clientRes.ended) {
            return;
        }
        //if callWithTarget returns false it didn't call the callback... weird i know
        if (!callWithTarget(this, name, parameters, ourResolve, clientRes, 0)) {
            Log.warn('failed to lookup in skyRPCClient', {hostname: this.hostname, method: name});
            ourResolve({
                type: 'dns',
                code: RPCLib.ERROR_SERVER_ERROR,
                message: 'Cannot lookup hostname'
            }, null);
        }
    }.bind(this));
    return clientRes;
};

function RPCResult(resolve, promise) {
    this._resolve = resolve || noop;
    this._rpcResult = null; //rpcResult from node-rpclib
    this.timer = null;
    this.timeout = 0;
    this.ended = false;
    this._promise = promise;
}
RPCResult.prototype._setRPCResult = function(res) {
    if (this.ended) {
        return this;
    }
    //stop our timer since we're going to use rpcResult's
    if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    if (res.ended) {
        this.ended = true;
        return this;
    }
    this._rpcResult = res;
    this._rpcResult.setTimeout(this.timeout);
    return this;
};
RPCResult.prototype.setTimeout = function(timeout) {
    if (this.ended) {
        return this;
    }
    if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    this.timeout = +timeout;
    if (timeout > 0) {
        if (this._rpcResult) {
            this._rpcResult.setTimeout(timeout);
            return this;
        }
        this.timer = setTimeout(function() {
            if (this.ended) {
                this.timer = null;
                return;
            }
            this.ended = true;
            if (this._rpcResult !== null) {
                //if the rpcResult already ended then it must've called cb already
                if (this._rpcResult.ended) {
                    return;
                }
                var res = this._rpcResult;
                this._rpcResult = null;
                if (res.ended) {
                    return;
                }
                res.abort();
            }
            //this matches node-rpclib
            this._resolve({
                type: 'timeout',
                code: 0,
                message: 'Timed out waiting for response'
            }, null);
        }.bind(this), this.timeout);
    }
    return this;
};
RPCResult.prototype.then = function(res, cat) {
    return this._promise.then(res, cat);
};
RPCResult.prototype.catch = function(cat) {
    return this._promise.catch(cat);
};

SkyRPCClient.RPCResult = RPCResult;
module.exports = SkyRPCClient;
