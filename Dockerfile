FROM ubuntu:25.10

RUN mkdir -p /app && chown -R ubuntu:ubuntu /app
VOLUME /app
WORKDIR /app

RUN export DEBIAN_FRONTEND=noninteractive && \
  apt-get update && \
  apt-get install -y --no-install-recommends gnome-shell ca-certificates && \
  rm -rf /var/lib/apt/lists/*
