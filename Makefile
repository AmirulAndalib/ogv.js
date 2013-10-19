.FAKE : all clean

all : build/ogv.js build/demo/index.html

clean:
	rm -rf build
	rm -rf demo
	test -f libogg/Makefile && (cd libogg && make distclean) || true
	rm -f libogg/configure
	test -f libvorbis/Makefile && (cd libvorbis && make distclean) || true
	rm -f libvorbis/configure
	test -f libtheora/Makefile && (cd libtheora && make distclean) || true
	rm -f libtheora/configure

build/intermediate/ogv-libs.js : src/ogv-libs.c src/ogv-libs-mixin.js compileOgg.sh compileVorbis.sh compileTheora.sh compileOgv.sh
	test -d build || mkdir build
	test -d build/intermediate || mkdir build/intermediate
	./compileOgg.sh
	./compileVorbis.sh
	./compileTheora.sh
	./compileOgv.sh

build/ogv.js : src/ogv-main.js build/intermediate/ogv-libs.js
	importer src/ogv-main.js build/ogv.js

build/demo/index.html : src/demo/index.html src/demo/demo.css src/demo/demo.js src/demo/motd.js src/demo/YCbCr-worker.js src/StreamFile.js src/AudioFeeder.js src/YCbCr.js build/ogv.js
	test -d build/demo || mkdir build/demo
	cp src/demo/index.html build/demo/index.html
	cp src/demo/demo.css build/demo/demo.css
	cp src/demo/demo.js build/demo/demo.js
	cp src/demo/motd.js build/demo/motd.js
	cp src/demo/YCbCr-worker.js build/demo/YCbCr-worker.js
	
	test -d build/demo/lib || mkdir build/demo/lib
	cp src/StreamFile.js build/demo/lib/StreamFile.js
	cp src/AudioFeeder.js build/demo/lib/AudioFeeder.js
	cp src/YCbCr.js build/demo/lib/YCbCr.js
	cp build/ogv.js build/demo/lib/ogv.js
