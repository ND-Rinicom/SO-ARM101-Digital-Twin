

## Usage

### 1. Make sure venv is activated (Both PC & Pi)
```bash
source lerobot-venv/bin/activate
```

### 2. Start Leader Sender (on PC)

```bash
python scripts/leader.py
```
The command above uses `__init__` defaults.

Optional command-line parameters (with comments):
```bash
python scripts/leader.py \
  --leader-port /dev/ttyACM0 \              # Serial port for the leader arm
  --leader-id so_leader \                   # Calibration ID for the leader arm
  --mqtt-broker <MQTT_BROKER_IP> \          # MQTT broker IP or hostname
  --mqtt-port 1883 \                        # MQTT broker port
  --mqtt-topic watchman_robotarm/so-101 \   # MQTT topic
  --fps 24 \                                # Control loop frequency (Hz)
  --idle-send-interval 0.25                 # Idle send interval (seconds)
```

You should see:
```
Leader arm connected
Connected to MQTT broker
Leader sender started at 24 FPS
Move the leader arm to control the follower
```

The leader publishes servo positions to `watchman_robotarm/so-101/leader` for the frontend and follower.

### 3. Start Follower Controller (on Pi)
```bash
python scripts/follower.py
```
The command above uses `__init__` defaults.

Optional command-line parameters (with comments):
```bash
python scripts/follower.py \
  --follower-port /dev/ttyACM0 \             # Serial port for the follower arm
  --follower-id so_follower \                # Calibration ID for the follower arm
  --mqtt-broker-ip <MQTT_BROKER_IP> \        # MQTT broker IP or hostname
  --mqtt-broker-port 1883 \                  # MQTT broker port
  --mqtt-topic watchman_robotarm/so-101 \    # MQTT topic
  --max-relative-target 20 \                 # Safety clamp (max relative motion per step)
  --control-fps 24 \                         # Control loop frequency (Hz)
  --idle-send-interval 0.25                  # Idle send interval (seconds)
```

If you want to stream the follower camera as RTSP, add:
```bash
  --camera /dev/video0 \        # V4L2 device — enables the RTSP server
  --cam-res 1280x720 \          # capture resolution, e.g. 640x480, 1920x1080
  --video-bitrate 3000000 \     # target H.264 bitrate in bits/sec
  --rtsp-host 0.0.0.0 \         # RTSP bind address
  --rtsp-port 8554 \            # RTSP server port
  --rtsp-mount /camera          # RTSP path
```
`--cam-res` must be a resolution/framerate combo your camera actually supports over MJPEG at 30fps — check with `v4l2-ctl -d /dev/video0 --list-formats-ext` on the Pi. `--video-bitrate` is the main quality/bandwidth knob; raise it for a sharper picture at the cost of more wifi traffic, or lower it if video is starving the servo control traffic.

You should see:
```
Connecting to follower arm on /dev/ttyACM0...
Follower arm connected
Connected to MQTT broker at <MQTT_BROKER_IP>:1883
Subscribed to topic: watchman_robotarm/so-101/leader
```

The follower publishes servo positions to `watchman_robotarm/so-101/follower` for the frontend.

### 4. (Optional) Camera RTSP stream

If `scripts/follower.py` is given a camera device (`--camera`), it serves the feed directly as RTSP from the follower Pi itself — no separate bridge process needed. Encoding runs on the Pi's hardware H.264 codec rather than the CPU, so raising resolution/bitrate (see `--cam-res`/`--video-bitrate` above) doesn't compete with the arm control loop for CPU time the way software encoding would.

You should see a log like:
```
Starting RTSP server at rtsp://0.0.0.0:8554/camera
```

View the stream (from Watchman, VLC, ffplay, etc.):
- `rtsp://<FOLLOWER_PI_IP>:8554/camera`


### 5. Web / Watchman

I have made a new profile within the Watchman users that has the video wall all set up.
In profiles go to SO-101 Digital Twin.
Scene 0 is probably all you will need but just in case on Scene 1 I have made some example panels showcasing how you can use the HTML cam control parameters to "lock" the camera to potentially useful views.

Open index.html from the same IP as your front-end nginx server:
```
http://<IP_ADDR>/index.html
```
The page connects to a JSON-RPC-over-WebSocket endpoint at `ws://<IP_ADDR>:9000`.

Optional URL parameters
```
index.html#?leader=0&followerColor=0xff69b4 # Pink follower arm only

# Supported params:
#?model=so-101               # Model name (accepts so-101 or so-101.glb)
&follower=1                  # Show follower model (0 or 1)
&leader=1                    # Show leader model (0 or 1)
&followerColor=0x88ccff      # 0xRRGGBB or #RRGGBB
&leaderColor=0xffffff        # 0xRRGGBB or #RRGGBB
&followerOpacity=0.8         # 0.0 - 1.0
&leaderOpacity=1.0           # 0.0 - 1.0
&camX=0&camY=0&camZ=0        # Camera position
&camTargetX=0&camTargetY=0&camTargetZ=0  # Camera target
&wireframe=0                 # Render mode (0 = ghost, 1 = wireframe)
&debug=0                     # Show console logs overlay (0 or 1)
```
You should see:
Robot arm model updating to match leader/follower joint data

#### Demo video page

`http://<IP_ADDR>/mine-video.html` is a fullscreen, looping video showing the arm actually in use — useful as a second Watchman scene/panel to give guests context alongside the live digital twin. It's static (no MQTT dependency), so it works whether or not the leader/follower services are running. If you swap in your own video, see the note in [SETUP.md](SETUP.md#8-setup-web) about also generating a WebM version — Watchman's embedded browser renders a plain H.264 mp4 as black.

#### Three.js cam controls
For a detailed guide on how to move the camera around the digital twins please see [Front-end-camera-guide.md](Front-end-camera-guide.md).

### 6. Control!

Hopefully now if set up correctly you should be able to see the digital twins of both follower and leader react when leader is controlled.


