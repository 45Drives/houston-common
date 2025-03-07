#!/usr/bin/env bash
# bootstrap.sh

set -e
set -o pipefail
set -x

jq 'del(.packageManager)' ./package.json > ./package.json.tmp
mv ./package.json.tmp ./package.json

rm .yarnrc.yml .yarn -rf

yarn set version stable

yarn config set nodeLinker node-modules
