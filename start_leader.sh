#!/bin/bash

# Run from the script's own directory regardless of caller (systemd sets no useful cwd)
cd "$(dirname "$(readlink -f "$0")")" || { echo "Failed to resolve script directory"; exit 1; }

# Load environment variables from the .env file
if [ -f .env ]; then
  set -a
  source .env
  set +a
else
  echo "Error: .env file not found. Please create it in the working directory."
  exit 1
fi

cleanup() {
  echo -e "\nStopping leader, broker and streams..."

  # Kill mosquitto broker if started
  if [ -n "$MOSQ_PID" ]; then
    kill "$MOSQ_PID" 2>/dev/null || true
  fi

  # Stop nginx (web front end)
  sudo systemctl stop nginx 2>/dev/null || true

  # Kill all local background processes (Leader arm, Video stream)
  kill $(jobs -p) 2>/dev/null || true

  # Remove temporary mosquitto config
  [ -n "$TMP_MOSQ_CONF" ] && rm -f "$TMP_MOSQ_CONF"

  exit
}

trap cleanup INT TERM EXIT

echo "=== Setting mosquitto credentials from .env ==="
sudo mosquitto_passwd -b -c /etc/mosquitto/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD" || { echo "Failed to write /etc/mosquitto/passwd"; exit 1; }
# mosquitto runs as the current (unprivileged) user below, so it needs to own the file, not just root
sudo chown "$(id -u):$(id -g)" /etc/mosquitto/passwd
sudo chmod 0600 /etc/mosquitto/passwd

echo "=== Starting local MQTT broker (mosquitto) on all interfaces ==="
# Create a temporary mosquitto config reachable from the LAN (needed for the remote follower and local leader alike)
TMP_MOSQ_CONF=$(mktemp)
cat > "$TMP_MOSQ_CONF" <<EOF
allow_anonymous false
password_file /etc/mosquitto/passwd

listener 1883

# Websocket listener for the web front end, proxied by nginx on port 9000
listener 9001
protocol websockets
EOF

# Start mosquitto with the temporary config
mosquitto -c "$TMP_MOSQ_CONF" -v &
MOSQ_PID=$!

echo "=== Starting nginx (web front end) ==="
sudo systemctl start nginx || { echo "Failed to start nginx"; cleanup; }

echo "=== Activating local virtual environment ==="
source lerobot-venv/bin/activate || { echo "Virtual environment not found locally!"; cleanup; }

echo "=== Starting Leader Arm (local) ==="
python scripts/leader.py \
  --leader-port $LEADER_PORT \
  --leader-id $LEADER_ID \
  --mqtt-broker $MQTT_BROKER_IP \
  --mqtt-port $MQTT_BROKER_PORT \
  --mqtt-topic $MQTT_TOPIC \
  --mqtt-username $MQTT_USERNAME \
  --mqtt-password $MQTT_PASSWORD \
  --fps $LEADER_FPS \
  --idle-send-interval $IDLE_SEND_INTERVAL &

echo ""
echo "========================================================"
echo " Leader systems are running in the background!"
echo " Press [CTRL+C] at any time to shut everything down."
echo "========================================================"
echo ""

# Wait keeps the script running so the background tasks stay alive.
wait
