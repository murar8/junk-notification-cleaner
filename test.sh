#!/bin/bash

set -e          # Exit on error
set -u          # Exit on undefined variable
set -o pipefail # Exit on pipe error

trap "docker stop gnome >/dev/null 2>&1 || true" EXIT

printf "\n\n Building docker image...\n\n"
docker build -t x11docker/gnome .

printf "\n\n Running docker container...\n\n"
x11docker --desktop --init=systemd --name=gnome --network=host --gpu x11docker/gnome &

printf "\n\n Waiting for docker container to start...\n\n"
until docker inspect -f "{{.State.Running}}" gnome 2>/dev/null | grep -q "true"; do sleep 0.1; done

printf "\n\n Waiting for gnome-shell to start...\n\n"
until docker exec -u "$USER" gnome bash -c 'pgrep -u $USER gnome-shell' 2>/dev/null | grep -q "1"; do sleep 0.1; done
printf "\n\n Gnome-shell started\n\n"
sleep 5

printf "\n\n Installing extension...\n\n"
docker exec -u "$USER" gnome gnome-extensions install /app/junk-notification-cleaner@murar8.github.com.shell-extension.zip

printf "\n\n Enabling extension...\n\n"
docker exec -u "$USER" gnome gnome-extensions enable junk-notification-cleaner@murar8.github.com

printf "\n\n Getting dbus address...\n\n"
dbus_address="$(docker exec -u "$USER" gnome bash -c 'grep -z DBUS_SESSION_BUS_ADDRESS /proc/$(pgrep -u $USER gnome-shell)/environ | cut -d= -f2- | tr -d "\0"')"
if [ -n "$dbus_address" ]; then
    printf "\n\n Dbus address: %s\n\n" "$dbus_address"
else
    printf "\n\n Failed to get dbus address\n\n"
    exit 1
fi

printf "\n\n Getting display number...\n\n"
display=$(docker exec -u "$USER" gnome bash -c 'echo $DISPLAY')
if [ -n "$display" ]; then
    printf "\n\n Display: %s\n\n" "$display"
else
    printf "\n\n Failed to get display\n\n"
    exit 1
fi

printf "\n\n Starting test...\n\n"
docker exec -u "$USER" -e DBUS_SESSION_BUS_ADDRESS="$dbus_address" -e DISPLAY="$display" -w /app gnome npx vitest run

printf "\n\n Stopping docker container...\n"
docker stop gnome >/dev/null 2>&1 || true
printf "\n\n Docker container stopped\n\n"
