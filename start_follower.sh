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
  echo -e "\nStopping follower and streams..."

  # Kill the follower process if running (its RTSP camera thread dies with it)
  pkill -f scripts/follower.py 2>/dev/null || true

  # Kill background jobs started by this script
  kill $(jobs -p) 2>/dev/null || true

  exit
}

trap cleanup INT TERM EXIT

echo "=== Starting Follower Arm (local on this Pi) ==="

echo "=== Activating virtual environment ==="
source lerobot-venv/bin/activate || { echo "Virtual environment not found!"; cleanup; }

echo "=== Launching follower ==="
python scripts/follower.py \
  --mqtt-broker-ip $MQTT_BROKER_IP \
  --mqtt-broker-port $MQTT_BROKER_PORT \
  --mqtt-topic $MQTT_TOPIC \
  --mqtt-username $MQTT_USERNAME \
  --mqtt-password $MQTT_PASSWORD \
  --max-relative-target $MAX_RELATIVE_TARGET \
  --control-fps $CONTROL_FPS \
  --idle-send-interval $IDLE_SEND_INTERVAL \
  --camera $CAMERA_DEVICE \
  --cam-res $CAM_RES \
  --video-bitrate $VIDEO_BITRATE &

echo ""
echo "========================================================"
echo " Follower is running locally."
echo " Press [CTRL+C] to stop."
echo "========================================================"
echo ""

# Keep script alive while background jobs run
wait
