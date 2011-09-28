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

Animation = {
  update: function(initialTime, duration, renderer) {
    var currentTime = WebAudio.context.currentTime - initialTime,
        progress = currentTime / duration;

    if (currentTime <= duration && renderer) {
      renderer(progress.toFixed(3));
      webkitRequestAnimationFrame(function() {
        this.update(initialTime, duration, renderer);
      }.bind(this));
    }
  }
};

$(window).bind('hashchange load', function() {
  var soundUrl = document.location.hash.substring(1);
  if (!soundUrl.length) return;

  $.getJSON(soundUrl + '.json', function(sound) {
    $('#sound-title').html(sound.title + ' by ' + sound.user.username);

    var nClips = $('.clip').length || 1,
        waveformWidth = $('.track.source').width(),
        waveformHeight = $('.track.source').height();

    $('<div></div>').addClass('clip')
    .css('background-image', 'url("' + sound.waveform_url + '")')
    .css('width', (100 / nClips) + '%')
    .appendTo($('.track.source').addClass('loaded'));

    WebAudio.loadSound(soundUrl + '/audio', function(buffer) {
      WebAudio.source = WebAudio.createSound(buffer);

      $('.track.source').imgAreaSelect({
        handles: true,
        instance: true,
        minHeight: waveformHeight,
        onSelectEnd: function(img, selection) {
          if (!selection.width) return false;

          var startTime = ((selection.x1 * sound.duration) / waveformWidth) / 1000,
              duration   = (((selection.x2 * sound.duration) / waveformWidth) / 1000) - startTime;

          WebAudio.stopSound(WebAudio.source, 0);
          WebAudio.playSound(WebAudio.source, 0, startTime, duration);
          Animation.update(WebAudio.context.currentTime, duration, function(progress) {
            $('.track.source').find('.playhead').css('left', selection.x1).css('width', progress * selection.width | 0);
          });
        }
      });
    });
  });
});

