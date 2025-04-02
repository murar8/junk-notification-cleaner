#!/bin/bash

set -e          # Exit on error
set -u          # Exit on undefined variable
set -o pipefail # Exit on pipe error

declare -i no_exit=0
trap stop_docker_container EXIT
function stop_docker_container() {
    if [ "$no_exit" -eq 1 ]; then
        echo
        echo "Joining x11docker container..."
        echo
        wait
    else
        echo
        echo "Stopping docker container..."
        docker stop gnome >/dev/null 2>&1 || true
    fi
}

echo "Starting test..."

args=(--desktop --init=systemd --name=gnome --gpu --no-auth)
log_file=/dev/stdout
while [[ $# -gt 0 ]]; do
    case $1 in
    --xvfb)
        echo "Using xvfb in headless mode"
        args+=("--xvfb")
        args+=("--xc=no")
        args+=("--size=1920x1080")
        shift
        ;;
    --log-file)
        echo "Redirecting x11docker logs to $2"
        log_file="$2"
        shift
        shift
        ;;
    --no-exit)
        echo "Joining x11docker container after test"
        no_exit=1
        shift
        ;;
    -h | --help)
        echo "Usage: $0 [options]"
        echo "Options:"
        echo "  --xvfb            Run in headless mode"
        echo "  --log-file <file> Output x11docker logs to <file>"
        echo "  --no-exit         Join x11docker container after test"
        echo "  --help            Show this help message"
        trap - EXIT
        exit 0
        ;;
    *)
        echo "Unknown option $1"
        exit 1
        ;;
    esac
done

echo
echo "Building docker image..."

docker_build_args=(-t x11docker/gnome)
if [ -n "${GITHUB_SHA:-}" ]; then
    echo "Using github actions cache"
    docker_build_args+=("--cache-from=type=gha" "--cache-to=type=gha,mode=max")
fi

echo
docker build "${docker_build_args[@]}" .

echo
echo "Running docker container..."
x11docker "${args[@]}" x11docker/gnome >"$log_file" 2>&1 &

echo
echo "Waiting for docker container to start..."
until docker inspect -f "{{.State.Running}}" gnome 2>/dev/null | grep -q "true"; do
    # if container exists
    if [ "$(docker inspect -f "{{.State.Running}}" gnome 2>/dev/null)" = "false" ]; then
        echo "Container exited unexpectedly"
        echo "Dumping logs:"
        cat "$log_file"
        exit 1
    else
        sleep 0.1
    fi
done

echo "Waiting for gnome-shell to start..."
until docker exec -u "$USER" gnome pgrep -u "$USER" gnome-shell 2>/dev/null | grep -q "1"; do
    sleep 0.1
done

echo
dbus_address="$(docker exec -u "$USER" gnome bash -c 'grep -z DBUS_SESSION_BUS_ADDRESS /proc/$(pgrep -u $USER gnome-shell)/environ | cut -d= -f2- | tr -d "\0"')"
if [ -n "$dbus_address" ]; then
    echo "Dbus address: $dbus_address"
else
    echo "Failed to get dbus address"
    exit 1
fi

display=$(docker exec -u "$USER" gnome bash -c 'echo $DISPLAY')
if [ -n "$display" ]; then
    echo "Display: $display"
else
    echo "Failed to get display"
    exit 1
fi

echo
echo "Starting test..."
docker exec -u "$USER" -e DBUS_SESSION_BUS_ADDRESS="$dbus_address" -e DISPLAY="$display" -w /app gnome npx vitest run

echo
echo "Test completed 🚀 "
