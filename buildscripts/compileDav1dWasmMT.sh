#!/bin/bash

dir=`pwd`

# set up the build directory
mkdir -p build
cd build

mkdir -p wasm-mt
cd wasm-mt

mkdir -p root
mkdir -p dav1d
cd dav1d

# finally, run configuration script
CFLAGS="-O3 -s USE_PTHREADS=1" meson ../../../dav1d \
  --cross-file=../../../buildscripts/dav1d-emscripten-cross.txt \
  --prefix="$dir/build/wasm-mt/root" \
  -Dbuild_asm=false \
  -Dbuild_tests=false \
  -Dbitdepths='["8"]' \
  -Ddefault_library=static && \
ninja && \
mkdir -p "$dir/build/wasm-mt/root/lib" && \
cp -p src/libdav1d.a "$dir/build/wasm-mt/root/lib/libdav1d.a" && \
mkdir -p "$dir/build/wasm-mt/root/include/dav1d" && \
cp -p ../../../dav1d/include/dav1d/* "$dir/build/wasm-mt/root/include/dav1d/" && \
cd .. && \
cd .. && \
cd ..