var url = require('url'),
    fs = require('fs'),
    http = require('http'),
    bee = require('beeline'),
    SC_CLIENT_ID = '1288146c708a6fa789f74748fe960337';

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

// resolves 'resource' from the SC API, and if found, passes it to a callback
var scResolve = function (resource, response, callback) {
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

var resolveTrack = function (response, callback) {
  var responseHandler = function (track) {
    track = JSON.parse(track);
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

var makeRequest = function (response, callback) {
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

// gets chunked data, then passes data to a callback
var getChunks = function (response, callback) {
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

    return scResolve(resource, response, makeRequest(response, getChunks(response, resolveTrack(response, makeRequest(response, writeResponse(response))))));
  },

  'r`^/([\\w-_]+)/([\\w-_]+)(\\.\\w+)?`': function (req, response, matches) {
    var format = matches.filter(Boolean).length == 3 ? matches.pop().substring(1) : 'html';
    var resource = matches.join('/');

    // only json is permitted, else serve index
    if (format != 'json') {
      return serveIndex(response);
    }

    return scResolve(resource, response, makeRequest(response, writeResponse(response)));
  }
});

http.createServer(router).listen(process.env.PORT || 8181);

