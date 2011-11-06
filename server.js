var url = require('url'),
    fs = require('fs'),
    http = require('http'),
    bee = require('beeline'),
    SC_CLIENT_ID = '1288146c708a6fa789f74748fe960337';

var errorHandler = function (err, res) {
  console.log(err);
  res.writeHead(500);
  res.end();
};

var serveError = function (response) {
  return function (err) {
    errorHandler(err, response);
  };
};

var handleResponse = function (response, callback) {
  var responseHandler = function (res) {
    if (!res.headers.location) {
      res.headers['Content-Length'] = 0;
      response.writeHead(res.statusCode, res.headers);
      response.end();
    } else {
      callback && callback(res);
    }
  };
  return responseHandler;
};

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

  'r`^/(index(\\.html?)?)?(\\?.*)?$`': function (req, finalResponse, matches) {
    return serveIndex(finalResponse);
  },

  'r`^/([\\w-_]+)/([\\w-_]+)/audio`': function (req, finalResponse, matches) {
    scResolve(matches.join('/'), finalResponse, function (res) {
      var reqOptions = url.parse(res.headers.location);
      reqOptions = {
        host: reqOptions.host,
        port: 80,
        path: reqOptions.pathname + reqOptions.search,
        headers: {
          'User-Agent': 'AudioJedit'
        }
      };

      http.get(reqOptions, function (res) {
        res.setEncoding('utf-8');
        var track = '';
        res.on('data', function (chunk) {
          track += chunk;
        })
        .on('end', function () {
          track = JSON.parse(track);
          reqOptions = url.parse(track.stream_url);
          reqOptions = {
            host: reqOptions.host,
            path: reqOptions.pathname + '?client_id=' + SC_CLIENT_ID,
            headers: {
              'User-Agent': 'AudioJedit'
            }
          };

          http.get(reqOptions, function (res) {
            if (!res.headers.location) {
              res.headers['Content-Length'] = 0;
              finalResponse.writeHead(404, { 'Content-Type': 'application/octet-stream' });
              finalResponse.end();
            } else {
              res.setEncoding('binary');
              reqOptions = url.parse(res.headers.location);
              reqOptions = {
                host: reqOptions.host,
                path: reqOptions.pathname + reqOptions.search,
                headers: {
                  'User-Agent': 'AudioJedit'
                }
              };

              http.get(reqOptions, function (res) {
                finalResponse.writeHead(res.statusCode, res.headers);

                res.on('data', function (chunk) {
                  finalResponse.write(chunk);
                })
                .on('end', function () {
                  finalResponse.end();
                });
              })
              .on('error', serveError(finalResponse))
            }
          })
          .on('error', serveError(finalResponse))
        })
      })
      .on('error', serveError(finalResponse))
    });
  },

  'r`^/([\\w-_]+)/([\\w-_]+)(\\.\\w+)?`': function (req, finalResponse, matches) {
    var format = matches.filter(Boolean).length == 3 ? matches.pop().substring(1) : 'html';

    // only json is permitted, else serve index
    if (format != 'json') {
      return serveIndex(finalResponse)
    }

    scResolve(matches.join('/'), finalResponse, function (res) {

      var reqOptions = url.parse(res.headers.location);
      reqOptions = {
        host: reqOptions.host,
        path: reqOptions.pathname + reqOptions.search,
        headers: {
          'User-Agent': 'AudioJedit'
        }
      };

      http.get(reqOptions, function (res) {
        finalResponse.writeHead(res.statusCode, res.headers);
        res.on('data', function (chunk) {
          finalResponse.write(chunk);
        })
        .on('end', function () {
          finalResponse.end();
        });
      })
      .on('error', serveError(finalResponse));

    });
  }
});

http.createServer(router).listen(process.env.PORT || 8181);