//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
//
// var SoundManager = Backbone.Model.extend({});
// var Editor = Backbone.Model.extend({
//   defaults: {
//     onlineContext: new webkitAudioContext()
//   }
// });
//
// var Track = Backbone.Model.extend({
//   defaults: {
//     clips: []
//   },
//
//   play: function(delay, pitch, context) {
//     var clips = this.get('clips');
//     if (clips.length == 0) return;
//     else this.stop();
//
//     var cue = -clips[0].get('duration') + (delay || 0);
//     clips.forEach(function(clip) {
//       cue += clip.get('duration');
//       clip.play(cue, pitch, context)
//     });
//   },
//
//   stop: function(delay) {
//     var clips = this.get('clips');
//     if (clips.length == 0) return;
//     else clips.forEach(function(clip) {
//       clip.stop();
//     });
//   },
//
//   duration: function() {
//     if (this.get('clips').length == 0)
//       return 0;
//     else
//       return this.get('clips').map(function(clip) {
//         return clip.get('duration');
//       }).reduce(function(a, b) {
//         return a + b;
//       });
//   },
//
//   insert: function(clip, position) {
//     var clips = this.get('clips');
//     var position = position || clips.length - 1;
//     var changedClips = clips.slice(0, position);
//     changedClips.push(clip, clips.slice(position, clips.length));
//     changedClips = _.flatten(changedClips);
//     this.set({ clips: changedClips });
//   },
//
//   upload: function(cb) {
//     var pitch = $('.track-control:last .pitch').val() > 0 ? $('.track-control:last .pitch').val() : 0.01;
//     var offlineContext = new webkitAudioContext(2, (this.duration() / pitch) * 44100, 44100);
//
//     offlineContext.oncomplete = function(event) {
//       var data = PCMData.encode({
//         sampleRate: event.renderedBuffer.sampleRate,
//         channelCount: 1,
//         bytesPerSample: 2,
//         data: event.renderedBuffer.getChannelData()
//       });
//
//       var token = soundManager.get('access_token');
//       if (!token || token.length == 0) {
//         delete offlineContext;
//         return;
//       }
//       else {
//         var xhr = new XMLHttpRequest();
//         var formData = new FormData();
//         function byteValue(x) {
//           return x.charCodeAt(0) & 0xff;
//         }
//         var ords = Array.prototype.map.call(data, byteValue);
//         var ui8a = new Uint8Array(ords);
//         var bb = new (window.BlobBuilder || window.WebKitBlobBuilder)();
//         bb.append(ui8a.buffer);
//         formData.append('track[asset_data]', bb.getBlob());
//         formData.append('track[title]', editor.get('tracks')[0].get('sound').attributes.title + ' Jedi Remix!');
//         formData.append('track[sharing]', 'public');
//         xhr.open('POST', SC.options.apiHost + '/tracks.json?oauth_token=' + token, true);
//         xhr.onload = function(e) {
//           alert('Uploaded! Hackerish stuff going on here.');
//           $('.track-control:last .upload').text('Upload');
//         };
//
//         xhr.onprogress = function(ev) {
//           if(ev.lengthComputable) {
//             $('.track-control:last .upload').text('Uploaded ' + Number((ev.loaded / ev.total * 100)) + '%'); // FIXME: STINKS
//           }
//         }.bind(this);
//
//         xhr.send(formData);  // multipart/form-data
//       }
//     }.bind(this);
//
//
//     this.play(0, pitch, offlineContext);
//     offlineContext.startRendering();
//   },
//
//   reset: function() {
//     this.stop();
//     this.set({ clips: [] });
//   },
//
//   isEmpty: function() {
//     return this.get('clips').length == 0;
//   }
// });
//
// var Clip = Backbone.Model.extend({
//   initialize: function(attrs) {
//     this.set(_.extend(attrs, { duration: attrs.end - attrs.start }));
//   },
//
//   play: function(delay, pitch, context) {
//     var context   = context || new webkitAudioContext();
//     var source    = context.createBufferSource();
//     source.buffer = context.createBuffer(this.get('sound').buffer, false);
//     source.playbackRate.value = pitch || 1;
//     source.connect(context.destination);
//
//     // Issue 82722:  make envelope optional for AudioBufferSourceNode.noteGrainOn method in Web Audio API
//     // http://code.google.com/p/chromium/issues/detail?id=82722
//     // We don't want fading on this method.
//     source.noteGrainOn(context.currentTime + (delay || 0), this.get('start'), this.get('duration'));
//     // source.noteOff(context.currentTime + (delay || 0) + this.get('duration'));
//     return this.set({ source: source });
//   },
//
//   stop: function(delay) { // FIXME: NOT WORKING
//     var source = this.get('source');
//     if (source) {
//       source.noteOff(delay || 0);
//       source.disconnect(0);
//     }
//   }
// });
//
// var Sound = Backbone.Model.extend({
//   initialize: function(attrs, cb) {
//     this.set(attrs);
// });
//
// var onlineContext  = new webkitAudioContext();
// var soundManager = new SoundManager();
// var editor = new Editor({
//   tracks: [ new Track, new Track ]
// });
//
// $('#search').keyup(function instantSearch(ev) {
//   var req = instantSearch.req;
//   var $search = $(this);
//   if ($search.val().length < 3) return;
//   !!req && req.abort();
//   instantSearch.req = $.getJSON('http://api.soundcloud.com/tracks.json', {
//     client_id: '1288146c708a6fa789f74748fe960337',
//     q: $search.val(),
//     limit: $('#soundmanager').width() / 110 | 0,
//     duration: {
//       from: 0,
//       to: 60000
//     }
//   })
//   .success(function(data) {
//     soundManager.set({ search: { value: $search.val(), results: data } });
//     $('#sounds').html('');
//     _.each(data, function(sound) {
//       $('<div class="sound preview"></div>')
//         .attr('draggable', true)
//         .css('background-image', 'url("' + (sound.artwork_url || sound.user.avatar_url) + '")')
//         .appendTo('#sounds');
//     });
//   })
// });
//
// $('.sound').live('click', function(ev) {
//   ev.preventDefault();
//   var sound = soundManager.get('search').results[$(this).index()];
//   var sourceTrack = editor.get('tracks')[0];
//   var resultTrack = editor.get('tracks')[1];
//   $('.track-control:last .reset').trigger('click');
//
//   $('.track.source').html(
//     $('<div class="clip loading"></div>')
//     .css('background-image', 'url("' + sound.waveform_url + '")')
//   ).fadeIn(300);
//   $('.track-control:first').text(sound.user.username + ' - ' + sound.title + ' | ' + (sound.duration / 1000) + ' seconds');
//
//   sourceTrack.reset();
//   sourceTrack.set({
//     sound: new Sound(sound, function(sound) {
//       $('.sound.loaded').removeClass('loaded').addClass('preview');
//       $(this).removeClass('preview').addClass('loaded');
//       $('.track:first .clip').removeClass('loading');
//       $('.track:first').imgAreaSelect({
//         handles: true,
//         instance: true,
//         minHeight: $('.track:first').height(),
//         onSelectEnd: function(img, selection) {
//           var startTime = ((selection.x1 * sound.duration) / $('.track:first').width()) / 1000;
//           var endTime   = ((selection.x2 * sound.duration) / $('.track:first').width()) / 1000;
//           var clip = new Clip({ start: startTime, end: endTime, sound: sound});
//           sourceTrack.reset();
//           sourceTrack.set({ clips: [ clip ] });
//           sourceTrack.play(0, 1, onlineContext);
//         }
//       });
//     }.bind(this))
//   });
// });
//
// $('.track-control input[type="range"]:first').dblclick(function(e) {
//   e.preventDefault();
//   $(this).val(1);
// });
//
// $('.track-control .play').live('click', function(ev) {
//   ev.preventDefault();
//   var resultTrack = editor.get('tracks')[1];
//   var pitch       = $('.track-control:last .pitch').val() > 0 ? $('.track-control:last .pitch').val() : 0.01;
//   var duration    = resultTrack.duration();
//   var $playBtn     = $(this);
//
//   if (resultTrack.isEmpty()) return;
//
//   if ($playBtn.hasClass('playing')) {
//     resultTrack.stop();
//     $('.track:last .playhead').trigger('webkitTransitionEnd');
//   }
//   else {
//     var lastTrackWidth = 0;
//     $('.track:last .clip').each(function() {
//       lastTrackWidth += $(this).width();
//     });
//
//     $playBtn.addClass('playing');
//     console.log(duration / Number(pitch))
//     $('.track:last .playhead').show(function() {
//       $(this)
//         .css('-webkit-transition', 'width ' + duration + 's linear')
//         .css('width', lastTrackWidth + 'px')
//         .bind('webkitTransitionEnd', function() {
//           $(this).hide().css('width', 0);
//           $('.track-control:last button,input').removeAttr('disabled');
//           $playBtn.removeClass('playing')
//         })
//     })
//
//     $('.track-control:last button,input').not($playBtn).attr('disabled', true);
//
//     resultTrack.play(0, pitch, onlineContext);
//   }
// });
//
// $('.track-control .reset').click(function(e) {
//   e.preventDefault();
//   var resultTrack = editor.get('tracks')[1];
//   resultTrack.reset();
//
//   // FIXME: DO THE BACKBONE VIEW CODE FOR GOD SAKE!
//   $('.track:last .clip').remove();
// })
//
// $('.track-control .upload').click(function(e) {
//   e.preventDefault();
//   SC.options['site']    = 'soundcloud.com';
//   SC.options['apiHost'] = 'https://api.soundcloud.com';
//   SC.connect({
//     client_id:    "1288146c708a6fa789f74748fe960337",
//     redirect_uri: "http://audiojedi.nodester.com/public/soundcloud-callback.html",
//     connected: function() {
//       soundManager.set({ access_token: SC.options.access_token });
//       var resultTrack = editor.get('tracks')[1];
//       resultTrack.upload();
//     }
//   });
// });
//
//
// $(window).keydown(function(ev) {
//   if (ev.keyCode == 13) {
//     var selection = $('.track:first').imgAreaSelect({ instance: true }).getSelection();
//     if (!selection || selection.width == 0) return;
//
//     var sourceTrack = editor.get('tracks')[0];
//     var resultTrack = editor.get('tracks')[1];
//     resultTrack.insert(sourceTrack.get('clips')[0]);
//     $('.track:last').append(
//       $('<div class="clip" draggable="true"></div>')
//       .css('background-image', 'url("' + sourceTrack.get('sound').attributes.waveform_url + '")')
//       .css('background-position', -selection.x1 + 'px ' + selection.y1 + 'px')
//       .css('width', selection.width)
//       .css('background-size',  (($('.track:last').width() * 100) / selection.width) + '% 100%')
//     );
//   }
// })
//
// $('.sound').live('mouseenter', function(ev) {
//   var sound = soundManager.get('search').results[$(this).index()];
//   !!sound && $('#sound-info').text(sound.user.username + ' - ' + sound.title);
// })
//
// $('.sound').live('mouseleave', function(ev) {
//   var sound = editor.get('tracks')[0].get('sound');
//   $('#sound-info').text(!!sound ? sound.attributes.user.username + ' - ' + sound.attributes.title : '');
// })
//
// $(window).resize(function(e) {
//   $('#editor').css('height', $(window).height() - 275 | 0);
//   $('.track').css('height', $('#editor').height() / 2.1 | 0);
// })
//
// $(window).trigger('resize');
