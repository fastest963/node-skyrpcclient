## Changelog ##

### 1.0.1 ###
* Added options to call so you can send an object with extra headers

### 1.0.0 ###
* Clone targets before passing to preprocess function

### 0.3.0 ###
* Added fallback on DNS failure
* Update to latest srvclient
* Switch to RPCLib's result
* Added preprocess function
* Added `retryOnError` which can be turned on to enable falling back
to another server when receiving a HTTP/JSON error
* HTTP/JSON/timeout errors no longer are retried (see above)

### 0.2.0 ###
* RPCResult can be treated as a promise

### 0.1.0 ###
* Initial Release
