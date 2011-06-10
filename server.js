var
  url = require('url'),
  fs = require('fs'),
  http = require('http'),
  bee = require('beeline');


var scResolve = function(resource, finalResponse, callback) {
  var reqOptions = {
    host: 'api.soundcloud.com',
    port: 80,
    path: '/resolve.json?client_id=gGt2hgm7KEj3b710HlJw&url=http://soundcloud.com/' + resource,
    method: 'HEAD'
  };

  return http.request(reqOptions, function(res) {
    if (!res.headers.location) {
      res.headers['Content-Length'] = 0;
      finalResponse.writeHead(res.statusCode, res.headers);
      finalResponse.end();
    }
    else
        !!callback && callback(res);
  })
  .on('error', console.log)
  .end();
};

var router = bee.route({

  'r`^/public/(.*)$`': bee.staticDir('./public/', {
    '.html': 'text/html',
    '.css': 'text/css',
    '.gif': 'image/gif',
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
        path: reqOptions.pathname + reqOptions.search
      };

      http.get(reqOptions, function(res) {
        res.setEncoding('utf-8');
        var track = '';
        res.on('data', function(chunk) {
          track += chunk;
        })
        .on('end', function() {
          track = JSON.parse(track);
          reqOptions = url.parse(track.download_url);
          reqOptions = {
            host: reqOptions.host,
            port: 80,
            path: reqOptions.pathname + '?client_id=gGt2hgm7KEj3b710HlJw',
            method: 'HEAD'
          };

          http.request(reqOptions, function(res) {
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
                port: 80,
                path: reqOptions.pathname + reqOptions.search,
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
              .on('error', console.log);
            }
          })
          .on('error', console.log)
          .end();
        })
      })
      .on('error', console.log)
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
          port: 80,
          path: reqOptions.pathname + reqOptions.search
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
        .on('error', console.log);
      }
    });
  }
});

http.createServer(router).listen(process.env['app_port'] || 8181);

