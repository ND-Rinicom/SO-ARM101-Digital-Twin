# Setup

### 1. Create Virtual Environment (Recommended)
On the Leader PC, create and activate venv as normal:
```bash
python3 -m venv ./lerobot-venv
source ./lerobot-venv/bin/activate
```

On the **Follower Pi**, add `--system-site-packages`:
```bash
python3 -m venv --system-site-packages ./lerobot-venv
source ./lerobot-venv/bin/activate
```

The follower serves its camera over RTSP using GStreamer's Python bindings (`gi`/`GstRtspServer`, installed via `apt` in step 2) — a venv created without `--system-site-packages` is isolated from system Python packages and won't be able to `import gi` at all, since PyGObject isn't something you can meaningfully `pip install` in isolation (it's a thin binding over system C libraries that have to match the GStreamer version actually installed on the machine).

If you already created the Follower Pi's venv without this flag, you don't need to delete and start over — re-running `venv` in place (no `--clear`) just flips the flag and keeps everything already `pip install`ed:
```bash
python3 -m venv --system-site-packages ~/lerobot-venv
```

### 2. Install Dependencies

#### Both PC & Pi (with venv activated)
```bash
pip install paho-mqtt pyserial numpy feetech-servo-sdk
```

#### Pi (Follower PC) dependencies

