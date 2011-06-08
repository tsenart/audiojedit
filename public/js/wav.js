/*

wav.js - a javascript audiolib for reading WAVE files

Reads the Format chunk of a WAVE file using the RIFF specification.

Only supports slice() on uncompressed PCM format.
Only supports one Data chunk.

NOTE: Does not auto-correct:
 - Incorrect block alignment values
 - Incorrect Average Samples Per Second value
 - Missing word alignment padding

@author  David Lindkvist
@twitter ffdead

*/


/**
 * Constructor: Parse Format chunk of WAV files.
 * 
 * Fires onloadend() function after successful load.
 *
 * @param {File|Blob|ArrayBuffer} RIFF formatted WAV file
 */
function wav(file) {

  // status
  this.EMPTY              = 0; //  No data has been loaded yet.
  this.LOADING            = 1; // Data is currently being loaded.
  this.DONE               = 2; // The entire read request has been completed.
  this.UNSUPPORTED_FORMAT = 3; // Error state - file format not recognized
  this.readyState         = this.EMPTY;
  this.error              = undefined;
  
  // original File and loaded ArrayBuffer
  this.file          = file instanceof Blob ? file : undefined;
  this.buffer        = file instanceof ArrayBuffer ? file : undefined;;
  
  // format
  this.chunkID       = undefined; // must be RIFF
  this.chunkSize     = undefined; // size of file after this field
  this.format        = undefined; // must be WAVE
  this.compression   = undefined; // 1=PCM
  this.numChannels   = undefined; // Mono = 1, Stereo = 2
  this.sampleRate    = undefined; // 8000, 44100, etc.
  this.byteRate      = undefined; // bytes per second
  this.blockAlign    = undefined; // number of bytes for one sample including all channels.
  this.bitsPerSample = undefined; // 8 bits = 8, 16 bits = 16, etc.
  
  // data chunk
  this.dataOffset    = -1; // index of data block
  this.dataLength    = -1; // size of data block
  
  // let's take a peek
  this.peek();
}

/**
 * Load header as an ArrayBuffer and parse format chunks
 */
wav.prototype.peek = function () {
  
  this.readyState = this.LOADING;

  // see if buffer is already loaded
  if (this.buffer !== undefined) {
    return this.parseArrayBuffer();
  }
  
  var reader = new FileReader();
  var that = this;
  
  // only load the first 44 bytes of the header
  var headerBlob = this.sliceFile(0, 44);
  reader.readAsArrayBuffer(headerBlob);
  
  reader.onloadend = function() {  
    that.buffer = this.result;
    that.parseArrayBuffer.apply(that);
  };
};

wav.prototype.parseArrayBuffer = function () {
  try {
    this.parseHeader();
    this.parseData();
    this.readyState = this.DONE;
  }
  catch (e) {
    this.readyState = this.UNSUPPORTED_FORMAT;
    this.error      = e;
  } 
     
  // trigger onloadend callback if exists
  if (this.onloadend) {
    this.onloadend.apply(this);
  }
};
  
/**
 * Walk through RIFF and WAVE format chunk
 * Based on https://ccrma.stanford.edu/courses/422/projects/WaveFormat/
 * and http://www.sonicspot.com/guide/wavefiles.html
 */
wav.prototype.parseHeader = function () {
   
  this.chunkID       = this.readText(0, 4);
  this.chunkSize     = this.readDecimal(4, 4);
  if (this.chunkID !== 'RIFF') throw 'NOT_SUPPORTED_FORMAT';
    
  this.format        = this.readText(8, 4);
  if (this.format !== 'WAVE') throw 'NOT_SUPPORTED_FORMAT';
  
  this.compression   = this.readDecimal(20, 2); 
  this.numChannels   = this.readDecimal(22, 2); 
  this.sampleRate    = this.readDecimal(24, 4); 

  // == SampleRate * NumChannels * BitsPerSample/8
  this.byteRate      = this.readDecimal(28, 4); 
  
  // == NumChannels * BitsPerSample/8
  this.blockAlign    = this.readDecimal(32, 2); 

  this.bitsPerSample = this.readDecimal(34, 2);
};

/**
 * Walk through all subchunks and look for the Data chunk
 */
wav.prototype.parseData = function () {

  var chunkType = this.readText(36, 4);
  var chunkSize = this.readDecimal(40, 4);
  
  // only support files where data chunk is first (canonical format)
  if (chunkType === 'data') {
    this.dataLength = chunkSize;
    this.dataOffset = 44;
  }
  else {
    // duration cant be calculated && slice will not work
    throw 'NOT_CANONICAL_FORMAT: unsupported "' + chunkType + '"" chunk - was expecting data';
  }
};



