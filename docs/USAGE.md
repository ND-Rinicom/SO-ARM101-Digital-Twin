

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
  --idle-send-interval 0.25                  # Idel send interval (seconds)
```

If you want to stream the follower camera over UDP (RTP/H264), add:
```bash
  --camera /dev/video0 \                     # V4L2 device
  --cam-res 640x480 \                        # e.g. 320×240
  --video-host <rtp_to_rtsp_streamer.py ip>  # Defaults to --mqtt-broker-ip
```

You should see:
```
Connecting to follower arm on /dev/ttyACM0...
Follower arm connected
Connected to MQTT broker at <MQTT_BROKER_IP>:1883
Subscribed to topic: watchman_robotarm/so-101/leader
```

The follower publishes servo positions to `watchman_robotarm/so-101/follower` for the frontend.

### 4. Open index.html
Open index.html from the same IP as your front-end nginx server:
```
http://<IP_ADDR>/index.html
```
The page connects to a JSON-RPC-over-WebSocket endpoint at `ws://<IP_ADDR>:9000`.

Optional URL parameters
```
index.html?#leader=0&followerColor=0xff69b4 #Pink Follower arm only

# Supported params:
?#model=so-101               # Model name (accepts so-101 or so-101.glb)
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

### 5. Control!

Move the leader arm - the digital twin and follower will follow safely with jump protection.


