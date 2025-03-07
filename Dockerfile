FROM node:lts-alpine AS builder

USER node
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000,mode=0755 npm ci

COPY *.ts ./
COPY *.json ./
RUN npm run build


FROM ubuntu:24.04

RUN export DEBIAN_FRONTEND=noninteractive && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
  gnome-shell \
  gnome-shell-extension-manager \
  gnome-icon-theme \
  gnome-terminal \
  zenity \
  at-spi2-core \
  ca-certificates \
  curl \
  dbus \
  dbus-x11 \
  libpulse0 \
  procps \
  psutils \
  systemd \
  locales \
  x11-xserver-utils && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN echo "$LANG UTF-8" >> /etc/locale.gen && \
  locale-gen $LANG && \
  update-locale LANG=$LANG

COPY schemas /app/schemas
COPY --from=builder /app/*.js /app/metadata.json /app/
RUN cd /app && gnome-extensions pack
RUN mkdir -p /usr/share/gnome-shell/extensions/
RUN unzip /app/junk-notification-cleaner@murar8.github.com.shell-extension.zip -d /usr/share/gnome-shell/extensions/junk-notification-cleaner@murar8.github.com
RUN glib-compile-schemas /usr/share/gnome-shell/extensions/junk-notification-cleaner@murar8.github.com/schemas

CMD ["/usr/bin/gnome-shell"]