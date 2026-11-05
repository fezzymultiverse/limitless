#!/usr/bin/env bash
# The icons now come from www/img/leaf.png (the real logo). See build_icons.py.
exec python3 "$(dirname "${BASH_SOURCE[0]}")/build_icons.py"
