/**
 * Warning: canvas must not have been used for 2d drawing prior!
 *
 * @todo allow for cropping the picture area
 * @todo allow for stride not being actual width
 *
 * @todo make it not horribly slow on IE 11
 *
 * @param HTMLCanvasElement canvas
 * @constructor
 */
function YCbCrFrameSink(canvas) {
	var self = this,
		gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
		convertTextures = true;
	
	if (gl == null) {
		throw new Error('WebGL unavailable; falling back to 2d canvas');
	}
	console.log('Using WebGL canvas for video drawing');

	// GL!
	function checkError() {
		err = gl.getError();
		if (err != 0) {
			throw new Error("GL error " + err);
		}
	}
	
	function compileShader(type, source) {
		var shader = gl.createShader(type);
		console.log(shader);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			var err = gl.getShaderInfoLog(shader);
			gl.deleteShader(shader);
			throw new Error('GL shader compilation for ' + type + ' failed: ' + err);
		}
	
		return shader;
	}


	var vertexShader,
		fragmentShader,
		program,
		buffer,
		err;
	
	// In the world of GL there are no rectangles.
	// There are only triangles.
	// THERE IS NO SPOON.
	var rectangle = new Float32Array([
		// First triangle (top left, clockwise)
		-1.0, -1.0,
		+1.0, -1.0,
		-1.0, +1.0,

		// Second triangle (bottom right, clockwise)
		-1.0, +1.0,
		+1.0, -1.0,
		+1.0, +1.0
	]);

	var textureRectangle = new Float32Array([
		0, 0,
		1, 0,
		0, 1,
		0, 1,
		1, 0,
		1, 1
	]);

	function init() {
		vertexShader = compileShader(gl.VERTEX_SHADER,
			'attribute vec2 aPosition;\n' +
			'attribute vec2 aTexturePosition;\n' +
			'varying vec2 vTexturePosition;\n' +
			'void main() {\n' +
			'    gl_Position = vec4(aPosition, 0, 1);\n' +
			'    vTexturePosition = aTexturePosition;\n' +
			'}'
		);
		if (convertTextures) {
			fragmentShader = compileShader(gl.FRAGMENT_SHADER,
				'precision mediump float;\n' +
				'uniform sampler2D uTextureYCbCr;\n' +
				'varying vec2 vTexturePosition;\n' +
				'void main() {\n' +
				'   vec3 YUV1 = vec3(texture2D(uTextureYCbCr, vTexturePosition));\n' +
				'   vec3 YUV = vec3(YUV1.x * 1.1643828125, YUV1.y, YUV1.z);\n' +
				'   gl_FragColor = vec4(\n' +
				'     YUV.x + 1.59602734375 * YUV.z - 0.87078515625,\n' +
				'     YUV.x - 0.39176171875 * YUV.y - 0.81296875 * YUV.z + 0.52959375,\n' +
				'     YUV.x + 2.017234375   * YUV.y - 1.081390625,\n' +
				'     1\n' +
				'   );\n' +
				'}'
			);
		} else {
			// inspired by https://github.com/mbebenita/Broadway/blob/master/Player/canvas.js
			fragmentShader = compileShader(gl.FRAGMENT_SHADER,
				'precision mediump float;\n' +
				'uniform sampler2D uTextureY;\n' +
				'uniform sampler2D uTextureCb;\n' +
				'uniform sampler2D uTextureCr;\n' +
				'varying vec2 vTexturePosition;\n' +
				'void main() {\n' +
				'   vec3 YUV = vec3(\n' +
				'     texture2D(uTextureY,  vTexturePosition).x * 1.1643828125,\n' +
				'     texture2D(uTextureCb, vTexturePosition).x,\n' +
				'     texture2D(uTextureCr, vTexturePosition).x\n' +
				'   );\n' +
				'   gl_FragColor = vec4(\n' +
				'     YUV.x + 1.59602734375 * YUV.z - 0.87078515625,\n' +
				'     YUV.x - 0.39176171875 * YUV.y - 0.81296875 * YUV.z + 0.52959375,\n' +
				'     YUV.x + 2.017234375   * YUV.y - 1.081390625,\n' +
				'     1\n' +
				'   );\n' +
				'}'
			);
		}
	
		program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		checkError();

		gl.attachShader(program, fragmentShader);
		checkError();

		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			var err = gl.getProgramInfoLog(program);
			gl.deleteProgram(program);
			throw new Error('GL program linking failed: ' + err);
		}

		gl.useProgram(program);
		checkError();
		
	}

	// Expand luminance textures to RGBA
	// Unfortunately this is about as expensive as YCbCr in the first place?
	var bytesOut;
	function convertBytes(buffer) {
		if (!bytesOut) {
			bytesOut = new Uint8Array(buffer.width * buffer.height * 3);
		}
		
		var width = buffer.width,
			height = buffer.height,
			strideY = buffer.strideY,
			strideCb = buffer.strideCb,
			strideCr = buffer.strideCr,
			bytesY = buffer.bytesY,
			bytesCb = buffer.bytesCb,
			bytesCr = buffer.bytesCr,
			hdec = buffer.hdec,
			vdec = buffer.vdec,
			out = bytesOut,
			outPtr = 0;
		for (var y = 0; y < height; y++) {
			var ydec = y >> vdec,
				YPtr = y * strideY,
				CbPtr = ydec * strideCb,
				CrPtr = ydec * strideCr;
			for (var x = 0; x < width; x++) {
				var xdec = x >> hdec;
				out[outPtr++] = bytesY[YPtr + x];
				out[outPtr++] = bytesCb[CbPtr + xdec];
				out[outPtr++] = bytesCr[CrPtr + xdec];
			}
		}

		return out;
	}
	
	var textures = {};
	self.drawFrame = function(yCbCrBuffer) {
		if (!program) {
			console.log('initializing gl program');
			init();
		}

		// Set up the rectangle and draw it

		//
		// Set up geometry
		//
		
		buffer = gl.createBuffer();
		checkError();

		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		checkError();

		gl.bufferData(gl.ARRAY_BUFFER, rectangle, gl.STATIC_DRAW);
		checkError();

		var positionLocation = gl.getAttribLocation(program, 'aPosition');
		checkError();

		gl.enableVertexAttribArray(positionLocation);
		checkError();

		gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
		checkError();





		// Set up the texture geometry...

		var texturePositionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, texturePositionBuffer);
		checkError();
		
		gl.bufferData(gl.ARRAY_BUFFER, textureRectangle, gl.STATIC_DRAW);
		checkError();
		
		var texturePositionLocation = gl.getAttribLocation(program, 'aTexturePosition');
		checkError();
		
		gl.enableVertexAttribArray(texturePositionLocation);
		checkError();
		
		gl.vertexAttribPointer(texturePositionLocation, 2, gl.FLOAT, false, 0, 0);
		checkError();
		
		// Create the textures..
		
		// Y plane
		function attachTexture(name, register, index, format, width, height, data) {
			var texture;
			if (textures[name]) {
				// Reuse & update the existing texture
				texture = textures[name];
			} else {
				textures[name] = texture = gl.createTexture();
			}
			checkError();
			gl.activeTexture(register);
			checkError();
			gl.bindTexture(gl.TEXTURE_2D, texture);
			checkError();
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
			checkError();
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			checkError();
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			checkError();
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			checkError();
			
			gl.texImage2D(
				gl.TEXTURE_2D,
				0, // mip level
				format, // internal format
				width, height,
				0, // border
				format, // format
				gl.UNSIGNED_BYTE, //type
				data // data!
			);
			checkError();
		
			gl.uniform1i(gl.getUniformLocation(program, name), index);
			checkError();
			
			return texture;
		}
		
		if (convertTextures) {
			// IE 11 doesn't support luminance-only textures
			// Rewrite the three plans into one "RGB" that's really YCbCr
			var textureYCbCr = attachTexture(
				'uTextureYCbCr',
				gl.TEXTURE0,
				0,
				gl.RGB,
				yCbCrBuffer.width,
				yCbCrBuffer.height,
				convertBytes(yCbCrBuffer)
			);
		} else {
			var textureY = attachTexture(
				'uTextureY',
				gl.TEXTURE0,
				0,
				gl.LUMINANCE,
				yCbCrBuffer.strideY,
				yCbCrBuffer.height,
				yCbCrBuffer.bytesY
			);
			var textureCb = attachTexture(
				'uTextureCb',
				gl.TEXTURE1,
				1,
				gl.LUMINANCE,
				yCbCrBuffer.strideCb,
				yCbCrBuffer.height >> yCbCrBuffer.vdec,
				yCbCrBuffer.bytesCb
			);
			var textureCr = attachTexture(
				'uTextureCr',
				gl.TEXTURE2,
				2,
				gl.LUMINANCE,
				yCbCrBuffer.strideCr,
				yCbCrBuffer.height >> yCbCrBuffer.vdec,
				yCbCrBuffer.bytesCr
			);
		}

		// Aaaaand draw stuff.
		gl.drawArrays(gl.TRIANGLES, 0, rectangle.length / 2);
		checkError();
	};

	return self;
}

