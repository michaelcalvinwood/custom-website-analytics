#!/bin/bash
rsync -a --exclude="node_modules" --exclude="package.json" . root@analytics.pymnts.com:/home/analytics

