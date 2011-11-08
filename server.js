var url = require('url'),
    fs = require('fs'),
    http = require('http'),
    bee = require('beeline'),
    SC_CLIENT_ID = '1288146c708a6fa789f74748fe960337';

var makeChain = function (args, start) {
  start = start || 0;
  var chain = Array.prototype.slice.call(args, start + 2);
  chain.unshift(args[start]);
  return chain;
};

var chainCallbacks = function (args, start) {
  start = start || 0;
  var chain = makeChain(args, start);
  var callback = args[start + 1].apply(this, chain);
  return callback;
};

var errorHandler = function (err, response) {
  console.log(err);
  response.writeHead(500);
  response.end();
};

var serveError = function (response) {
  return function (err) {
    errorHandler(err, response);
  };
};

// creates a response handler that verifies the response prior to executing a callback
var handleResponse = function (response, callback, errorStatusCode, errorHeaders) {
  var responseHandler = function (res) {
    if (!res.headers.location) {
      res.headers['Content-Length'] = 0;
      errorStatusCode = errorStatusCode || res.statusCode;
      errorHeaders = errorHeaders || res.headers;
      response.writeHead(errorStatusCode, errorHeaders);
      response.end();
    } else {
      callback && callback(res);
    }
  };
  return responseHandler;
};

// resolves 'resource' from the SC API resolve endpoint, and passes the response to a callback
var scResolve = function (resource, response) {
  var callback = chainCallbacks(arguments, 1);

  var reqOptions = {
    host: 'api.soundcloud.com',
    port: 80,
    path: '/resolve.json?client_id=' + SC_CLIENT_ID + '&url=http://soundcloud.com/' + resource,
    method: 'GET',
    headers: {
      'User-Agent': 'AudioJedit'
    }
  };

  var req = http.request(reqOptions, handleResponse(response, callback));

  req.on('error', serveError(response));

  req.end();

  return req;
};

// creates a response handler which presumes the response is the track JSON, and requests the track itself from the stream_url
var requestTrack = function (response) {
  var callback = chainCallbacks(arguments);

  var responseHandler = function (track) {
    track = JSON.parse(track);

    if (!track.stream_url) {
      response.writeHead(404, { 'Content-Type': 'application/octet-stream' });
      response.end();
      return;
    }

    var reqOptions = url.parse(track.stream_url);
    reqOptions = {
      host: reqOptions.host,
      path: reqOptions.pathname + '?client_id=' + SC_CLIENT_ID,
      headers: {
        'User-Agent': 'AudioJedit'
      }
    };

    var req = http.get(reqOptions, handleResponse(response, callback, 404, { 'Content-Type': 'application/octet-stream' }));

    req.on('error', serveError(response));

    return req;
  };
  return responseHandler;
};

// creates a response handler that writes to the response
var writeResponse = function (response) {
  var responseHandler = function (res) {
    response.writeHead(res.statusCode, res.headers);
    res.on('data', function (chunk) {
      response.write(chunk);
    });
    res.on('end', function () {
      response.end();
    });
  };
  return responseHandler;
};

// creates a response handler that makes a subsequent request with options based on the response.headers.location
var makeRequest = function (response) {
  var callback = chainCallbacks(arguments);

  var responseHandler = function (res) {
    var reqOptions = url.parse(res.headers.location);
    reqOptions = {
      host: reqOptions.host,
      port: 80,
      path: reqOptions.pathname + reqOptions.search,
      headers: {
        'User-Agent': 'AudioJedit'
      }
    };

    var req = http.get(reqOptions, callback);

    req.on('error', serveError(response));

    return req;
  };
  return responseHandler;
};

// creates a response handler that gets chunked data, then passes that [buffered] data to a callback
var getChunks = function (response) {
  var callback = chainCallbacks(arguments);

  var responseHandler = function (res) {
    res.setEncoding('utf-8');
    var data = '';
    res.on('data', function (chunk) {
      data += chunk;
    });
    res.on('end', function () {
      callback(data);
    });
  };
  return responseHandler;
};

var serveIndex = function (response) {
  return fs.readFile('./public/index.html', function (err, data) {
    if (err) {
      console.log(err);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(data);
    }
  });
};

var router = bee.route({

  'r`^/public/(.*)`': bee.staticDir('./public/', {
    '.html': 'text/html',
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.ico': 'image/png',
    '.js': 'text/javascript'
  }),

  'r`^/(index(\\.html?)?)?(\\?.*)?$`': function (req, response, matches) {
    return serveIndex(response);
  },

  'r`^/([\\w-_]+)/([\\w-_]+)/audio`': function (req, response, matches) {
    var resource = matches.join('/');

    return scResolve(resource, response, makeRequest, getChunks, requestTrack, makeRequest, writeResponse);
  },

  'r`^/([\\w-_]+)/([\\w-_]+)(\\.\\w+)?`': function (req, response, matches) {
    var format = matches.filter(Boolean).length == 3 ? matches.pop().substring(1) : 'html';
    var resource = matches.join('/');

    // only json is permitted, else serve index
    if (format != 'json') {
      return serveIndex(response);
    }

    return scResolve(resource, response, makeRequest, writeResponse);
  }
});

http.createServer(router).listen(process.env.PORT || 8181);

