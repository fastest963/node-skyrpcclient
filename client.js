var util = require('util'),
    SRVClient = require('srvclient'),
    RPCLib = require('rpclib'),
    RPCClientResult = RPCLib.RPCClientResult,
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
    var callback = cb,
        cacheMS = cache || 0;
    if (typeof cache === 'function') {
        callback = cache;
        cacheMS = 1000;
    }
    Log.debug('skyRPCClient resolving', {hostname: this.hostname});
    return new Promise(function(resolve, reject) {
        SRVClient.getRandomTargets(this.hostname, +cacheMS, function(err, targets) {
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
                reject(err || (new Error('error looking up ' + this.hostname)));
                return;
            }
            this.targets = targets;
            resolve(this.targets);
        }.bind(this));
    }.bind(this)).then(function(res) {
        if (callback) {
            callback(null, res);
        }
        return res;
    }, function(err) {
        if (callback) {
            callback(err, null);
        }
        throw err;
    });
};

SkyRPCClient.prototype.call = function(name, params, cb) {
    var callback = cb,
        parameters = params,
        ended = false,
        client = this,
        existingError = null,
        promiseReject = noop,
        rpcClientRes = null;
    if (typeof params === 'function') {
        callback = params;
        parameters = null;
    }
    if (callback && typeof callback !== 'function') {
        throw new TypeError('callback sent to SkyRPCClient.call must be a function');
    }

    Log.debug('skyRPCClient calling method', {hostname: this.hostname, func: name});

    function onEnd() {
        ended = true;
        if (rpcClientRes) {
            // this will clear the timeout
            rpcClientRes.setTimeout(0);
            rpcClientRes = null;
        }
    }

    function errFn(err) {
        if (rpcClientRes) {
            rpcClientRes.abort();
        }
        if (err) {
            existingError = err;
            promiseReject(err);
        } else {
            onEnd();
        }
    }

    function promiseHandler(resolve, reject) {
        if (ended) {
            return;
        }
        if (existingError) {
            reject(existingError);
            return;
        }
        promiseReject = reject;

        if (SkyRPCClient.localHandlers.hasOwnProperty(client.hostname)) {
            SkyRPCClient.localHandlers[client.hostname](name, parameters, function(err, res) {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
            return;
        }
        // first resolve our hostname
        client.resolve(function(err) {
            if (ended) {
                return;
            }
            if (err) {
                Log.warn('failed to lookup in skyRPCClient', {hostname: client.hostname, method: name});
                reject({
                    type: 'dns',
                    code: RPCLib.ERROR_SERVER_ERROR,
                    message: 'Cannot lookup hostname'
                });
                return;
            }

            // now loop through and resolve all of the targets
            var targets = client.targets || [];
            (new Promise(function(targetResolve, targetReject) {
                function resolveNext(index, lastError) {
                    var target = targets[index];
                    if (!target) {
                        Log.error('skyRPCClient failed to find any more targets', {method: name, url: url});
                        targetReject(lastError);
                        return;
                    }
                    // the result already ended
                    if (ended) {
                        targetResolve();
                        return;
                    }
                    target.resolve(function(targetErr, address) {
                        if (ended) {
                            targetResolve();
                            return;
                        }
                        if (targetErr) {
                            Log.warn('error resolving target in skyRPCClient', {error: targetErr, method: name});
                            resolveNext(index + 1, targetErr);
                            return;
                        }
                        var url = 'http://' + address + ':' + target.port + '/';
                        Log.debug('skyRPCClient resolved address', {url: url, hostname: client.hostname});
                        client.rpcClient.setEndpoint(url);
                        rpcClientRes = client.rpcClient.call(name, parameters).then(targetResolve).catch(function(clientErr) {
                            if (clientErr.type === 'http' || clientErr.type === 'json' || clientErr.type === 'timeout') {
                                Log.warn('skyRPCClient error connecting to service', {error: clientErr, url: url, method: name});
                                resolveNext(index + 1, clientErr);
                                return;
                            }
                            targetReject(clientErr);
                        });
                    });
                }
                resolveNext(0, null);
            })).then(resolve, reject);
        });
    }

    var promise = new Promise(promiseHandler).then(function(res) {
        onEnd();
        if (callback) {
            callback(null, res);
        }
        return res;
    }, function(err) {
        onEnd();
        if (callback) {
            callback(err, null);
        }
        throw err;
    });
    rpcClientRes = new RPCClientResult(errFn, promise);
    return rpcClientRes;

};

module.exports = SkyRPCClient;
