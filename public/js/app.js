var Daw = Backbone.Model.extend({
  initialize: function(attrs) {
    if ('sequencer' in attrs)
      attrs.sequencer.set({ daw: this });
    this.set(attrs);
  }
});

var Sequencer = Backbone.Model.extend({
  initialize: function(attrs) {
    if ('tracks' in attrs)
      _.each(attrs.tracks, function(track) {
        track.set({ sequencer: this });
      }.bind(this));
    this.set(attrs);
    this.context = new webkitAudioContext();
  },

  play: function() {
    this.get('tracks').forEach(function(track) {
      track.play() // Timer wroooooooooong!
    });
  },

  stop: function() {
    this.get('tracks').forEach(function(track) {
      track.stop() // Timer wroooooooooong!
    });
  }

});

var Track = Backbone.Model.extend({
  initialize: function(attrs) {
    if ('clips' in attrs)
      _.each(attrs.clips, function(clip) {
        clip.set({ track: this });
      }.bind(this));
    this.set(attrs);
  },

  play: function(delay) {
    var clips = this.get('clips');
    if (clips.length == 0) return;
    else this.stop();

    var cue = -clips[0].duration + (delay || 0);
    clips.forEach(function(clip) {
      cue += clip.duration;
      clip.play(cue)
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
    return _(this.get('clips')).chain().pluck('duration').reduce(function(a, b) {
      return a + b;
    }).value();
  },

  push: function(clip) {
    this.get('clips').push(clip);
  }
});

var Clip = Backbone.Model.extend({
  initialize: function(attrs) {
    this.set(_.extend(attrs, { duration: attrs.end - attrs.start }));
  },

  play: function(delay) {
    var track = this.get('track');
    if (!track) {
      console.log('Clip has no Track.')
      return;
    }

    var source = track.sequencer.context.createBufferSource();
    source.buffer = track.sequencer.context.createBuffer(this.get('sound').buffer, false);
    source.connect(track.sequencer.context.destination);
    // Issue 82722:  make envelope optional for AudioBufferSourceNode.noteGrainOn method in Web Audio API
    // http://code.google.com/p/chromium/issues/detail?id=82722
    // We don't want fading on this method.
    source.noteGrainOn(track.sequencer.context.currentTime + (delay || 0), this.get('start'), this.get('duration'));
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
    xhr.send();
  }
});

var daw = new Daw({
  sequencer: new Sequencer({
    tracks: [ new Track, new Track ]
  })
});

$('#search').keyup(function(ev) {
  var $search = $(this);
  if ($search.val().length < 3) return;
  $('#sounds').addClass('searching');
  $.getJSON('http://api.soundcloud.com/tracks.json', { client_id: 'gGt2hgm7KEj3b710HlJw', q: $search.val(), limit: 11 })
  .success(function(data) {
    daw.set({ search: { value: $search.val(), results: data } });
    $('#sounds').html('');
    _.each(data, function(sound) {
      $('<div class="sound preview"></div>')
        .css('background-image', 'url("' + (sound.artwork_url || sound.user.avatar_url) + '")')
        .appendTo('#sounds');
    });
  });
});

$('#soundmanager').mouseenter(function(ev) {
  $(this).stop().animate({ top: 0 }, 500)
});

$('#soundmanager').mouseleave(function(ev) {
  $(this).stop().animate({ top: -$(this).height() + 15 }, 500, 'easeInOutSine');
});

$('.sound').live('click', function(ev) {
  var sound = daw.get('search').results[$(ev.target).index()];
  $('.track:first .waveform').addClass('loading').attr('src', sound.waveform_url).fadeIn(300);

  new Sound(daw.get('search').results[$(ev.target).index()], function(sound) {
    daw.set({ sound: sound });
    $('.sound.loaded').removeClass('loaded').addClass('preview');
    $(this).removeClass('preview').addClass('loaded');
    $('.track:first .waveform').removeClass('loading');
  }.bind(this));
});

$('.sound').live('mouseenter', function(ev) {
  var sound = daw.get('search').results[$(ev.target).index()];
  !!sound && $('#sound-info').text(sound.user.username + ' - ' + sound.title);
})

$('.sound').live('mouseleave', function(ev) {
  var sound = daw.get('sound');
  !!sound && $('#sound-info').text(sound.user.username + ' - ' + sound.title);
})

$(window).resize(function() {
  $('#soundmanager').css('top', -$('#soundmanager').height() + 15 );
})

