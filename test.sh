#!/bin/bash

set -e          # Exit on error
set -u          # Exit on undefined variable
set -o pipefail # Exit on pipe error

trap stop_docker_container EXIT
function stop_docker_container() {
    printf "\n\n Stopping docker container...\n"
    docker stop gnome >/dev/null 2>&1 || true
}

printf "\n\n Building docker image...\n\n"
docker build -t x11docker/gnome .

args=(--desktop --init=systemd --name=gnome --gpu --no-auth)
log_file=/dev/stdout
while [[ $# -gt 0 ]]; do
    case $1 in
    -i | --xvfb)
        printf "\n\n Using xvfb\n"
        args+=("--xvfb")
        args+=("--xc=no")
        args+=("--size=1920x1080")
        shift
        ;;
    --log-file)
        printf "\n\n Using log file: %s\n" "$2"
        log_file="$2"
        shift
        shift
        ;;
    *)
        echo "Unknown option $1"
        exit 1
        ;;
    esac
done

printf "\n\n Running docker container...\n\n"
x11docker "${args[@]}" x11docker/gnome >"$log_file" 2>&1 &

printf "\n\n Waiting for docker container to start...\n\n"
until docker inspect -f "{{.State.Running}}" gnome 2>/dev/null | grep -q "true"; do
    sleep 0.1
done

printf "\n\n Waiting for gnome-shell to start...\n\n"
until docker exec -u "$USER" gnome pgrep -u "$USER" gnome-shell 2>/dev/null | grep -q "1"; do
    sleep 0.1
done

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

printf "\n\n Test completed 🚀 \n\n"
