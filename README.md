# skyrpcclient #

A Node.js client for making SkyDNS-backed JSON-RPC remote calls. It's a
combination of [node-srvclient](https://github.com/fastest963/node-srvclient)
and [node-rpclib](https://github.com/fastest963/node-rpclib).

### Usage ###

```JS
var SkyRPCClient = require('skyrpcclient');

var authClient = new SkyRPCClient('auth-api.services.example');

var params = {username: 'test', password: 'password'};
authClient.call('Users.Login', params, function(err, res) {
  // ... handle result or error here
});
```

## SkyRPCClient Methods ##

### client = new SkyRPCClient(hostname) ###

`hostname` is the name of the remote RPC endpoint. The `hostname` will be
resolved using a `SRV` lookup and a target will be randomly chosen each time
`call` is invoked.

### client.resolve(callback) ###

resolves the client's hostname and calls `callback` with a list of targets.
This is just an alias for `getRandomTargets` from `node-srvclient`.

### call = client.call(name, params, callback) ###

calls a remote method `name` and passes `params`. `callback` is called with
an error and result. returns an instance of `RPCClientResult` which can be
treated like a promise.

**Note By default, `call` will use the last DNS answer if a subsequent lookup
fails. To disable this functionality, set client.fallbackOnDNSError to false.**

### client.preprocess ###

A function that can be used to filter/alter the results that get resolved as part
of `call`. This function gets an array of [SRVTarget's](https://github.com/fastest963/node-srvclient)
and expects a return of an array of `SRVTarget`'s.

### client.fallbackOnDNSError ###

By default if a DNS lookup fails, it falls back to the last received dns
lookup. Set `fallbackOnDNSError` to false if you do not want this
behavior.

### client.retryOnError ###

By default if a call fails because of an HTTP or JSON error, it will not be
retried. Set `retryOnError` to true to try the next available server on HTTP
and JSON errors. Valid RPC responses, even if they're an error, will NOT be
retried in either case.

### SkyRPCClient.setHostnameHandler(hostname, callback) ###

overrides any clients created for `hostname` to call `callback` instead of
making a network call. This is really only useful for testing. `callback` is
called with `name, params, callback` and directly maps to the args sent to
`call`.

### SkyRPCClient.setDNSServers(servers) ###

Set the DNS servers to use for resolution. Identical to [dns.setServers](https://nodejs.org/api/dns.html#dns_dns_setservers_servers)

## RPCClientResult Methods ##

See [RPCClientResult Methods](https://github.com/fastest963/node-rpclib#rpcclientresult-methods)
