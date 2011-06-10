var Clip = function(buffer, selection) {
  var waveformWidth = $('#player .waveform').width();
  this.buffer = buffer;
  this.startTime = ((selection.x1 * this.buffer.duration) / waveformWidth) / 1000
  this.endTime = ((selection.x2 * this.buffer.duration) / waveformWidth) / 1000
  this.duration = this.endTime - this.startTime;
  this.selection = selection;
};

Clip.prototype.play = function(delay) {
  var context = (this.sequencer && this.sequencer.audioContext) || new webkitAudioContext();
  this.source = context.createBufferSource();
  this.source.buffer = context.createBuffer(this.buffer.data, false);
  this.source.connect(context.destination);
  // Issue 82722:  make envelope optional for AudioBufferSourceNode.noteGrainOn method in Web Audio API
  // http://code.google.com/p/chromium/issues/detail?id=82722
  // We don't want fading on this method.
  this.source.noteGrainOn(context.currentTime + (delay || 0), this.startTime, this.duration);
};

var Sequencer = function() {
  this.audioContext = new webkitAudioContext();
  this.clips = [];
};

Sequencer.prototype.insert = function(clip) {
  if (clip instanceof Clip) {
    clip.sequencer = this;
    this.clips.push(clip);
  };
};

Sequencer.prototype.play = function(delay) {
  if (this.clips.length == 0) return;
  var cue = -this.clips[0].duration + (delay || 0);
  this.clips.forEach(function(clip, i) {
    cue += clip.duration;
    clip.play(cue)
  })
};

Sequencer.prototype.pixelWidth = function() {
  return this.clips.map(function(clip) {
    return clip.selection.width;
  }).reduce(function(a, b) {
    return a + b;
  });
};

if (!document.location.pathname.match(/^\/index.*/) && document.location.pathname.length > 1) {
  $('#home').fadeOut(300, function() {
    $('#player, #sequencer').fadeIn(400);
  });

  var sequencer = new Sequencer();
  var track;

  $.getJSON(document.location.pathname + '.json', function(data) {
    track = data;
    $('#player .waveform').css('background-image', 'url("' + track.waveform_url + '")');

    var xhr = new XMLHttpRequest();
    xhr.open('GET', document.location.pathname + '/audio', true);
    xhr.responseType = 'arraybuffer';
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    xhr.onload = function(e) {
      if (xhr.readyState != 4) console.log('FAILED LOADING AUDIO');
      else {
        track.audio = xhr.response;
        $(window).keyup(function(e) {
          e.preventDefault();
          var actions = {
            32: function() {
              !!sequencer && sequencer.play();
              $('#sequencer .playhead').css('-webkit-transition', 'none').css('left', '0px')
                                       .css('-webkit-transition', 'left ' + ((track.duration * sequencer.pixelWidth()) / $('#player .waveform').width()) + 'ms linear')
                                       .css('left', sequencer.pixelWidth() + 'px')
            },
            13: function() {
              var selection = waveform.getSelection();
              sequencer.insert(new Clip({ data: track.audio, duration: track.duration }, selection));
              var seqWidth = sequencer.pixelWidth();
              $('#sequencer .waveform').css('width', seqWidth)
                                       .append($('<div class="clip">')
                                         .css('background-image', 'url("' + track.waveform_url + '")')
                                         .css('background-position', -selection.x1 + 'px ' + selection.y1 + 'px')
                                         .css('width', selection.width)[0].outerHTML
                                       );
            }
          };
          actions.hasOwnProperty(e.keyCode) && actions[e.keyCode]();
        });

        var waveform = $('#player .waveform').imgAreaSelect({
          handles: true,
          instance: true,
          maxHeight: 280,
          minHeight: 280,
          onSelectEnd: function(img, selection) {
            var clip = new Clip({ data: track.audio, duration: track.duration }, selection);
            clip.play();
          }
        });
      }
    };
    xhr.send();
  });
}
