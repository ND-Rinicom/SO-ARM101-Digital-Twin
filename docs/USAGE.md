

## Usage
If followed setup correctly both arms should be functional and should be shown on watchman videowall if configured to the correct ips. 
if something breaks turn of and on the pis and restart watchman

#### Demo video page

`http://<leader-pi-ip>/mine-video.html` is a fullscreen, looping video showing the arm actually in use — useful as a second Watchman scene/panel to give guests context alongside the live digital twin. It's static (no MQTT dependency), so it works whether or not the leader/follower services are running. If you swap in your own video, see the note in [SETUP.md](SETUP.md#8-setup-web) about also generating a WebM version — Watchman's embedded browser renders a plain H.264 mp4 as black.

#### Three.js cam controls
For a detailed guide on how to move the camera around the digital twins please see [Front-end-camera-guide.md](Front-end-camera-guide.md).


