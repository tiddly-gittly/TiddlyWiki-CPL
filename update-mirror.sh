#!/bin/sh
# check /mirror-cache exists or not
# if not exist, create it
if [ ! -d /mirror-cache ]; then
    mkdir /mirror-cache
fi

# check /mirror-cache/mirror exists or not
# if not exist, pull mirror from remote
# if exist, pull mirror from remote
if [ ! -d /mirror-cache/mirror ]; then
    git clone https://ghproxy.com/https://github.com/tiddly-gittly/TiddlyWiki-CPL.git --depth 1 --branch cache /mirror-cache/mirror
else
    cd /mirror-cache/mirror
    git pull
fi
