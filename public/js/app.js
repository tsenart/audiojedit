var Sounds = {
  source: null,
  result: {
    clips: [],
    sources: []
  }
};

var WebAudio = {
  context: new webkitAudioContext(),
  loadSound: function(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function() {
      if (xhr.readyState != 4) return;
      this.context.decodeAudioData(xhr.response, function(buffer) {
        cb && cb(buffer);
      });
    }.bind(this);
    xhr.send();
  },
  createSound: function(buffer) {
    var source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    return source;
  },
  playSound: function(source, delay, start, duration) {
    if (!start || !duration) {
      source.noteOn(this.context.currentTime + (delay || 0));
    } else if (start && duration) {
      source.noteGrainOn(this.context.currentTime + (delay || 0), start, duration);
    }
  },
  stopSound: function(source, delay) {
    source.noteOff(this.context.currentTime + (delay || 0));
  },
  source: null
};

var Clip = {
  createUI: function(src, offsetX, width, left) {
    var width = width || '100%';
    var clip = $('<div></div>').addClass('clip')
    .css('background-image', 'url("' + src + '")');
    width && clip.css('width', width);
    left && clip.css('left', left);
    offsetX && clip.css('background-position-x', -offsetX + 'px ');
    return clip;
  },
  create: function(selection, waveformWidth, duration) {
    var startTime = ((selection.x1 * duration) / waveformWidth) / 1000,
        duration   = (((selection.x2 * duration) / waveformWidth) / 1000) - startTime;

    return { startTime: startTime, duration: duration };
  }
};

var Animation = {
  update: function(initialTime, duration, renderer, ender) {
    var currentTime = WebAudio.context.currentTime - initialTime,
        progress = currentTime / duration;

    if (currentTime <= duration && renderer) {
      renderer(progress);
      webkitRequestAnimationFrame(function() {
        this.update(initialTime, duration, renderer, ender);
      }.bind(this));
    } else if (currentTime > duration && ender) {
      ender();
    }
  }
};

var Wav = {};
Wav.createWaveFileData = (function() {
  var writeString = function(s, a, offset) {
    for (var i = 0; i < s.length; ++i) {
      a[offset + i] = s.charCodeAt(i);
    }
  };

  var writeInt16 = function(n, a, offset) {
    n = n | 0;
    a[offset + 0] = n & 255;
    a[offset + 1] = (n >> 8) & 255;
  };

  var writeInt32 = function(n, a, offset) {
    n = n | 0
    a[offset + 0] = n & 255;
    a[offset + 1] = (n >> 8) & 255;
    a[offset + 2] = (n >> 16) & 255;
    a[offset + 3] = (n >> 24) & 255;
  };

  var writeAudioBuffer = function(audioBuffer, a, offset) {
    var n = audioBuffer.length,
        bufferL = audioBuffer.getChannelData(0),
        sampleL,
        bufferR = audioBuffer.getChannelData(1),
        sampleR;

    for (var i = 0; i < n; ++i) {
      sampleL = bufferL[i] * 32768.0;
      sampleR = bufferR[i] * 32768.0;

      // Clip left and right samples to the limitations of 16-bit.
      // If we don't do this then we'll get nasty wrap-around distortion.
      if (sampleL < -32768) { sampleL = -32768; }
      if (sampleL >  32767) { sampleL =  32767; }
      if (sampleR < -32768) { sampleR = -32768; }
      if (sampleR >  32767) { sampleR =  32767; }

      writeInt16(sampleL, a, offset);
      writeInt16(sampleR, a, offset + 2);
      offset += 4;
    }
  };

  return function(audioBuffer) {
    var frameLength = audioBuffer.length,
        numberOfChannels = audioBuffer.numberOfChannels,
        sampleRate = audioBuffer.sampleRate,
        bitsPerSample = 16,
        byteRate = sampleRate * numberOfChannels * bitsPerSample / 8,
        blockAlign = numberOfChannels * bitsPerSample / 8,
        wavDataByteLength = frameLength * numberOfChannels * 2, // 16-bit audio
        headerByteLength = 44,
        totalLength = headerByteLength + wavDataByteLength,
        waveFileData = new Uint8Array(totalLength),
        subChunk1Size = 16, // for linear PCM
        subChunk2Size = wavDataByteLength,
        chunkSize = 4 + (8 + subChunk1Size) + (8 + subChunk2Size);

    writeString('RIFF', waveFileData, 0);
    writeInt32(chunkSize, waveFileData, 4);
    writeString('WAVE', waveFileData, 8);
    writeString('fmt ', waveFileData, 12);

    writeInt32(subChunk1Size, waveFileData, 16);      // SubChunk1Size (4)
    writeInt16(1, waveFileData, 20);                  // AudioFormat (2)
    writeInt16(numberOfChannels, waveFileData, 22);   // NumChannels (2)
    writeInt32(sampleRate, waveFileData, 24);         // SampleRate (4)
    writeInt32(byteRate, waveFileData, 28);           // ByteRate (4)
    writeInt16(blockAlign, waveFileData, 32);         // BlockAlign (2)
    writeInt32(bitsPerSample, waveFileData, 34);      // BitsPerSample (4)

    writeString('data', waveFileData, 36);
    writeInt32(subChunk2Size, waveFileData, 40);      // SubChunk2Size (4)

    // Write actual audio data starting at offset 44.
    writeAudioBuffer(audioBuffer, waveFileData, 44);

    return waveFileData;
  }
}());

