#!/bin/bash

while :
do
    rsync -a --exclude=node_modules/ --exclude=.env . root@analytics.pymnts.com:/home/analytics/
    sleep 15
done

