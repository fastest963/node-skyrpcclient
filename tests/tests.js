var dns = require('dns'),
    SkyRPCClient = require('../client.js'),
    testHostname = '_srv-client-test._tcp.mysuperfancyapi.com',
    rpcHostname = '_rpc._tcp.mysuperfancyapi.com',
    timeoutHostname = '_srv-client-test2._tcp.mysuperfancyapi.com',
    dnsServers = ['8.8.8.8', '8.8.4.4'];

exports.setDNSServers = function(test) {
    var servers;
    SkyRPCClient.setDNSServers(dnsServers);
    servers = dns.getServers();
    test.equal(servers[0], dnsServers[0]);
    test.equal(servers[1], dnsServers[1]);
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

exports.call = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(rpcHostname);
    client.call('Fancy.Echo', {text: 'hey'}, function(err, res) {
        if (res) {
            test.equal(res.text, 'hey');
        }
        test.done();
    }).setTimeout(5000);
};

exports.callPromise = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(rpcHostname);
    client.call('Fancy.Echo', {text: 'hey'}).setTimeout(5000).then(function(res) {
        if (res) {
            test.equal(res.text, 'hey');
        }
        test.done();
    });
};

exports.timeout = function(test) {
    test.expect(1);
    var client = new SkyRPCClient(timeoutHostname);
    client.call('Fancy.Echo', {text: 'hey'}, function(err) {
        test.equal(err.type, 'timeout');
        test.done();
    }).setTimeout(100);
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
