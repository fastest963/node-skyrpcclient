var dns = require('dns'),
    SkyRPCClient = require('../client.js'),
    testHostname = '_srv-client-test._tcp.mysuperfancyapi.com',
    rpcHostname = '_rpc._tcp.mysuperfancyapi.com',
    timeoutHostname = '_srv-client-test2._tcp.mysuperfancyapi.com',
    retryHostname = '_rpc-retry._tcp.mysuperfancyapi.com',
    Log = require('modulelog')('skyrpcclient'),
    dnsServers = ['8.8.8.8', '8.8.4.4'];

Log.setClass('console');

exports.setDNSServers = function(test) {
    var servers;
    SkyRPCClient.setDNSServers(dnsServers);
    // todo: uncomment these once srvclient has getServers()
    /*servers = dns.getServers();
    test.equal(servers[0], dnsServers[0]);
    test.equal(servers[1], dnsServers[1]);*/
    test.done();
};


exports.resolve = function(test) {
    test.expect(4);
    var client = new SkyRPCClient(testHostname);
    client.resolve(function(err, targets) {
        test.equal(targets.length, 3);
        var ports = [8079, 8080, 8081];
        targets.forEach(function(p) {
            var i = ports.indexOf(p.port);
            test.notEqual(i, -1);
            ports.splice(i, 1);
        });
        test.done();
    });
};

exports.resolvePromise = function(test) {
    test.expect(4);
    var client = new SkyRPCClient(testHostname);
    client.resolve().then(function(targets) {
        test.equal(targets.length, 3);
        var ports = [8079, 8080, 8081];
        targets.forEach(function(p) {
            var i = ports.indexOf(p.port);
            test.notEqual(i, -1);
            ports.splice(i, 1);
        });
        test.done();
    });
};

exports.resolveCache = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(testHostname);
    client.resolve(function(err, targets) {
        var ogTargets = targets;
        SkyRPCClient.setDNSServers(['255.255.255.255']);
        function onlyName(t) {
            return t.name;
        }
        client.resolve(function(err, targets) {
            test.equal(targets.map(onlyName).join(','), ogTargets.map(onlyName).join(','));
            test.done();
        });
        SkyRPCClient.setDNSServers(dnsServers);
    });
};

exports.call = function(test) {
    test.expect(3);
    var client = new SkyRPCClient(rpcHostname);
    var result = client.call('Fancy.Echo', {text: 'hey'}, function(err, res) {
        if (res) {
            test.equal(res.text, 'hey');
            test.equal(result.clientURL, 'http://192.95.20.208:8190/');
        }
        test.done();
    }).setTimeout(5000);
    test.equal(result.clientURL, '');
};

exports.callPromise = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(rpcHostname);
    client.call('Fancy.Echo', {text: 'hey'}).then(function(res) {
        if (res) {
            test.equal(res.text, 'hey');
        }
        test.done();
    }).setTimeout(5000);
};

exports.timeout = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(timeoutHostname);
    client.call('Fancy.Echo', {text: 'hey'}, function(err) {
        test.equal(err.type, 'timeout');
        test.done();
    }).setTimeout(100);
};

exports.timeoutPromise = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(timeoutHostname);
    client.call('Fancy.Echo', {text: 'hey'}).catch(function(err) {
        test.equal(err.type, 'timeout');
        test.done();
    }).setTimeout(100);
};

exports.retry = function(test) {
    test.expect(2);
    var client = new SkyRPCClient(retryHostname),
        promises = [];
    promises.push(client.call('Fancy.Echo', {text: 'hey'}).catch(function(err) {
        test.equal(err.type, 'timeout');
    }).setTimeout(100));

    client = new SkyRPCClient(retryHostname);
    client.retryOnError = true;
    promises.push(client.call('Fancy.Echo', {text: 'hey'}).then(function(res) {
        test.equal(res.text, 'hey');
    }).setTimeout(1000));
    Promise.all(promises).then(function() {
        test.done();
    }, function() {
        test.done();
    });
};

exports.setHostnameHandler = function(test) {
    test.expect(3);
    SkyRPCClient.setHostnameHandler(rpcHostname, function(name, params, cb) {
        test.equal(name, 'Fancy.Echo');
        test.equal(params.text, 'hey');
        cb(null, params);
    });
    var client = new SkyRPCClient(rpcHostname);
    client.call('Fancy.Echo', {text: 'hey'}, function(err, res) {
        if (res) {
            test.equal(res.text, 'hey');
        }
        //now clear the handler for this hostname
        SkyRPCClient.setHostnameHandler(rpcHostname);
        test.done();
    }).setTimeout(100);
};

exports.resolveFallback = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(testHostname);
    client.resolve(0, function(err, targets) {
        var ogTargets = targets;
        SkyRPCClient.setDNSServers(['10.254.254.10']);
        client.resolve(0, function(err, targets) {
            test.strictEqual(targets, ogTargets);
            test.done();
        });
        SkyRPCClient.setDNSServers(dnsServers);
    });
};

exports.resolveNoFallback = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(testHostname);
    client.fallbackOnDNSError = false;
    client.resolve(0, function(err, targets) {
        var ogTargets = targets;
        SkyRPCClient.setDNSServers(['10.254.254.10']);
        client.resolve(0, function(err, targets) {
            test.equal(null, targets);
            test.done();
        });
        SkyRPCClient.setDNSServers(dnsServers);
    });
};

exports.preprocess = function(test) {
    test.expect(6);
    var client = new SkyRPCClient(testHostname);
    client.preprocess = function(targets) {
        test.equal(targets.length, 3);
        var ports = [8079, 8080, 8081],
            newTargets = [];
        targets.forEach(function(p) {
            var i = ports.indexOf(p.port);
            test.notEqual(i, -1);
            ports.splice(i, 1);
            if (p.port === 8079) {
                newTargets.push(p);
            }
        });
        return newTargets;
    };
    client.resolve(function(err, targets) {
        test.equal(targets.length, 1);
        test.equal(targets[0].port, 8079);
        test.done();
    });
};
