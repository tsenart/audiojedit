Clip = (buffer, selection) ->
  waveformWidth = Number($("#waveform").css("width").replace("px", ""))
  @buffer = buffer
  @startTime = ((selection.x1 * @buffer.duration) / waveformWidth) / 1000
  @endTime = ((selection.x2 * @buffer.duration) / waveformWidth) / 1000
  @duration = -> @endTime - @startTime
  @selection = selection

Sequencer = (clips) ->
  @clips = clips or []

getAudio = (uri, cb) ->
  request = new XMLHttpRequest()
  request.open "GET", uri, true
  request.responseType = "arraybuffer"
  request.onreadystatechange = (event) ->
    if cb and request.readyState == 4 and ( request.status == 200 or request.status == 0 )
      cb(request.response)

  request.send null

Clip.prototype.play = (delay) ->
  context = Clip.prototype.play.context = Clip.prototype.play.context or new webkitAudioContext()
  @source = context.createBufferSource()
  @source.buffer = context.createBuffer(@buffer.data, false)
  @source.connect context.destination
  @source.noteGrainOn context.currentTime + (delay or 0), @startTime, @duration

Sequencer.prototype.insert = (clip) ->
  clip instanceof Clip and @clips.push(clip)

Sequencer.prototype.play = (delay) ->
  cue = -@clips[0].duration + (delay or 0)
  @clips.forEach (clip, i) ->
    cue += clip.duration
    clip.play cue

uri = "http://api.soundcloud.com/resolve?callback=?&url=http://soundcloud.com" + document.location.pathname
$.getJSON(uri,
  client_id: "johan_app"
  format: "json"
).then (data) ->
  if not data.downloadable or not data.waveform_url
    return
  getAudio data.download_url + "?client_id=johan_app", (buffer) ->
    $(window).keyup (e) ->
      e.preventDefault()
      actions =
        32: sequencer.play
        13: ->
          selection = waveform.getSelection()
          sequencer.insert new Clip(
            data: buffer
            duration: data.duration
          , selection)
          seqWidth = sequencer.clips.map((clip) ->
            clip.selection.width
          ).reduce((a, b) ->
            a + b
          )
          $("#seq").css("width", seqWidth).append $(".sample:first").clone().css("background-position", -selection.x1 + "px " + selection.y1 + "px").css("width", selection.width)[0].outerHTML

      actions.hasOwnProperty(e.keyCode) and actions[e.keyCode].call()

    $("#waveform").attr "src", data.waveform_url
    $(".sample").css "background-image", "url(\"" + data.waveform_url + "\")"
    waveform = $("#waveform").imgAreaSelect(
      handles: true
      instance: true
      maxHeight: 280
      minHeight: 280
      onSelectEnd: (img, selection) ->
        clip = new Clip(
          data: buffer
          duration: data.duration
        , selection)
        clip.play()

      onInit: ->
        sequencer = new Sequencer()
    )
, (err) ->
  console.log err
