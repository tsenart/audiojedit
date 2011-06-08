var
  url = require('url'),
  fs = require('fs'),
  http = require('http'),
  express = require('express'),
  ws = require('socket.io'),
  PORT = process.env['app_port'] || 8181;

var app = express.createServer();

app.configure(function() {
  app.use(express.static(__dirname + '/public'));
});

app.get('/:username/:trackname', function(req, res) {
  res.render('index.ejs', { layout: false });
})

app.listen(PORT);
var wsServer = ws.listen(app);

wsServer.on('connection', function(client) {
  client.on('message', function(data) {
    // TODO: Cache!
    http.get({
      host: 'api.soundcloud.com',
      path: '/resolve.json?client_id=gGt2hgm7KEj3b710HlJw&url=http://soundcloud.com' + url.parse(data.url).pathname
    }, function(res) {
      if (res.statusCode == 302) {
        var apiReqParams = url.parse(res.headers.location);
        http.get({ host: apiReqParams.host, path: apiReqParams.pathname + apiReqParams.search }, function(res) {
          res.setEncoding('utf8');
          var track = '';

          res.on('data', function(chunk) {
            track += chunk;
          });

          res.on('end', function() {
            track = JSON.parse(track);
            client.send(track);
            if (track.downloadable) {
              var audioReqParams = url.parse(track.download_url)
              http.get({ host: audioReqParams.host, path: audioReqParams.pathname + '?client_id=gGt2hgm7KEj3b710HlJw' }, function(res) {
                if (res.statusCode == 302) {
                  var apiReqParams = url.parse(res.headers.location);
                  http.get({ host: apiReqParams.host, path: apiReqParams.pathname + apiReqParams.search }, function(res) {
                    res.setEncoding('binary');
                    var fileStream = fs.createWriteStream('./public/tracks/' + track.id);

                    res.on('data', function(chunk) {
                      fileStream.write(chunk, 'binary');
                    });

                    res.on('end', function() {
                      fileStream.end();
                      client.send({ audio: '/tracks/' + track.id });
                    });
                  });
                }
                else {
                  console.log(res.statusCode, res.body)
                }
              })
            }

          });
        })
      }
      else {
        console.log(res.statusCode, res.body)
      }
    });
  });
});