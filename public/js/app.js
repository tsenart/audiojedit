if ( !window.requestAnimationFrame ) {
  window.requestAnimationFrame = ( function() {
    return window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function( /* function FrameRequestCallback */ callback, /* DOMElement Element */ element ) {
      window.setTimeout( callback, 1000 / 60 );
    };
  } )();
}

var SoundManager = Backbone.Model.extend({});
var Editor = Backbone.Model.extend({
  defaults: {
    onlineContext: new webkitAudioContext()
  }
});

var Track = Backbone.Model.extend({
  defaults: {
    clips: []
  },

  play: function(delay, context) {
    var clips = this.get('clips');
    if (clips.length == 0) return;
    else this.stop();

    var cue = -clips[0].get('duration') + (delay || 0);
    clips.forEach(function(clip) {
      cue += clip.get('duration');
      clip.play(cue, context)
    });
  },

  stop: function(delay) {
    var clips = this.get('clips');
    if (clips.length == 0) return;
    else clips.forEach(function(clip) {
      clip.stop();
    });
  },

  duration: function() {
    if (this.get('clips').length == 0)
      return 0;
    else
      return _(this.get('clips')).chain().map(function(clip) {
        return clip.get('duration');
      }).reduce(function(a, b) {
        return a + b;
      }).value();
  },

  insert: function(clip, position) {
    var clips = this.get('clips');
    var position = position || clips.length - 1;
    var changedClips = clips.slice(0, position);
    changedClips.push(clip, clips.slice(position, clips.length));
    changedClips = _.flatten(changedClips);
    this.set({ clips: changedClips });
  },

  upload: function(cb) {
    var offlineContext = new webkitAudioContext(2, this.duration() * 44100, 44100);

    offlineContext.oncomplete = function(event) {
      var data = PCMData.encode({
        sampleRate: event.renderedBuffer.sampleRate,
        channelCount: 1,
        bytesPerSample: 2,
        data: event.renderedBuffer.getChannelData()
      });

      var player = new Audio('data:audio/x-wav;base64,' + btoa(data));
      player.play();

      var token = soundManager.get('access_token');
      if (!token || token.length == 0) {
        delete offlineContext;
        return;
      }
      else {
        var xhr = new XMLHttpRequest();
        var formData = new FormData();
        function byteValue(x) {
          return x.charCodeAt(0) & 0xff;
        }
        var ords = Array.prototype.map.call(data, byteValue);
        var ui8a = new Uint8Array(ords);
        var bb = new (window.BlobBuilder || window.WebKitBlobBuilder)();
        bb.append(ui8a.buffer);
        formData.append('track[asset_data]', bb.getBlob());
        formData.append('track[title]', editor.get('tracks')[0].get('sound').attributes.title + ' Jedi Remix!');
        formData.append('track[sharing]', 'public');
        xhr.open('POST', SC.options.apiHost + '/tracks.json?oauth_token=' + token, true);
        xhr.onload = function(e) {
          alert('DONE!')
        };

        xhr.send(formData);  // multipart/form-data
      }
    }.bind(this);

    this.play(0, offlineContext);
    offlineContext.startRendering();
  },

  reset: function() {
    this.stop();
    this.set({ clips: [] });
  },

  isEmpty: function() {
    return this.get('clips').length == 0;
  }
});

var Clip = Backbone.Model.extend({
  initialize: function(attrs) {
    this.set(_.extend(attrs, { duration: attrs.end - attrs.start }));
  },

  play: function(delay, context) {
    var context   = context || new webkitAudioContext();
    var source    = context.createBufferSource();
    source.buffer = context.createBuffer(this.get('sound').buffer, false);
    source.connect(context.destination);

    // Issue 82722:  make envelope optional for AudioBufferSourceNode.noteGrainOn method in Web Audio API
    // http://code.google.com/p/chromium/issues/detail?id=82722
    // We don't want fading on this method.
    source.noteGrainOn(context.currentTime + (delay || 0), this.get('start'), this.get('duration'));
    // source.noteOff(context.currentTime + (delay || 0) + this.get('duration'));
    return this.set({ source: source });
  },

  stop: function(delay) {
    var source = this.get('source');
    return source && source.noteOff(delay || 0);
  }
});

var Sound = Backbone.Model.extend({
  initialize: function(attrs, cb) {
    this.set(attrs);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', [document.location.origin, attrs.user.permalink, attrs.permalink, 'audio'].join('/'), true);
    xhr.responseType = 'arraybuffer';
    xhr.overrideMimeType('text/plain; charset=x-user-defined');

    xhr.onload = function() {
      if (xhr.readyState != 4) return;
      this.set({ buffer: xhr.response });
      !!cb && cb(this.attributes);
    }.bind(this);

    xhr.onprogress = function(ev) {
      if(ev.lengthComputable) {
        this.set({ loading: parseInt( (ev.loaded / ev.total * 100), 10) });
      }
    }.bind(this);

    xhr.send();
  }
});

var onlineContext  = new webkitAudioContext();
var soundManager = new SoundManager();
var editor = new Editor({
  tracks: [ new Track, new Track ]
});

