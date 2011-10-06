var
  url = require('url'),
  fs = require('fs'),
  http = require('http'),
  bee = require('beeline'),
  SC_CLIENT_ID = '1288146c708a6fa789f74748fe960337';

var errorHandler = function(err, res) {
  console.log(err);
  res.writeHead(500);
  res.end();
};

var scResolve = function(resource, finalResponse, callback) {
  var reqOptions = {
    host: 'api.soundcloud.com',
    port: 80,
    path: '/resolve.json?client_id=' + SC_CLIENT_ID + '&url=http://soundcloud.com/' + resource,
    method: 'GET',
    headers: {
      'User-Agent': 'AudioJedit'
    }
  };

  return http.request(reqOptions, function(res) {
    if (!res.headers.location) {
      res.headers['Content-Length'] = 0;
      finalResponse.writeHead(res.statusCode, res.headers);
      finalResponse.end();
    }
    else
      callback && callback(res);
  })
  .on('error', function(err) {
    errorHandler(err, finalResponse);
  })
  .end();
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

  'r`^/(index(\\.html?)?)?(\\?.*)?$`': function(req, finalResponse, matches) {
    return fs.readFile('./public/index.html', function(err, data) {
      if (err) console.log(err);
      else {
        finalResponse.writeHead(200, { 'Content-Type': 'text/html' });
        finalResponse.end(data);
      }
    });
  },

  'r`^/([\\w-_]+)/([\\w-_]+)/audio`': function(req, finalResponse, matches) {
    scResolve(matches.join('/'), finalResponse, function(res) {
      var reqOptions = url.parse(res.headers.location);
      reqOptions = {
        host: reqOptions.host,
        port: 80,
        path: reqOptions.pathname + reqOptions.search,
        headers: {
          'User-Agent': 'AudioJedit'
        }
      };

      http.get(reqOptions, function(res) {
        res.setEncoding('utf-8');
        var track = '';
        res.on('data', function(chunk) {
          track += chunk;
        })
        .on('end', function() {
          track = JSON.parse(track);
          reqOptions = url.parse(track.stream_url);
          reqOptions = {
            host: reqOptions.host,
            path: reqOptions.pathname + '?client_id=' + SC_CLIENT_ID,
            headers: {
              'User-Agent': 'AudioJedit'
            }
          };

          http.get(reqOptions, function(res) {
            if (!res.headers.location) {
              res.headers['Content-Length'] = 0;
              finalResponse.writeHead(404, { 'Content-Type': 'application/octet-stream' });
              finalResponse.end();
            }
            else {
              res.setEncoding('binary');
              reqOptions = url.parse(res.headers.location);
              reqOptions = {
                host: reqOptions.host,
                path: reqOptions.pathname + reqOptions.search,
                headers: {
                  'User-Agent': 'AudioJedit'
                }

              };

              http.get(reqOptions, function(res) {
                finalResponse.writeHead(res.statusCode, res.headers);

                res.on('data', function(chunk) {
                  finalResponse.write(chunk);
                })
                .on('end', function() {
                  finalResponse.end();
                });
              })
              .on('error', function(err) {
                errorHandler(err, finalResponse);
              })
            }
          })
          .on('error', function(err) {
            errorHandler(err, finalResponse);
          })
        })
      })
      .on('error', function(err) {
        errorHandler(err, finalResponse);
      })
    });
  },

  'r`^/([\\w-_]+)/([\\w-_]+)(\\.\\w+)?`': function(req, finalResponse, matches) {
    var format = matches.filter(Boolean).length == 3 ? matches.pop().substring(1) : 'html';

    scResolve(matches.join('/'), finalResponse, function(res) {
      if (format == 'html') {
        fs.readFile('./public/index.html', function(err, data) {
          if (err) console.log(err);
          else {
            finalResponse.writeHead(200, { 'Content-Type': 'text/html' });
            finalResponse.end(data);
          }
        });
      }

      if (format == 'json') {
        var reqOptions = url.parse(res.headers.location);
        reqOptions = {
          host: reqOptions.host,
          path: reqOptions.pathname + reqOptions.search,
          headers: {
            'User-Agent': 'AudioJedit'
          }
        };

        http.get(reqOptions, function(res) {
          finalResponse.writeHead(res.statusCode, res.headers);
          res.on('data', function(chunk) {
            finalResponse.write(chunk);
          })
          .on('end', function() {
            finalResponse.end();
          });
        })
        .on('error', function(err) {
          errorHandler(err, finalResponse);
        })
      }
    });
  }
});

http.createServer(router).listen(process.env.PORT || 8181);

