FROM ubuntu:24.04

RUN export DEBIAN_FRONTEND=noninteractive && \
  apt-get update && \
  apt-get install -y --no-install-recommends \
  gnome-shell \
  gnome-shell-extension-manager \
  gnome-icon-theme \
  gnome-terminal \
  xdotool \
  libnotify-bin \
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
  nodejs \
  npm \
  x11-xserver-utils && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN echo "$LANG UTF-8" >> /etc/locale.gen && \
  locale-gen $LANG && \
  update-locale LANG=$LANG

RUN mkdir -p /app && chown -R ubuntu:ubuntu /app
RUN mkdir -p /home/ubuntu/.local/share/gnome-shell/extensions/ && chown -R ubuntu:ubuntu /home/ubuntu/.local/share/gnome-shell/extensions/

WORKDIR /app

USER ubuntu

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/home/ubuntu/.npm,uid=1000,gid=1000,mode=0755 npm ci

COPY *.ts ./
COPY *.json ./
RUN npm run build

COPY schemas /app/schemas
RUN gnome-extensions pack

CMD ["/usr/bin/gnome-shell"]