/**
 * Returns slice of file as new wav file
 * @param {int} start  Start offset in seconds from beginning of file
 * @param {int} end    Length of requested slice in seconds
 */
wav.prototype.slice = function (start, length, callback) {
  
  var reader = new FileReader();
  var that = this;
  
  // use the byterate to calculate number of bytes per second
  var start = this.dataOffset + (start * this.byteRate);
  var end = start + (length * this.byteRate);
  
  var headerBlob = this.sliceFile(0, 44);
  var dataBlob = this.sliceFile(start, end);
  
  // concant header and data slice
  var BlobBuilder = BlobBuilder || WebKitBlobBuilder;
  var bb = new BlobBuilder();
  bb.append(headerBlob);
  bb.append(dataBlob);
  
  reader.readAsArrayBuffer(bb.getBlob()); 
  reader.onloadend = function() {  
    
    // update chunkSize in header
    var chunkSize = new Uint8Array(this.result, 4, 4);
    that.tolittleEndianDecBytes(chunkSize, 36+dataBlob.size);

    // update dataChunkSize in header
    var dataChunkSize = new Uint8Array(this.result, 40, 4);
    that.tolittleEndianDecBytes(dataChunkSize, dataBlob.size);

    if (callback) callback.apply(that, [this.result]);
  };
};

/*
 * do we need direct access to  samples?
 *
wav.prototype.getSamples = function () {

  // TODO load data chunk into buffer
  if (this.bitsPerSample === 8)
    this.dataSamples = new Uint8Array(this.buffer, 44, chunkSize/this.blockAlign);
  else if (this.bitsPerSample === 16)
    this.dataSamples = new Int16Array(this.buffer, 44, chunkSize/this.blockAlign);
}
*/

/**
 * Reads slice from buffer as String
 */
wav.prototype.readText = function (start, length) {
  var a = new Uint8Array(this.buffer, start, length);
  var str = '';
  for(var i = 0; i < a.length; i++) {
    str += String.fromCharCode(a[i]);
  }
  return str;
};

/**
 * Reads slice from buffer as Decimal
 */
wav.prototype.readDecimal = function (start, length) {
  var a = new Uint8Array(this.buffer, start, length);
  return this.fromLittleEndianDecBytes(a);
};

/**
 * Calculates decimal value from Little-endian decimal byte array
 */
wav.prototype.fromLittleEndianDecBytes = function (a) {
  var sum = 0;
  for(var i = 0; i < a.length; i++) {
    sum += a[i]*Math.pow(256, i);
  }
  return sum;
};

/**
 * Populate Little-endian decimal byte array from decimal value
 */
wav.prototype.tolittleEndianDecBytes = function (a, decimalVal) {
  var rem = decimalVal;
  for(var i = a.length-1; i >= 0; i--) {
    //XXX this smells - bitshift ninjas wanted
    var mult = Math.pow(256, i);
    var val = Math.floor(rem /mult)
    rem = rem - (val*mult);
    a[i] = val;
  }
  return a;
};


/**
 * Slice the File using either standard slice or webkitSlice
 */
wav.prototype.sliceFile = function (start, end) {
  if (this.file.slice) return this.file.slice(start, end); 
  if (this.file.webkitSlice) return this.file.webkitSlice(start, end);
};


wav.prototype.isCompressed = function () {
  return this.compression !== 1;  
};
  
wav.prototype.isMono = function () {
  return this.numChannels === 1;  
};
  
wav.prototype.isStereo = function () {
  return this.numChannels === 2;
};

wav.prototype.getDuration = function () {
  return this.dataLength > -1 ? (this.dataLength / this.byteRate) : -1;
};


/**
 * Override toString
 */
wav.prototype.toString = function () {
  return (this.file ? this.file.name : 'noname.wav') + ' (' + this.chunkID + '/' + this.format + ')\n' +
    'Compression: ' + (this.isCompressed() ? 'yes' : 'no (PCM)') + '\n' +
    'Number of channels: ' + this.numChannels + ' (' + (this.isStereo()?'stereo':'mono') + ')\n' +
    'Sample rate: ' + this.sampleRate + ' Hz\n'+
    'Sample size: ' + this.bitsPerSample + '-bit\n'+
    'Duration: ' + Math.round(this.getDuration()) + ' seconds';
};

