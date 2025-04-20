#!/bin/bash

set -e          # Exit on error
set -u          # Exit on undefined variable
set -o pipefail # Exit on pipe error

declare -i NO_EXIT=0
trap stop_docker_container EXIT
function stop_docker_container() {
	echo
	if [ "$NO_EXIT" -eq 1 ]; then
		echo "Joining x11docker container..."
		echo
		wait
	else
		echo -n "Stopping docker container..."
		docker stop gnome >/dev/null 2>&1 || true
		echo " ✓"
	fi
}

X11DOCKER_ARGS=(--desktop --init=systemd --name=gnome --printenv --xauth=no)
LOG_DESTINATION=/dev/stderr
while [[ $# -gt 0 ]]; do
	case $1 in
	--log-file)
		echo "Redirecting x11docker logs to $2"
		LOG_DESTINATION="$2"
		shift
		shift
		;;
	--no-exit)
		echo "Joining x11docker container after test"
		NO_EXIT=1
		shift
		;;
	-h | --help)
		echo "Usage: $0 [options] [-- x11docker_options]"
		echo "Options:"
		echo "  --log-file <file> Output x11docker logs to <file>"
		echo "  --no-exit         Join x11docker container after test"
		echo "  --help            Show this help message"
		echo "  --                Pass remaining arguments to x11docker"
		trap - EXIT
		exit 0
		;;
	--)
		shift
		X11DOCKER_ARGS+=("$@")
		break
		;;
	*)
		echo "Unknown option $1"
		exit 1
		;;
	esac
done

DOCKER_BUILD_ARGS=(-t x11docker/gnome)
if [ -n "${GITHUB_SHA:-}" ]; then
	echo "Using github actions cache 💾"
	DOCKER_BUILD_ARGS+=("--cache-from=type=gha" "--cache-to=type=gha,mode=max")
fi

echo "Building docker image..."
echo
docker build "${DOCKER_BUILD_ARGS[@]}" .
echo

echo "Running docker container..."
echo "x11docker args:" "${X11DOCKER_ARGS[@]}"
echo "Log destination:" "$LOG_DESTINATION"
read -r xenv < <(x11docker "${X11DOCKER_ARGS[@]}" x11docker/gnome 2>"$LOG_DESTINATION")

dbus_address=""
while [ -z "$dbus_address" ]; do
	dbus_address="$(docker exec -u "$USER" gnome bash -c 'grep -z DBUS_SESSION_BUS_ADDRESS /proc/$(pgrep -u $USER gnome-shell)/environ 2>/dev/null | cut -d= -f2- | tr -d "\0"')"
	if [ -z "$dbus_address" ]; then
		echo "Waiting for DBUS_SESSION_BUS_ADDRESS..."
		sleep 1
	fi
done

echo "DBUS_SESSION_BUS_ADDRESS found"
xenv="$xenv DBUS_SESSION_BUS_ADDRESS=$dbus_address"
echo

echo "Starting test..."
echo "User:" "$USER"
echo "Environment variables:" "$xenv"
echo

read -ra ENV_VARS <<<"$xenv"
# shellcheck disable=SC2046
# Must expand to multiple arguments.
docker exec -u "$USER" -w /app $(printf -- "-e %s " "${ENV_VARS[@]}") gnome npx vitest run
echo
echo "Test completed 🚀 "