The follower serves its camera directly over RTSP (`scripts/follower.py`'s `CameraRtspServer`), which needs GStreamer's RTSP server and its Python bindings, not just the CLI tools.

Debian/Ubuntu/Raspberry Pi OS:
```bash
sudo apt update
sudo apt install -y \
    python3-gi \
    gir1.2-gstreamer-1.0 \
    gir1.2-gst-plugins-base-1.0 \
    gir1.2-gst-rtsp-server-1.0 \
    gstreamer1.0-tools \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav
```

Fedora:
```bash
sudo dnf install -y \
    python3-gobject \
    gstreamer1-rtsp-server \
    gstreamer1 \
    gstreamer1-plugins-base \
    gstreamer1-plugins-good \
    gstreamer1-plugins-bad-free \
    gstreamer1-plugins-ugly \
    gstreamer1-libav
```

The leader/PC no longer needs any GStreamer packages — the old bridge that re-published video on the leader side (`rtp_to_rtsp_streamer.py`) has been removed now that the follower serves RTSP itself.

Verify the venv can actually see the bindings before moving on (with the venv activated):
```bash
python3 -c "import gi; gi.require_version('GstRtspServer', '1.0'); from gi.repository import GstRtspServer; print('ok')"
```
If this raises `ModuleNotFoundError: No module named 'gi'`, the venv was created without `--system-site-packages` — see step 1.

`CameraRtspServer` encodes video using the Raspberry Pi's hardware H.264 codec (`v4l2h264enc`, backed by the `bcm2835-codec` driver) rather than software `x264enc` — this keeps encoding off the CPU that the arm control loop also needs, and allows meaningfully higher resolution/bitrate than a Pi can sustain in software. It also hardware-decodes the camera's MJPEG output (`v4l2jpegdec`) rather than requesting raw video from the camera, since most USB webcams can't sustain 30fps in raw YUYV above ~640x480 — check `v4l2-ctl -d /dev/video0 --list-formats-ext` if unsure what your camera supports. All three elements ship in `gstreamer1.0-plugins-good`/`gstreamer1.0-plugins-bad` (already in the list above) — no extra packages needed, but only Pi models with the Broadcom VideoCore codec (Pi 3 and earlier, and Pi 4) have this hardware block; Pi 5 dropped it. Verify the elements exist before relying on them:
```bash
gst-inspect-1.0 v4l2h264enc
gst-inspect-1.0 v4l2jpegdec
gst-inspect-1.0 v4l2convert
```

### 3. Transfer to Raspberry Pi
Copy the project from PC to Raspberry Pi:
```bash
# From your PC:
scp -r /<PROJECT_PATH>/ <PI_USERNAME>@<PI_IP_ADDRESS>:~/
```

`start_leader.sh`/`start_follower.sh` locate themselves and `cd` into their own directory, but they still expect `.env`, `lerobot-venv/`, and `scripts/` to be siblings of the script — i.e. the project should land directly in the Pi user's home directory (`/home/leader/`, `/home/follower/`) if you plan to run it via the systemd units in step 12.

### 4. Find Serial Port
Before calibrating, identify which port your SO-ARM is connected to:

**Linux (PC and Raspberry Pi):**
Unplug the arm, run `ls /dev/ttyACM*`, then plug it back in and run the command again to see which device appears.

**Optional: Find Camera Device (if using video streaming):**
Unplug the camera, run `ls /dev/video*`, then plug it back in and run the command again to see which device appears (e.g., `/dev/video0`).

### 5. Calibrate Your Arms
You need calibration files for both leader and follower. Calibration files are stored within `/lerobot/calibrations`.

There should already be calibrations set up in this directory however if there isn't you can set your own buy running the following on their respective machines:

NOTE: make sure you start the calibration with the arm at its middle points for all joints including wrist roll. Like so ![Follower arm calibtaion start position](img/SO-101-Calibration-Start-Position.png)

```bash
# On Follower Pi (connected to follower arm)
python -c "from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig; \
f = SO101Follower(SO101FollowerConfig(port='/dev/ttyACM0', id='so_follower')); \
f.connect(); f.calibrate()"

# On Leader PC (connected to leader arm)
python -c "from lerobot.teleoperators.so_leader import SO101Leader, SO101LeaderConfig; \
l = SO101Leader(SO101LeaderConfig(port='/dev/ttyACM0', id='so_leader')); \
l.connect(); l.calibrate()"
```

### 6. Configure `.env`

Both `start_leader.sh` and `start_follower.sh` read their settings from a `.env` file next to them (`set -a; source .env; set +a`). Create one on **both** the Leader and Follower Pi — they can (and should) differ per machine:

```bash
# Shared MQTT settings — the broker itself runs on the Leader Pi
MQTT_BROKER_IP='<LEADER_PI_LAN_IP>'
MQTT_BROKER_PORT=1883
MQTT_TOPIC='watchman_robotarm/so-101'
MQTT_USERNAME='leader'
MQTT_PASSWORD='<choose a password>'

# Follower-only tuning (Follower Pi's .env)
FOLLOWER_PORT='/dev/ttyACM0'
MAX_RELATIVE_TARGET=20.0
CONTROL_FPS=60
IDLE_SEND_INTERVAL=0.25

# Follower camera (Follower Pi's .env) — start_follower.sh always passes these through,
# so all three must be set if a camera is attached (see step 4 for finding the device)
CAMERA_DEVICE='/dev/video0'
CAM_RES='1280x720'
VIDEO_BITRATE=3000000

# Leader-only settings (Leader Pi's .env)
LEADER_PORT='/dev/ttyACM0'
LEADER_ID='so_leader'
LEADER_FPS=24
```

Notes:
- **No spaces around `=`** — `FOO = 'bar'` breaks the loader (`export`/`source` sees `FOO`, `=`, `'bar'` as separate tokens); always use `FOO='bar'`.
- `MQTT_USERNAME`/`MQTT_PASSWORD` must match what's hardcoded in `front-end/js/mqtt/jsonrpcovermqtt.js` (currently `leader`/`Pa$$w0rd`), since the browser front end authenticates against the same broker with those credentials.
- `start_leader.sh` regenerates `/etc/mosquitto/passwd` from these values on **every run** — you never need to run `mosquitto_passwd` by hand.

### 7. Setup MQTT Broker

`start_leader.sh` runs its own ad-hoc Mosquitto broker each time it starts, bound to all interfaces on port `1883` (for the arms) and `9001` (websockets, for the browser front end), using credentials generated from `.env`.

On the **Leader Pi**, install the package for its binaries, but make sure the packaged system service isn't also running — it binds the same ports and will fail to conflict with the ad-hoc one started by the script:
```bash
sudo apt install mosquitto mosquitto-clients
sudo systemctl disable --now mosquitto
```

On the **Follower Pi**, no broker runs locally, so only the CLI tools are needed:
```bash
sudo apt install mosquitto-clients
```

### 8. Setup Web
To host the front end Web page I used Nginx (https://nginx.org/)
You probably know how to set up and host a web page yourself but here is a full set up guide anyways:

1) Install and enable nginx

Debian/Ubuntu/Raspberry Pi OS:
```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```
(no firewall step needed — Raspberry Pi OS doesn't enable one by default; if you've set one up yourself, open port 80)

Fedora:
```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

2) Copy project files to nginx web directory

The user nginx runs as (and so the owner these files need) differs by distro — Debian/Ubuntu/Raspberry Pi OS uses `www-data`, Fedora uses `nginx`; check yours with `grep "^user" /etc/nginx/nginx.conf` if unsure.

Debian/Ubuntu/Raspberry Pi OS:
```bash
sudo mkdir -p /var/www/so-101
sudo cp -r /<path to this directory>/front-end/* /var/www/so-101/
sudo chown -R www-data:www-data /var/www/so-101
sudo chmod -R 755 /var/www/so-101
```

Fedora:
```bash
sudo mkdir -p /var/www/so-101
sudo cp -r /<path to this directory>/front-end/* /var/www/so-101/
sudo chown -R nginx:nginx /var/www/so-101
sudo chmod -R 755 /var/www/so-101
```

3) Set up nginx config

```bash
sudo nano /etc/nginx/conf.d/so-101.conf
```

```
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name so-101-server;

    root /var/www/so-101;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

4) Set up websocket proxy for the front end

The browser connects to `ws://<IP_ADDR>:9000`, so nginx must forward websocket traffic to Mosquitto's websocket listener (port `9001`, opened automatically by `start_leader.sh` — no separate Mosquitto websocket config needed).

```bash
sudo nano /etc/nginx/conf.d/so-101-ws.conf
```

```
server {
    listen 9000;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

5) Reload and test

```bash
sudo nginx -t
sudo systemctl reload nginx
```

6) Verify the front end can reach the websocket endpoint

- Open `http://<IP_ADDR>/index.html`
- The page should connect to `ws://<IP_ADDR>:9000` — this only works once `start_leader.sh` (or the systemd service from step 12) is actually running, since that's what opens the `9001` websocket listener nginx is proxying to.

7) Demo video page (optional)

`front-end/mine-video.html` is a fullscreen, unattended looping video meant to give guests context — the arm actually in use — alongside the live 3D twin at `index.html`. It's plain static HTML with no MQTT/websocket dependency, so unlike `index.html` it works as soon as nginx is up, independent of whether `start_leader.sh`/the leader service is running.

It's just another file under `front-end/`, so the `cp -r front-end/* /var/www/so-101/` step above already deploys it — nothing extra to configure. Open it at:
```
http://<IP_ADDR>/mine-video.html
```
Since nginx itself is `enable --now`d in step 1 of this section, it's already a systemd service that starts on boot regardless of `start_leader.sh` — so this page (and the rest of the front end) comes back up on its own after a Pi reboot with no further action needed.

The page serves the video as WebM/VP9 (`front-end/vid/d2ce-video.webm`) with the original H.264 mp4 (`front-end/vid/d2ce-video.mp4`) as a `<source>` fallback. This matters if you swap in your own video: browsers like Chrome/Firefox decode H.264 fine, but embedded/kiosk renderers used by video-wall software (e.g. Watchman's browser-source, per step 10) are often built on a stripped-down Chromium Embedded Framework without H.264 decode support for licensing reasons — the mp4 alone just renders black with no error in that case, while WebM/VP9 (royalty-free) is universally supported. If you replace the video, regenerate the WebM alongside it:
```bash
ffmpeg -i your-video.mp4 -an -c:v libvpx-vp9 -crf 32 -b:v 0 -deadline good -cpu-used 4 -row-mt 1 your-video.webm
```
(`-an` drops audio since the page always plays muted anyway.) The page also force-restarts the video via a JS `ended` listener rather than relying solely on the native `loop` attribute, since some embedded renderers don't reliably honor it either.

### 9. Run It

Manually, for testing:
```bash
# On the Leader Pi
bash start_leader.sh

# On the Follower Pi
bash start_follower.sh
```

`Ctrl+C` stops either one and cleans up its own background processes (broker, nginx, gstreamer, python).

For it to survive reboots and restart automatically if something crashes, see [Run automatically on boot](#12-run-automatically-on-boot-systemd) below.

### 10. Visual Fusion+ (Watchman) Video Wall (optional)

This project is inteneded to be used on Visual Fusion+ (Watchman) Video Wall.
To set this up you will need a device with Watchman installed and set up that is connected to internet and at least one monitor display.

Within the device cmd find and remember the IP
```bash
ip a
```

Then start Watchman (Wherever you watchman is located)
```bash
workspace/watchman/build/opt/watchman/watchman
```

When watchman is running, on a seperate device connect via any browser. 
http://<Watchman Device IP>

Enter the password
Then if its still there you can switch your profile in the top left to "Robot Arm"
Which has an example set up on scene 0.

Otherwise create a stream of your web front end via the correct URL, and add any optional URL prameters you like. See Usage.md

e.g. http://0.0.0.0/index.html?#follower=0&leaderColor=0xFF6984 for a pink leader digital twin.


### 11. Set Port priorities (optional)

If wanting communication from the laptop (leader) to pi (follower) via UDP its a good idea to set the servo comunications as higher priority than the video stream as video packets droping is much better.

Bellow is some tc rules to prioritize the mqtt port over the rtp port. 
NOTE: the commands below are currenlty for wifi so switch "wlan0" to the appropriate network connection

On the pi cmd 
```bash
# Wipe existing rules
sudo tc qdisc del dev wlan0 root

# Rebuild with pfifo on robot band
sudo tc qdisc add dev wlan0 root handle 1: prio
sudo tc qdisc add dev wlan0 parent 1:1 handle 10: pfifo
sudo tc qdisc add dev wlan0 parent 1:2 handle 20: tbf rate 2mbit burst 32kbit latency 50ms

# Reapply filters
sudo tc filter add dev wlan0 protocol ip parent 1:0 prio 1 u32 \
    match ip dport 1883 0xffff flowid 1:1
sudo tc filter add dev wlan0 protocol ip parent 1:0 prio 2 u32 \
    match ip dport 5000 0xffff flowid 1:2
```

**Note:** the `dport 5000` filter above targets the old leader-side RTP bridge, which no longer exists — the follower now serves RTSP directly (`CameraRtspServer` in `scripts/follower.py`), so video traffic leaves the follower's wifi on port `8554` (RTSP control) plus a GStreamer-negotiated dynamic UDP port per client for the actual media, not a fixed one. Pinning that dynamic port down for a `tc` filter isn't configured yet — would need the RTSP server's UDP port range fixed via `set_profiles`/port-range options in `CameraRtspServer` first.

### 12. Run automatically on boot (systemd)

Unit files live in `systemd/` in this repo. They assume the project lives directly in the service user's home directory (e.g. `/home/leader/`, `/home/follower/`) since that's how `start_leader.sh`/`start_follower.sh` locate themselves — edit `User=`/`WorkingDirectory=`/`ExecStart=` if your layout differs.

**On the Leader Pi:**

`start_leader.sh` runs a few commands with `sudo` (writing the mosquitto password file, starting/stopping nginx). Since a boot-time service can't be prompted for a password, install the scoped sudoers rule first:

```bash
# verify the binary paths in the file match this machine first (which mosquitto_passwd, which systemctl)
sudo cp systemd/so-101-leader.sudoers /etc/sudoers.d/so-101-leader
sudo chmod 0440 /etc/sudoers.d/so-101-leader
sudo visudo -cf /etc/sudoers.d/so-101-leader
```

Make sure the system `mosquitto` service is disabled first (see step 7) — if it's still enabled it'll grab port 1883/9001 before the ad-hoc broker can and the service will fail to start:
```bash
sudo systemctl disable --now mosquitto
```

Then install and enable the service:

```bash
sudo cp systemd/so-101-leader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now so-101-leader.service
```

**On the Follower Pi:**

```bash
sudo cp systemd/so-101-follower.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now so-101-follower.service
```

**Checking on it:**

```bash
systemctl status so-101-leader.service      # or so-101-follower.service
journalctl -u so-101-leader.service -f      # live logs
sudo systemctl restart so-101-leader.service
```

### 13. Updating code on a Pi already running as a service

Once a Pi is running its script via systemd, deploying a code change is: copy the file over, then restart the service so it picks it up.

```bash
# From the dev machine, e.g. after changing scripts/follower.py:
scp scripts/follower.py follower@<FOLLOWER_PI_IP>:~/scripts/follower.py

# On the Pi:
sudo systemctl restart so-101-follower.service   # or so-101-leader.service
journalctl -u so-101-follower.service -n 40 --no-pager   # confirm it came back up clean
```

If the change adds a new Python dependency (like the GStreamer RTSP bindings in step 2), install it — and if it's a system (`apt`) package rather than something `pip install`-able, make sure the venv was created with `--system-site-packages` (step 1) or it won't be importable — *before* restarting the service, otherwise it'll just crash-loop.
