# SO-101 DIGITAL TWIN 2 Pi setup

![Photo of SO-101 Digital Twin Project](docs/img/Project%20Image.png)

This Branch is dedicated to a 2 Pi setup, with one pi for the leader, web and mosquitto hosting and the other pi for the follower and cam streaming. This setup can be left running meaning I don't have to keep running over and setting up the robot arm if sean of garik want to show it to visitors. 

## Changes from main
### follower.py 
Now creates its own GStreamer-based RTSP server that can run on the follower pi (no need for bridge)
### Mosquitto MQTT
The MQTT Broker (Mosquitto that now runs on the leader pi) now requires a username and password (this should be added to main at some point)
because of this, follower.py, leader.py, jsonrpcovermqtt.js, and .env have all been given the new username and pasword arguments.
### start_follower.sh & start_leader.sh
start_robots.sh as seen in main has been replaced with start_follower.sh and start_leader.sh which are run on the respected pis. Both the shell scripts have been configured to run on boot of the pi so if (god forbid) the system breaks simply turning on and off the pis will fix it. (both shell scripts use the same .env, realisticaly they should probably have there own but i cba)
### systemd .service and .sudoers
these are the files that allow the pi to execute the system on boot without requiring any human input and are used when setting it up.
### mine-video.html
This has nothing to do with the functionality of the robots.
its a added front end page showing a .webm from when the arm went down the mine. (trys webm first as watchman doesnt like .mp4 but will fall back to mp4 on fail)
This is just so if being showcased to guests they can about why it exists.

## Setup 
For a detailed breakdown of how to set up the system, see [docs/SETUP.md](docs/SETUP.md).

## Usage Guide
For a detailed breakdown of how to use the system once it is set up, see [docs/USAGE.md](docs/USAGE.md).

## SO-101 Robot Arm Details and Maintenance 

A full guide on the SO-101 robot arms can be found in the README here: https://github.com/TheRobotStudio/SO-ARM100. This includes documentation, bill of materials, and links to pre-built arms that are available to purchase.

- NOTE: As of 17/03/2026 the current Rinicom leader arm gripper servo is a little damaged. So far it works fine but has some resistance and a "crunch" when extended around 90°. The servo needed to replace this was identified from the above link as STS3215 Servo 7.4V, 1/147 gear (C046).

- NOTE: As of 18/02/2026 the USB-C port on the follower arm came off and had to be re-soldered. It clearly seems like the original soldering job wasn't great, so be careful with other connections, especially the USB-C port on the leader arm as it's probably the same.