var SoundRenderering = {
  create: function(duration, cb) {
    WebAudio.context = new webkitAudioContext(2, Math.ceil(duration) * 44100, 44100);
    WebAudio.context.oncomplete = function(event) {
      var data = Wav.createWaveFileData(event.renderedBuffer);
      WebAudio.context = new webkitAudioContext();
      cb && cb(data);
    };
    $(window).trigger('keydown', { keyCode: 32 }); // Hacky
    WebAudio.context.startRendering();
  }
};

var Uploading = {
  create: function(data) {
    var token = localStorage['access_token'];

    if (!token || token.length == 0) {
      delete offlineContext;
      alert('Please connect to SoundCloud first');
      return;
    }

    var xhr = new XMLHttpRequest();
        formData = new FormData();
    // function byteValue(x) {
    //   return x.charCodeAt(0) & 0xff;
    // }
    // var ords = Array.prototype.map.call(data, byteValue);
    // var ui8a = new Uint8Array(ords);
    // var bb = new (window.BlobBuilder || window.WebKitBlobBuilder)();
      // bb.append(ui8a.buffer);
    formData.append('track[asset_data]', data);//bb.getBlob());
    formData.append('track[title]', Sounds.source.title + ' Jedi Remix!');
    formData.append('track[sharing]', 'public');
    xhr.open('POST', 'http://api.soundcloud.com/tracks.json?oauth_token=' + token, true);
    xhr.onload = function(e) {
      console.log(xhr);
      $('.track.result').removeClass('uploading');
    };

    xhr.onprogress = function(ev) {
      if(ev.lengthComputable) {
        $('.track.result').find('.playhead').width((ev.loaded / ev.total * 100) + '%');
      }
    };

    $('.track.result').addClass('uploading');
    xhr.send(formData);
  }
};


$(window).bind('hashchange load', function() {
  var soundUrl = document.location.hash.substring(1);
  if (!soundUrl.length) return;

  $.getJSON(soundUrl + '.json', function(sound) {
    Sounds.source = sound;

    $('#sound-title').html(sound.title + ' by ' + '<span class="username">' + sound.user.username + '</span>');

    var nClips = $('.clip').length || 1,
        waveformWidth = $('.track.source').width(),
        waveformHeight = $('.track.source').height();

    $('.track.source').append(Clip.createUI(sound.waveform_url)).addClass('loaded');

    WebAudio.loadSound(soundUrl + '/audio', function(buffer) {
      Sounds.source.buffer = buffer;

      $('.track.source').imgAreaSelect({
        handles: true,
        instance: true,
        minHeight: waveformHeight,
        onSelectEnd: function(img, selection) {
          if (!selection.width) return false;

          var clip = Clip.create(selection, waveformWidth, Sounds.source.duration);

          WebAudio.source && WebAudio.stopSound(WebAudio.source, 0);
          WebAudio.source = WebAudio.createSound(Sounds.source.buffer);
          WebAudio.playSound(WebAudio.source, 0, clip.startTime, clip.duration);
          Animation.update(WebAudio.context.currentTime, clip.duration, function(progress) {
            $('.track.source').find('.playhead').css('left', selection.x1).width(progress * selection.width | 0);
          }, function() {
            var selectionWidth = $('.track.source').imgAreaSelect({ instance: true }).getSelection().width;
            $('.track.source').find('.playhead').width(selectionWidth);
          });
        }
      });
    });
  });
})
.bind('keydown', function(ev) {
  var keyMap = {
    27: function() { // Escape
      var $sourceTrack = $('.track.source');
      $sourceTrack.imgAreaSelect({ instance: true }).cancelSelection();
      $sourceTrack.find('.playhead').css({ left: 0, width: 0});
    },
    13: function() { // Enter
      var $sourceTrack = $('.track.source'),
          $resultTrack = $('.track.result'),
          selection = $sourceTrack.imgAreaSelect({ instance: true }).getSelection(),
          clip = Clip.create(selection, $sourceTrack.width(), Sounds.source.duration);

      $resultTrack.append(Clip.createUI(Sounds.source.waveform_url, selection.x1, selection.width, $resultTrack.width()))
      .width($resultTrack.width() + selection.width);

      Sounds.result.clips.push(clip);
    },
    32: function() { // Space
      var cue = -Sounds.result.clips[0].duration,
          duration = Sounds.result.clips.map(function(clip) {
            return clip.duration;
          }).reduce(function(a, b) {
            return a + b;
          });

      Sounds.result.sources.reverse().forEach(function(source) {
        WebAudio.stopSound(source);
      });
      Sounds.result.sources = [];

      Sounds.result.clips.forEach(function(clip, i, clips) {
        cue += clips[i ? i - 1 : i].duration;
        Sounds.result.sources.push(WebAudio.createSound(Sounds.source.buffer));
        WebAudio.playSound(Sounds.result.sources[ Sounds.result.sources.length - 1 ], cue, clip.startTime, clip.duration);
      });

      Animation.update(WebAudio.context.currentTime, duration, function(progress) {
        $('.track.result').find('.playhead').width((progress * 100).toFixed(3) + '%');
      }, function() {
        $('.track.result').find('.playhead').width(0);
      });
    },
    67: function() { // c - Connect with SoundCloud
      SC.connect({
        client_id:    "1288146c708a6fa789f74748fe960337",
        redirect_uri: "http://audiojedit.herokuapp.com/public/soundcloud-callback.html",
        connected: function() {
          localStorage['access_token'] = SC.options.access_token;
        }
      });
    },
    85: function() { // u - Upload to SoundCloud
      SoundRenderering.create(Sounds.result.clips.map(function(clip) {
        return clip.duration;
      }).reduce(function(a, b) {
        return a + b;
      }), function(data) {
        Uploading.create(data); // Yay
      });
    }
  };
  keyMap[ev.keyCode] && keyMap[ev.keyCode]();
});