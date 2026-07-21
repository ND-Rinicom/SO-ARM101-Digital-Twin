#!/bin/bash

# Navigate to the working directory
cd ~/Documents/SO-ARM101-Digital-Twin/ || { echo "Directory not found!"; exit 1; }

# Load environment variables from the .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
else
  echo "Error: .env file not found. Please create it in the working directory."
  exit 1
fi

# Set up a trap to kill all background processes cleanly when you press Ctrl+C
# trap 'echo -e "\nStopping all robot arms and streams..."; kill $(jobs -p) 2>/dev/null; exit' INT TERM EXIT
# Define a cleanup function
cleanup() {
  echo -e "\nStopping all robot arms and streams..."
  
  # 1. Explicitly kill the follower script AND gstreamer on the Raspberry Pi
  echo "Shutting down remote Follower Arm and Video Streams..."
  sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_IP" \
    "pkill -f scripts/follower.py; killall -9 gst-launch-1.0" 2>/dev/null
  
  # 2. Kill all local background processes (Leader arm, Video stream)
  echo "Shutting down local processes..."
  kill $(jobs -p) 2>/dev/null
  
  exit
}

# Bind the cleanup function to Ctrl+C (INT), termination (TERM), and normal exit (EXIT)
trap cleanup INT TERM EXIT

echo "=== 1. Configuring the Master Radio ==="
# Using sshpass to bypass the password prompt. StrictHostKeyChecking=no prevents yes/no prompts.
sshpass -p "$RADIO_PASS" ssh -o StrictHostKeyChecking=no "$RADIO_USER@$RADIO_IP" \
  "mosquitto_rr -t airfox_rpc -e airfox_response -m '{\"jsonrpc\":\"2.0\",\"method\":\"set_tdd_role\", \"params\":{\"tdd_role\":{\"tdd_role\":0}},\"id\":\"123\"}'"

echo "=== 2. Checking Radio Connectivity ==="
ping -c 2 "$RADIO_TARGET_1" || { echo "Warning: Could not reach $RADIO_TARGET_1"; }
ping -c 2 "$RADIO_TARGET_2" || { echo "Warning: Could not reach $RADIO_TARGET_2"; }

echo "=== 3. Starting Follower Arm on Raspberry Pi ==="
# Running the SSH command in the background (&) so the script can continue to step 4
sshpass -p "$PI_PASS" ssh -o StrictHostKeyChecking=no "$PI_USER@$PI_IP" \
  "source lerobot-venv/bin/activate && python scripts/follower.py --mqtt-broker-ip $MQTT_BROKER_IP --camera /dev/video0" &

echo "=== 4. Starting Leader Arm (Local) ==="
# Activating local virtual environment
source lerobot-venv/bin/activate || { echo "Virtual environment not found locally!"; exit 1; }

# Run leader script in the background
python scripts/leader.py &

echo "=== 5. Starting Video Playback Stream (Local) ==="
# Run video stream in the background
python scripts/rtp_to_rtsp_streamer.py &

echo ""
echo "========================================================"
echo " All systems are running in the background!"
echo " Press [CTRL+C] at any time to shut everything down."
echo "========================================================"
echo ""

# Wait keeps the script running so the background tasks stay alive.
wait