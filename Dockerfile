FROM ubuntu:24.04

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
  gnome-shell \
  gnome-shell-extension-manager \
  gnome-icon-theme \
  libxtst-dev \
  xterm \
  xdotool \
  dconf-cli \
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
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN echo "$LANG UTF-8" >> /etc/locale.gen \
  && locale-gen $LANG \
  && update-locale LANG=$LANG

RUN mkdir -p /app && chown -R ubuntu:ubuntu /app \
  && mkdir -p /home/ubuntu/.local/share/gnome-shell/extensions/ \
  && chown -R ubuntu:ubuntu /home/ubuntu/.local/share/gnome-shell/extensions/

WORKDIR /app

USER ubuntu

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/home/ubuntu/.npm,uid=1000,gid=1000,mode=0755 npm ci

COPY prefs.ts extension.ts ambient.d.ts tsconfig*.json ./
RUN npm run build

COPY metadata.json ./
COPY schemas /app/schemas
RUN gnome-extensions pack

USER root

# Install no-overview extension since we need to hide the overview for the tests.
RUN curl -fsSL https://github.com/fthx/no-overview/archive/refs/tags/v46.zip -o /app/no-overview.zip \
  && mkdir -p /usr/share/gnome-shell/extensions/ \
  && unzip /app/no-overview.zip -d /tmp/ \
  && mv /tmp/no-overview-46 /usr/share/gnome-shell/extensions/no-overview@fthx \
  && rm -rf /tmp/no-overview-46 \
  && rm /app/no-overview.zip

RUN mkdir -p /usr/share/gnome-shell/extensions/junk-notification-cleaner@murar8.github.com \
  && unzip -d /usr/share/gnome-shell/extensions/junk-notification-cleaner@murar8.github.com /app/junk-notification-cleaner@murar8.github.com.shell-extension.zip \
  && glib-compile-schemas /usr/share/gnome-shell/extensions/junk-notification-cleaner@murar8.github.com/schemas  

RUN mkdir -p /etc/dconf/profile \
  && echo "user-db:user" >> /etc/dconf/profile/user \
  && echo "system-db:local" >> /etc/dconf/profile/user \
  && mkdir -p /etc/dconf/db/local.d/ \
  && echo "[org/gnome/shell]\nenabled-extensions=['junk-notification-cleaner@murar8.github.com', 'no-overview@fthx']" > /etc/dconf/db/local.d/00-extensions \
  && dconf update

USER ubuntu

# Copy the test files.
COPY *.spec.ts vitest.config.ts ./

CMD ["/usr/bin/gnome-shell"]