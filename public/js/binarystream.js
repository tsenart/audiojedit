(function(global, Math){

	var	fromCharCode	= String.fromCharCode,
		// the following two aren't really *performance optimization*, but compression optimization.
		y		= true,
		n		= false;

	function convertToBinaryLE(num, size){
		return size ? fromCharCode(num & 255) + convertToBinaryLE(num >> 8, size - 1) : '';
	}

	function convertToBinaryBE(num, size){ // I don't think this is right
		return size ? convertToBinaryBE(num >> 8, size - 1) + fromCharCode(255 - num & 255) : '';
	}

	function convertToBinary(num, size, bigEndian){
		return bigEndian ? convertToBinaryBE(num, size) : convertToBinaryLE(num, size);
	}

	function convertFromBinary(str, bigEndian){
		var	l	= str.length,
			last	= l - 1,
			n	= 0,
			pow	= Math.pow,
			i;
		if (bigEndian){
			for (i=0; i<l; i++){
				n += (255 - str.charCodeAt(i)) * pow(256, last - i);
			}
		} else {
			for (i=0; i < l; i++){
				n += str.charCodeAt(i) * pow(256, i);
			}
		}
		return n;
	}

	// The main function creates all the functions used.
	function Binary(bitCount, signed, /* false === unsigned */ isFloat, from /* false === to */){

		// This is all just for major optimization benefits.
		var	pow			= Math.pow,
			floor			= Math.floor,
			convertFromBinary	= Binary.convertFromBinary,
			convertToBinary		= Binary.convertToBinary,
			byteCount		= bitCount / 8,
			bitMask			= pow(2, bitCount),
			semiMask		= bitMask / 2,
			intMask			= semiMask - 1,
			invSemiMask		= 1 / semiMask,
			invIntMask		= 1 / intMask;

		return from ?
			isFloat ?
				signed ? function(num, bigEndian){
					num = floor(num < 0 ? num * semiMask + bitMask : num * intMask);
					return convertToBinary(
						num,
						byteCount,
						bigEndian
					);
				} : function(num, bigEndian){
					return convertToBinary(
						floor(num * intMask),
						byteCount,
						bigEndian
					);
				}
			:
				signed ? function(num, bigEndian){
					return convertToBinary(
						num < 0 ? num + bitMask : num,
						byteCount,
						bigEndian
					);
				} : function(num, bigEndian){
					return convertToBinary(
						num,
						byteCount,
						bigEndian
					);
				}
		:
			isFloat ?
				signed ? function(str, bigEndian){
					var num = convertFromBinary(str, bigEndian);
					return num > intMask ? (num - bitMask) * invSemiMask : num * invIntMask;
				} : function(str, bigEndian){
					return convertFromBinary(str, bigEndian) * invIntMask;
				}
			:
				signed ? function(str, bigEndian){
					var num = convertFromBinary(str, bigEndian);
					return num > intMask ? num - bitMask : num;
				} : function(str, bigEndian){
					return convertFromBinary(str, bigEndian);
				};
	}

	Binary.convertToBinary		= convertToBinary;
	Binary.convertFromBinary	= convertFromBinary;
	// these are deprecated because JS doesn't support 64 bit uint, so the conversion can't be performed.
/*
	Binary.fromFloat64		= Binary(64, y, y, y);
	Binary.toFloat64		= Binary(64, y, y, n);
*/
	Binary.fromFloat32		= Binary(32, y, y, y);
	Binary.toFloat32		= Binary(32, y, y, n);
	Binary.fromFloat24		= Binary(24, y, y, y);
	Binary.toFloat24		= Binary(24, y, y, n);
	Binary.fromFloat16		= Binary(16, y, y, y);
	Binary.toFloat16		= Binary(16, y, y, n);
	Binary.fromFloat8		= Binary(8, y, y, y);
	Binary.toFloat8			= Binary(8, y, y, n);
	Binary.fromInt32		= Binary(32, y, n, y);
	Binary.toInt32			= Binary(32, y, n, n);
	Binary.fromInt16		= Binary(16, y, n, y);
	Binary.toInt16			= Binary(16, y, n, n);
	Binary.fromInt8			= Binary( 8, y, n, y);
	Binary.toInt8			= Binary( 8, y, n, n);
	Binary.fromUint32		= Binary(32, n, n, y);
	Binary.toUint32			= Binary(32, n, n, n);
	Binary.fromUint16		= Binary(16, n, n, y);
	Binary.toUint16			= Binary(16, n, n, n);
	Binary.fromUint8		= Binary( 8, n, n, y);
	Binary.toUint8			= Binary( 8, n, n, n);

	global.Binary = Binary;
}(this, Math));
(function(global, Binary){

function Stream(data){
	this.data = data;
}

var	proto	= Stream.prototype = {
		read:		function(length){
			var	self	= this,
				data	= self.data.substr(0, length);
			self.skip(length);
			return data;
		},
		skip:		function(length){
			var	self	= this,
				data	= self.data	= self.data.substr(length);
			self.pointer	+= length;
			return data.length;
		},
		readBuffer:	function(buffer, bitCount, type){
			var	self		= this,
				converter	= 'read' + type + bitCount,
				byteCount	= bitCount / 8,
				l		= buffer.length,
				i		= 0;
			while (self.data && i < l){
				buffer[i++] = self[converter]();
			}
			return i;
		}
	},
	i, match;

function newType(type, bitCount, fn){
	var	l	= bitCount / 8;
	proto['read' + type + bitCount] = function(bigEndian){
		return fn(this.read(l), bigEndian);
	};
}

for (i in Binary){
	match	= /to([a-z]+)([0-9]+)/i.exec(i);
	match && newType(match[1], match[2], Binary[i]);
}

global.Stream	= Stream;
Stream.newType	= newType;

}(this, this.Binary));
