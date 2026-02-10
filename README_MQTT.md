# SO-ARM101 MQTT Teleoperation

Minimal codebase for controlling SO-ARM101 follower via MQTT from a leader arm.

## Features

- **Jump Protection**: Follower checks safety locally (no network latency)
- **Calibration Support**: Uses standard LeRobot calibration files
- **Robust**: Works even with slow/unreliable networks
- **Minimal**: ~25 files, <1MB total

## Setup

### 1. Install Dependencies

On both PC and Raspberry Pi:

```bash
pip install paho-mqtt feetech-servo-sdk pyserial
```

### 2. Calibrate Your Arms

You need calibration files for both leader and follower. Run on their respective machines:

```bash
# On Follower Pi (connected to follower arm)
python -c "from lerobot.robots.so_follower import SO101Follower, SO101FollowerConfig; \
f = SO101Follower(SO101FollowerConfig(port='/dev/ttyUSB0', id='black')); \
f.connect(); f.calibrate()"

# On Leader PC (connected to leader arm)
python -c "from lerobot.teleoperators.so_leader import SO101Leader, SO101LeaderConfig; \
l = SO101Leader(SO101LeaderConfig(port='/dev/ttyUSB0', id='blue')); \
l.connect(); l.calibrate()"
```

This creates calibration files in `~/.cache/calibration/`.

### 3. Setup MQTT Broker

Install Mosquitto or use an existing MQTT broker:

```bash
# On any machine (or use cloud broker)
sudo apt install mosquitto mosquitto-clients
sudo systemctl start mosquitto
```

### 4. Configure Scripts

Edit the configuration values at the top of each script:

**scripts/follower_mqtt_controller.py** (run on Pi):
```python
FOLLOWER_PORT = "/dev/ttyUSB0"           # Your follower serial port
FOLLOWER_ID = "black"                     # Your calibration ID
MQTT_BROKER = "192.168.1.100"            # Your MQTT broker IP
MAX_RELATIVE_TARGET = 20.0               # Jump protection limit
```

**scripts/leader_mqtt_sender.py** (run on PC):
```python
LEADER_PORT = "/dev/ttyUSB0"             # Your leader serial port
LEADER_ID = "blue"                        # Your calibration ID
MQTT_BROKER = "192.168.1.100"            # Your MQTT broker IP
FPS = 60                                  # Control loop frequency
```

## Usage

### 1. Start Follower Controller (on Raspberry Pi)

```bash
cd /home/nialldorrington/Documents/SO-ARM101
python scripts/follower_mqtt_controller.py
```

You should see:
```
Follower arm connected
Connected to MQTT broker
Follower controller started. Waiting for targets...
```

### 2. Start Leader Sender (on PC)

```bash
cd /home/nialldorrington/Documents/SO-ARM101
python scripts/leader_mqtt_sender.py
```

You should see:
```
Leader arm connected
Connected to MQTT broker
Leader sender started at 60 FPS
Move the leader arm to control the follower
```

### 3. Control!

Move the leader arm - the follower will follow safely with jump protection.

## Safety Features

### Hardware Limits
- Set during calibration
- Stored in servo firmware
- Enforced even without software

### Jump Protection
- `max_relative_target` limits position changes per step
- Applied on follower side (no network delay)
- Example: With `max_relative_target=20.0`:
  - Target: 45° → 180° (135° jump)
  - Actual: 45° → 65° (20° jump)
  - Gradually moves to target over multiple steps

### Reconnection Safety
- If connection drops, follower stops moving
- On reconnect, follower re-reads position before accepting new targets
- No dangerous jumps after network interruption

## File Structure

```
SO-ARM101/
├── lerobot/                    # Minimal LeRobot library (~25 files)
│   ├── robots/                 # Robot control
│   ├── teleoperators/          # Leader control
│   ├── motors/                 # Motor/servo drivers
│   ├── utils/                  # Utilities
│   └── processor/              # Type definitions
├── scripts/
│   ├── follower_mqtt_controller.py    # Run on Pi
│   └── leader_mqtt_sender.py          # Run on PC
└── README_MQTT.md
```
