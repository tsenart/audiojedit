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
    }

  };
  keyMap[ev.keyCode] && keyMap[ev.keyCode]();
});