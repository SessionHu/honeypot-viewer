#!/bin/sh
set -xe
apt update
apt install -y --no-install-recommends gcc ldc llvm-dev
ldc2 -O3 -release -flto=full cgi-src/status.d -of=cgi-bin/status
strip cgi-bin/status
rm cgi-bin/status.o
setcap cap_sys_ptrace,cap_dac_read_search=ep cgi-bin/status
