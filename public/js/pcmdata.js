this.PCMData = (function(Binary, Stream){

function PCMData(data){
	return (typeof data === 'string' ? PCMData.decode : PCMData.encode)(data);
}

PCMData.decode	= function(data){
	var	stream			= new Stream(data),
		sGroupID1		= stream.read(4),
		dwFileLength		= stream.readUint32();
		stream			= new Stream(stream.read(dwFileLength));
	var	sRiffType		= stream.read(4),
		sGroupID2		= stream.read(4),
		dwChunkSize1		= stream.readUint32(),
		formatChunk		= new Stream(stream.read(dwChunkSize1)),
		wFormatTag		= formatChunk.readUint16(),
		wChannels		= formatChunk.readUint16(),
		dwSamplesPerSec		= formatChunk.readUint32(),
		dwAvgBytesPerSec	= formatChunk.readUint32(),
		wBlockAlign		= formatChunk.readUint16(),
		sampleSize		= wBlockAlign / wChannels,
		dwBitsPerSample		= dwChunkSize1 === 16 ? formatChunk.readUint16() : formatChunk.readUint32(),
		sGroupID,
		dwChunkSize,
		sampleCount,
		chunkData,
		waveStream,
		samples,
		dataTypeList,
		i,
		chunks = {};
	while(stream.data){
		sGroupID		= stream.read(4);
		dwChunkSize		= stream.readUint32();
		chunkData		= stream.read(dwChunkSize);
		dataTypeList		= chunks[sGroupID] = chunks[sGroupID] || [];
		if (sGroupID === 'data'){
			sampleCount		= ~~(dwChunkSize / sampleSize);
			waveStream		= new Stream(chunkData);
			samples			= new (typeof Float32Array !== 'undefined' ? Float32Array : Array)(sampleCount);
			waveStream.readBuffer(samples, sampleSize * 8, 'Float');
		} else {
			dataTypeList.push(chunkData);
		}
	}
	return {
		channelCount:	wChannels,
		bytesPerSample:	wBlockAlign / wChannels,
		sampleRate:	dwAvgBytesPerSec / wBlockAlign,
		chunks:		chunks,
		data:		samples
	};
}

PCMData.encode	= function(data){
	var	
		dWord		= Binary.fromUint32,
		sWord		= Binary.fromUint16,
		samples		= data.data,
		sampleRate	= data.sampleRate,
		channelCount	= data.channelCount || 1,
		bytesPerSample	= data.bytesPerSample || 1,
		bitsPerSample	= bytesPerSample * 8,
		blockAlign	= channelCount * bytesPerSample,
		byteRate	= sampleRate * blockAlign,
		length		= samples.length,
		dLength		= length * bytesPerSample,
		padding		= Math.pow(2, bitsPerSample - 1) - 1,
		properWriter	= Binary['fromFloat' + bitsPerSample],
		chunks		= [],
		chunk		= '',
		chunkType,
		i, n, chunkData;

		
		chunks.push(
			'fmt '				+	// sGroupID		4 bytes		char[4]
			dWord(16)			+	// dwChunkSize		4 bytes		uint32 / dword
			sWord(1)			+	// wFormatTag		2 bytes		uint16 / ushort
			sWord(channelCount)		+	// wChannels		2 bytes		uint16 / ushort
			dWord(sampleRate)		+	// dwSamplesPerSec	4 bytes		uint32 / dword
			dWord(byteRate)			+	// dwAvgBytesPerSec	4 bytes		uint32 / dword
			sWord(blockAlign)		+	// wBlockAlign		2 bytes		uint16 / ushort
			sWord(bitsPerSample)			// dwBitsPerSample	2 or 4 bytes	uint32 / dword OR uint16 / ushort
		);

		for (i=0; i<length; i++){
			chunk += properWriter(samples[i]);
		}
		chunks.push(
			'data'				+	// sGroupID		4 bytes		char[4]
			dWord(dLength)			+	// dwChunkSize		4 bytes		uint32 / dword
			chunk
		);
		chunkData = data.chunks;
		if (chunkData){
			for (i in chunkData){
				if (chunkData.hasOwnProperty(i)){
					chunkType = chunkData[i];
					for (n=0; n<chunkType.length; n++){
						chunk = chunkType[n];
						chunks.push(i + dWord(chunk.length) + chunk);
					}
				}
			}
		}
		chunks = chunks.join('');
		return	'RIFF'			+	// sGroupId		4 bytes		char[4]
			dWord(chunks.length)	+	// dwFileLength		4 bytes		uint32 / dword
			'WAVE'			+	// sRiffType		4 bytes		char[4]
			chunks;
}

return PCMData;

}(Binary, Stream));
