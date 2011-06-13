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
    else
      attrs.clips = [];
    this.set(attrs);
  },

  play: function(delay) {
    var clips = this.get('clips');
    if (clips.length == 0) return;
    else this.stop();

    var cue = -clips[0].get('duration') + (delay || 0);
    clips.forEach(function(clip) {
      cue += clip.get('duration');
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
    return _(this.get('clips')).chain().map(function(clip) {
      return clip.get('duration');
    }).reduce(function(a, b) {
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

    var sequencer = track.get('sequencer');
    var source = sequencer.context.createBufferSource();
    source.buffer = sequencer.context.createBuffer(this.get('sound').buffer, false);
    source.connect(sequencer.context.destination);
    // Issue 82722:  make envelope optional for AudioBufferSourceNode.noteGrainOn method in Web Audio API
    // http://code.google.com/p/chromium/issues/detail?id=82722
    // We don't want fading on this method.
    source.noteGrainOn(sequencer.context.currentTime + (delay || 0), this.get('start'), this.get('duration'));
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
        .attr('draggable', true)
        .css('background-image', 'url("' + (sound.artwork_url || sound.user.avatar_url) + '")')
        .appendTo('#sounds');
    });

    // $('.sound')
    // .bind('dragstart', function(ev) {
    //   var ev = ev.originalEvent;
    //   $('#soundmanager').trigger('mouseleave');
    //   $(this).css('z-index', 9999);
    //   ev.dataTransfer.effectAllowed = 'move';
    //   ev.dataTransfer.setData('application/json', JSON.stringify({ index: $(this).index() }));
    // })
  });
});


$('#soundmanager').mouseenter(function(ev) {
  $(this).stop().animate({ top: 0 }, 500)
});

$('#soundmanager').mouseleave(function(ev) {
  $(this).stop().animate({ top: -$(this).height() + 15 }, 500);
});

// document.querySelector('body').addEventListener('dragover', function(e) {
//   alert('YAY');
//   e.dataTransfer.dropEffect = 'copy';
//   return false;
// }, true);

// document.querySelector('.track').addEventListener('drop', function(ev) {
// ev.stopPropagation();
$('.sound').live('click', function(ev) {
  ev.preventDefault();
  $('#soundmanager').trigger('mouseleave');
  // var index = JSON.parse(ev.originalEvent.dataTransfer.getData('application/json')).index;
  var index = $(this).index();
  var sound = daw.get('search').results[index];
  $('.track:first').html(
    $('<div class="clip loading"></div>')
    .css('background-image', 'url("' + sound.waveform_url + '")')
  ).fadeIn(300);
  $('.track-control:first').text(sound.user.username + ' - ' + sound.title + ' | ');

  new Sound(daw.get('search').results[$(ev.target).index()], function(sound) {
    daw.set({ sound: sound });
    $('.sound.loaded').removeClass('loaded').addClass('preview');
    $(this).removeClass('preview').addClass('loaded');
    $('.track:first .clip').removeClass('loading')
    $('.track:first').imgAreaSelect({
      handles: true,
      maxHeight: $('.track:first').height(),
      minHeight: $('.track:first').height(),
      instance: true,
      onSelectEnd: function(img, selection) {
        var startTime = ((selection.x1 * sound.duration) / $('.track:first').width()) / 1000;
        var endTime   = ((selection.x2 * sound.duration) / $('.track:first').width()) / 1000;
        var track = _(daw.get('sequencer').get('tracks')).first();
        var clip = new Clip({ start: startTime, end: endTime, track: track, sound: sound});
        track.stop();
        track.set({ clips: [ clip ] });
        track.play();
      }
    });
    $('.track-control:first').append($('<a href="#add" class="add">Add Clip</a>'));
  }.bind(this))
  // return false;
});

$('.track-control a.play').click(function(ev) {
  ev.preventDefault();
  $('.track:last .playhead')
    .css('-webkit-transition', 'none')
    .css('margin-left', 0)

  daw.get('sequencer').get('tracks')[1].play();

  var lastTrackWidth = 0;
  $('.track:last .clip').each(function() {
    lastTrackWidth += $(this).width();
  });

  $('.track:last .playhead')
    .css('-webkit-transition', 'margin-left ' + daw.get('sequencer').get('tracks')[1].duration() + 's linear')
    .css('margin-left', lastTrackWidth + 'px')
});

$('.track-control a.add').live('click', function(e) {
  e.preventDefault();
  $(window).trigger('keydown', true)
})

$(window).keydown(function(ev, fake) {
  if (ev.keyCode == 13 || fake) {
    daw.get('sequencer').get('tracks')[1].push(daw.get('sequencer').get('tracks')[0].get('clips')[0]);
    var selection = $('.track:first').imgAreaSelect({ instance: true }).getSelection();
    $('.track:last').append(
      $('<div class="clip" draggable="true"></div>')
      .css('background-image', 'url("' + daw.get('sound').waveform_url + '")')
      .css('background-position', -selection.x1 + 'px ' + selection.y1 + 'px')
      .css('width', selection.width)
      .css('background-size',  (($('.track:last').width() * 100)/selection.width) + '% 100%')
    ).width();
  }
})

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

