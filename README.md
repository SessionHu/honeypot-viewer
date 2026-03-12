# Honeypot Viewer

- A simple viewer based on Leaflet.js for custom honeypot 🍯

## Requirement

- Backend
  - Runtime: GNU/Linux Distrubtion (eg. Debian), libcurl, HTTP CGI Server (eg. Nginx + FastCGI)
  - Development: D Compiler (LDC or DMD, not support GDC), C Compiler (e.g. GCC), Libcap
- Frontend
  - Runtime: Modern WWW Browser (e.g. Firefox)
  - Development: Node.js, NPM
- Datasource
  - Custom honeypot: each connection binded to a process with argv0 `pv`

## Build

### Backend

#### Custom

```shell
sed -iE 's/apt\s.+//g' build-cgi.sh
./build-cgi.sh
```

#### Podman

The backend is designed for "cross build" in Podman originally. You can run the following script.

```shell
podman run --rm -it \
--platform linux/amd64 \
-v $(pwd):/src:Z \
-w /src \
debian:stable-slim /bin/bash
```

Then in the container. This will automatically install all dependencies and generate binaries.

```shell
./build-cgi.sh
```

The `setcap` command should be run on the production machine. That line of script is just an example.

### Frontend

Usually no more actions are required.

```shell
nvm use
npm run build:web
```

### Package

This is just a quick wrapper for `tar`. You may copy the output by yourself.

```shell
npm run package
```

## Install

You may need to rerun `setcap` for the binaries in `cgi-bin` on production machine.

Example configuration file for Nginx.

```nginx
server {
  listen 80;
  listen [::]:80;
  listen 8443 ssl;
  listen [::]:8443 ssl;
  ssl_certificate /etc/nginx/cert.pem;
  ssl_certificate_key /etc/nginx/cert.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  root /path/to/dir/public;
  index index.html;
  server_name honeypot-viewer.sess.dn42;
  location / {
    try_files $uri $uri/ =404;
    error_page 404 /404.html;
    add_header Cache-Control "public, max-age=120, no-transform";
  }
  location = /cgi-bin/status {
    root /path/to/dir/;
    fastcgi_pass unix:/run/fcgiwrap.socket;
    include fastcgi_params;
    fastcgi_intercept_errors on;
    add_header Cache-Control "max-age=120, no-transform";
  }
}
```

## Contributing

Licensed under GNU GPL v3. PR welcome~