$('#search').keyup(function instantSearch(ev) {
  var req = instantSearch.req;
  var $search = $(this);
  if ($search.val().length < 3) return;
  !!req && req.abort();
  instantSearch.req = $.getJSON('http://api.soundcloud.com/tracks.json', { client_id: '1288146c708a6fa789f74748fe960337', q: $search.val(), limit: $('#soundmanager').width() / 110 | 0 })
  .success(function(data) {
    soundManager.set({ search: { value: $search.val(), results: data } });
    $('#sounds').html('');
    _.each(data, function(sound) {
      $('<div class="sound preview"></div>')
        .attr('draggable', true)
        .css('background-image', 'url("' + (sound.artwork_url || sound.user.avatar_url) + '")')
        .appendTo('#sounds');
    });
  })
});

$('.sound').live('click', function(ev) {
  ev.preventDefault();
  var sound = soundManager.get('search').results[$(this).index()];
  var sourceTrack = editor.get('tracks')[0];
  var resultTrack = editor.get('tracks')[1];
  $('.track-control:last .reset').trigger('click');

  $('.track.source').html(
    $('<div class="clip loading"></div>')
    .css('background-image', 'url("' + sound.waveform_url + '")')
  ).fadeIn(300);
  $('.track-control:first').text(sound.user.username + ' - ' + sound.title);

  sourceTrack.set({
    sound: new Sound(sound, function(sound) {
      $('.sound.loaded').removeClass('loaded').addClass('preview');
      $(this).removeClass('preview').addClass('loaded');
      $('.track:first .clip').removeClass('loading');
      $('.track:first').imgAreaSelect({
        handles: true,
        instance: true,
        minHeight: $('.track:first').height(),
        onSelectEnd: function(img, selection) {
          var startTime = ((selection.x1 * sound.duration) / $('.track:first').width()) / 1000;
          var endTime   = ((selection.x2 * sound.duration) / $('.track:first').width()) / 1000;
          var clip = new Clip({ start: startTime, end: endTime, sound: sound});
          sourceTrack.reset();
          sourceTrack.set({ clips: [ clip ] });
          sourceTrack.play(0, onlineContext);
        }
      });
    }.bind(this))
  });
});

$('.track-control a.play').click(function(ev) {
  ev.preventDefault();
  var resultTrack = editor.get('tracks')[1];
  var duration    = resultTrack.duration();

  if (resultTrack.isEmpty()) return;

  var lastTrackWidth = 0;
  $('.track:last .clip').each(function() {
    lastTrackWidth += $(this).width();
  });

  $('.track:last .playhead').show(function() {
    $(this)
      .css('-webkit-transition', 'width ' + duration + 's linear')
      .css('width', lastTrackWidth + 'px')
      .bind('webkitTransitionEnd', function() {
        $(this).hide().css('width', 0);
      })
  })


  resultTrack.play(0, onlineContext);
});

$('.track-control a.reset').click(function(e) {
  e.preventDefault();
  var resultTrack = editor.get('tracks')[1];
  resultTrack.reset();

  // FIXME: DO THE BACKBONE VIEW CODE FOR GOD SAKE!
  $('.track:last .clip').remove();
})

$('.track-control a.upload').click(function(e) {
  e.preventDefault();
  SC.options['site']    = 'soundcloud.com';
  SC.options['apiHost'] = 'https://api.soundcloud.com';
  SC.connect({
    client_id:    "1288146c708a6fa789f74748fe960337",
    redirect_uri: "http://localhost:8181/public/soundcloud-callback.html",
    connected: function() {
      soundManager.set({ access_token: SC.options.access_token });
      var resultTrack = editor.get('tracks')[1];
      resultTrack.upload();
    }
  });
});


$(window).keydown(function(ev) {
  if (ev.keyCode == 13) {
    var sourceTrack = editor.get('tracks')[0];
    var resultTrack = editor.get('tracks')[1];
    resultTrack.insert(sourceTrack.get('clips')[0]);
    var selection = $('.track:first').imgAreaSelect({ instance: true }).getSelection();
    $('.track:last').append(
      $('<div class="clip" draggable="true"></div>')
      .css('background-image', 'url("' + sourceTrack.get('sound').attributes.waveform_url + '")')
      .css('background-position', -selection.x1 + 'px ' + selection.y1 + 'px')
      .css('width', selection.width)
      .css('background-size',  (($('.track:last').width() * 100) / selection.width) + '% 100%')
    );
  }
})

$('.sound').live('mouseenter', function(ev) {
  var sound = soundManager.get('search').results[$(this).index()];
  !!sound && $('#sound-info').text(sound.user.username + ' - ' + sound.title);
})

$('.sound').live('mouseleave', function(ev) {
  var sound = editor.get('tracks')[0].get('sound');
  $('#sound-info').text(!!sound ? sound.attributes.user.username + ' - ' + sound.attributes.title : '');
})

$(window).resize(function(e) {
  $('#editor').css('height', $(window).height() - 275 | 0);
  $('.track').css('height', $('#editor').height() / 2.1 | 0)
})

$(window).trigger('resize');
