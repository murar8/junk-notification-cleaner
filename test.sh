#!/bin/bash

set -e # Exit on error
set -u # Exit on undefined variable

printf "\n\n\n Building docker image...\n\n"
docker build -t x11docker/gnome .

printf "\n\n\n Running docker container...\n\n"
x11docker --desktop --init=systemd --name=gnome --network --gpu x11docker/gnome &

printf "\n\n\n Waiting for docker container to start...\n\n"
until [ "$(docker inspect -f "{{.State.Running}}" gnome || echo false)" = "true" ]; do
    sleep 0.1
done

printf "\n\n\n Waiting for gnome-shell to start...\n\n"
until docker exec -u "$USER" gnome ps -a | grep -q 'gnome-shell'; do
    sleep 0.1
done

printf "\n\n\n Enabling junk-notification-cleaner...\n\n"
docker exec -u "$USER" gnome gnome-extensions enable junk-notification-cleaner@murar8.github.com

docker exec -u "$USER" gnome journalctl /usr/bin/gnome-shell -f -o cat | grep -q 'junk-notification-cleaner@murar8.github.com'
