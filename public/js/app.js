var Sounds = {
  current: null,
  sources: {},
  result: {
    clips: [],
    sources: []
  }
};

var SoundsData = {};

var WebAudio = {
  context: new webkitAudioContext(),
  loadSound: function(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onprogress = function(ev) {
      $('.track.source').width(((ev.loaded / ev.total) * 100) + '%');
    };
    xhr.onload = function() {
      if (xhr.readyState != 4) return;
      this.context.decodeAudioData(xhr.response, function(buffer) {
        cb && cb(buffer);
      });
    }.bind(this);

    WebAudio.request && WebAudio.request.abort();
    WebAudio.request = xhr;
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
  }
};

var Clip = {
  createUI: function(src, offsetX, width, left) {
    var width = width || '100%';
    var clip = $('<div></div>').addClass('clip')
    .css('background-image', 'url("' + src + '")')
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

var Animation = function(initialTime, duration, renderer, ender) {
  this.initialTime = initialTime;
  this.duration = duration;
  this.renderer = renderer;
  this.ender = ender;
  this.running = false;
};

Animation.prototype.start = function() {
  this.running = true;
  this.update();
};

Animation.prototype.update = function() {
  var currentTime = WebAudio.context.currentTime - this.initialTime,
      currentDuration = this.duration(),
      progress = currentTime / currentDuration;

  if (!this.running) {
    return;
  }

  if (currentTime <= currentDuration && this.renderer) {
    this.renderer(progress);
    webkitRequestAnimationFrame(function() {
      this.update();
    }.bind(this));
  } else if (currentTime > currentDuration && this.ender) {
    this.ender();
  }
};

Animation.prototype.stop = function() {
  this.running = false;
  this.ender && this.ender();
};

var Selection = {
  cancel: function() {
    var $sourceTrack = $('.track.source'), sound = Sounds.sources[Sounds.current];
    $sourceTrack.imgAreaSelect({ instance: true }).cancelSelection();
    if (!sound) return;
    sound.cue && WebAudio.stopSound(sound.cue, 0);
    sound.anim && sound.anim.stop();
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
    WebAudio.context = new webkitAudioContext(2, duration * 44100, 44100);
    WebAudio.context.oncomplete = function(event) {
      var data = Wav.createWaveFileData(event.renderedBuffer);
      WebAudio.context = new webkitAudioContext();
      cb && cb(data);
    };
    this.play();
    WebAudio.context.startRendering();
  },
  stop: function() {
    Sounds.result.sources.reverse().forEach(function(source) {
      WebAudio.stopSound(source);
    });
    Sounds.result.sources = [];
    if (Sounds.result.anim) {
      Sounds.result.anim.stop();
    }
  },
  play: function() {
    var delay = -Sounds.result.clips[0].duration;

    this.stop();

    Sounds.result.clips.forEach(function(clip, i, clips) {
      var cue = WebAudio.createSound(Sounds.sources[clip.id].buffer);
      Sounds.result.sources.push(cue);
      delay += clips[i ? i - 1 : i].duration;
      WebAudio.playSound(cue, delay, clip.startTime, clip.duration);
    });
    Sounds.result.anim = new Animation(WebAudio.context.currentTime, function() {
      return Sounds.result.sources.length ? Sounds.result.clips.map(function(clip) {
        return clip.duration;
      }).reduce(function(a, b) {
        return a + b;
      }) : 0;
    }, function(progress) {
      $('.track.result').find('.playhead').width((progress * 100).toFixed(3) + '%');
    }, function() {
      $('.track.result').find('.playhead').width(0);
    });
    Sounds.result.anim.start();
  }
};

var Uploading = {
  create: function(data) {
    var token = localStorage['access_token'];

    if (!token || token.length == 0) {
      alert('Please connect to SoundCloud first. Press C');
      return;
    }

    var xhr = new XMLHttpRequest(),
        formData = new FormData(),
        title = '',
        bb = new (window.BlobBuilder || window.WebKitBlobBuilder)()

    if (!(title = prompt('Give a title to this sound!'))) {
      title = 'AudioJedit Mashup ' + ((Math.random() * 1e10)| 0);
    }
    bb.append(data.buffer);
    formData.append('track[asset_data]', bb.getBlob('audio/x-wav'));
    formData.append('track[title]', title);
    formData.append('track[description]', 'Created with http://audiojedit.herokuapp.com');
    formData.append('track[sharing]', 'public');
    xhr.open('POST', 'https://api.soundcloud.com/tracks.json?oauth_token=' + token, true);
    xhr.onload = function(e) {
      $('.track.result').removeClass('uploading').find('.playhead').width(0);
      $.facebox('Upload completed!');
    };

    xhr.upload.onprogress = function(ev) {
      if(ev.lengthComputable) {
        var progress = ((ev.loaded / ev.total) * 100).toFixed(2),
            resultWidth = 0;

        $('.track.result .clip').each(function() {
          resultWidth += $(this).width();
        });

        $('.track.result').width(resultWidth * (progress / 100));
      }
    };

    xhr.send(formData);
  }
};


$(window).bind('hashchange load', function() {
  var soundUrl = document.location.hash.substring(1);
  if (!soundUrl.length) return;

  if (!window['webkitAudioContext']) {
    $('.track.source')
    .html('<h1>You need to be running the latest version of Chrome. Get it <a href="http://www.google.com/chrome">here</a></h1>')
    .addClass('loaded');

    return;
  }

  $.getJSON(soundUrl + '.json', function(sound) {
    Sounds.sources[sound.id] = sound;
    $('#sound-title').html(sound.title + ' by ' + '<span class="username">' + sound.user.username + '</span>');

    $('.track.source').removeClass('loaded').width(0)
      .find('.clip').replaceWith(Clip.createUI(sound.waveform_url));

    WebAudio.loadSound(soundUrl + '/audio', function(buffer) {
      Sounds.current = sound.id;
      Sounds.sources[sound.id].buffer = buffer;
      $('.track.source').addClass('loaded');
    });
  });
})
.bind('keydown', function(ev) {
  var keyMap = {
    27: function() { // Escape
      Selection.cancel();
    },
    13: function() { // Enter
      var $sourceTrack = $('.track.source'),
          $resultTrack = $('.track.result'),
          sound = Sounds.sources[Sounds.current],
          selection = $sourceTrack.imgAreaSelect({ instance: true }).getSelection(),
          clip = Clip.create(selection, $sourceTrack.width(), sound.duration);

      $resultTrack.append(Clip.createUI(sound.waveform_url, selection.x1, selection.width, $resultTrack.width()))
      .width($resultTrack.width() + selection.width);
      clip.id = sound.id;
      Sounds.result.clips.push(clip);
    },
    32: function() { // Space
      SoundRenderering.play();
    },
    85: function() { // u - Upload to SoundCloud
      if (!Sounds.result.clips.length) {
        alert('You have nothing to upload!');
        return;
      }

      var renderAndUpload = function() {
        SoundRenderering.create(Sounds.result.clips.map(function(clip) {
          return clip.duration;
        }).reduce(function(a, b) {
          return a + b;
        }), function(data) {
          Uploading.create(data); // Yay
        });
      };

      if (!localStorage['access_token']) {
        SC.connect({
          scope: 'non-expiring',
          client_id: '1288146c708a6fa789f74748fe960337',
          redirect_uri: 'http://audiojedit.herokuapp.com/public/soundcloud-callback.html',
          connected: function() {
            localStorage['access_token'] = SC.options.access_token;
            renderAndUpload();
          }
        });
      } else {
        renderAndUpload();
      }
    },
    82: function() { // r = Reset result
      Sounds.result = {
        clips: [],
        sources: []
      };

      $('.track.result').width(0).find('.clip').remove();
    },
    83: function() { // s - Stop playing result
      SoundRenderering.stop();
    },
    72: function() {
      $.facebox({ div: '#help' });
    }
  };

  if (!ev.metaKey && !ev.shiftKey && !ev.ctrlKey && !ev.altKey &&
      ev.target && !/input|textarea/i.test(ev.target.nodeName)
     ) {
    keyMap[ev.keyCode] && keyMap[ev.keyCode]();
  }
});

(function() {
  var req = null;
  $('#search').keyup(function(ev) {
    Selection.cancel();
    req && req.abort();
    req = $.getJSON('http://api.soundcloud.com/tracks.json', {
      q: $(this).val(), limit: 9, order: 'hotness', client_id: '1288146c708a6fa789f74748fe960337'
    }).done(function(sounds) {
      SoundsData = {};
      $('.sound').remove();
      sounds.forEach(function(sound) {
        SoundsData[sound.id] = sound;
        $('<img src="' + (sound.artwork_url || sound.user.avatar_url) + '">').addClass('sound').data('sound-id', sound.id).appendTo('#daw header');
      });
    });
    return false;
  }.throttle(100));

  $('.sound').live('click', function(ev) {
    Selection.cancel();
    var sound = SoundsData[$(this).data('sound-id')];
    document.location.hash = '/' + sound.user.permalink + '/' + sound.permalink;
    return false;
  });

  $('.sound').live('mouseenter', function(ev) {
    var sound = SoundsData[$(this).data('sound-id')];
    $('#sound-title').html(sound.title + ' by ' + '<span class="username">' + sound.user.username + '</span>');
    return false;
  });

  $('.sound').live('mouseleave', function(ev) {
    var sound = Sounds.sources[Sounds.current];
    $('#sound-title').html(sound ? sound.title + ' by ' + '<span class="username">' + sound.user.username + '</span>' : 'AudioJedit');
    return false;
  });

  $('.track.source').imgAreaSelect({
    handles: true,
    instance: true,
    minHeight: $('.track.source').height(),
    onSelectEnd: function(img, selection) {
      if (!selection.width || !Sounds.sources[Sounds.current]) {
        return false;
      }

      var waveformWidth = $('.track.source').width(),
          sound = Sounds.sources[Sounds.current],
          clip = Clip.create(selection, waveformWidth, sound.duration);

      sound.cue && WebAudio.stopSound(sound.cue, 0);
      sound.cue = WebAudio.createSound(sound.buffer);
      sound.anim && sound.anim.stop();
      WebAudio.playSound(sound.cue, 0, clip.startTime, clip.duration);
      sound.anim = new Animation(WebAudio.context.currentTime, function() {
        return clip.duration;
      }, function(progress) {
        $('.track.source').find('.playhead').css('left', selection.x1).width(progress * selection.width | 0);
      }, function() {
        var selectionWidth = $('.track.source').imgAreaSelect({ instance: true }).getSelection().width;
        $('.track.source').find('.playhead').width(selectionWidth);
      });
      sound.anim.start();
    }
  });
}());
