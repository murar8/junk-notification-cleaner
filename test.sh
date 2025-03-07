#!/bin/bash

set -e          # Exit on error
set -u          # Exit on undefined variable
set -o pipefail # Exit on pipe error

function wait_for_dbus() {
    until docker exec -u "$USER" gnome bash -c 'pgrep -u $USER gnome-shell' 2>/dev/null; do sleep 0.1; done
}

function get_dbus_session_bus_address() {
    docker exec -u "$USER" gnome bash -c 'grep -z DBUS_SESSION_BUS_ADDRESS /proc/$(pgrep -u $USER gnome-shell)/environ | cut -d= -f2- | tr -d "\0"'
}

function exec_in_container() {
    docker exec -u "$USER" -e DBUS_SESSION_BUS_ADDRESS="$(get_dbus_session_bus_address)" gnome "$@"
}

printf "\n\n Building docker image...\n\n"
docker build -t x11docker/gnome .

printf "\n\n Running docker container...\n\n"
x11docker --desktop --init=systemd --name=gnome --network --gpu x11docker/gnome &

printf "\n\n Waiting for docker container to start...\n\n"
until [ "$(docker inspect -f "{{.State.Running}}" gnome 2>&1 >/dev/null && echo true || echo false)" = "true" ]; do sleep 0.1; done

printf "\n\n Waiting for gnome-shell to start...\n\n"
wait_for_dbus

printf "\n\n Enabling gnome-extensions...\n\n"
exec_in_container gnome-extensions enable junk-notification-cleaner@murar8.github.com

printf "\n\n Attaching to gnome-shell logs...\n\n"
exec_in_container bash -c 'journalctl /usr/bin/gnome-shell -f -o cat | grep -q "junk-notification-cleaner@murar8.github.com"'

printf "\n\n Waiting for gnome-shell to finish...\n\n"
wait
