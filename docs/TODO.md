## TODO
Whilst I wait around for tasks to do I think it will be fun to add the previously made animaiton code to the actual robot arm.

Im thinking I can make a new html page called animate.html
This will have its own 3d model of the follower arm, and a sort of Ui on the side where the user can set positions.
Then the user can: 
 - Preview animaiton: show the animation in the local 3d model previewer
 - Send animation: send the current animation configuration to the physical follower
 - Save animation: save the configured animation to a named txt file.
 - Load animation: load a saved animation from its txt file.
 - Start animation loop: loop the currenlty configured animation to the actual followersett
 - The user should be able to set an animation by either:
   1) Setting key frames in the side bar. Each key frame contains the angle degrees for each "joint". As well as two ms times. One time is interpolation time (how long it takes to get get to this keyframe), and the other is for hold time, a completely optional parameter detailiinterpolationg how long it should stay at this keyframe before moving on.
   2) Record animation. When the user hits record, we take and store every joint value brodcast to the mqtt broker then display this on the local preview animation as well as save every frame to a file. (NOTE: not sure this will work with follower if it has a different FPS set compaired to what leaders was set to at the time, may have to do some work around for this, i.e before running the aninmation on follower check to see if fps match, if they dont then preprosses the animation down removing or adding keyframes apropreatly. Alternativly and may work better with the system we are building we could just grab key frames set at a potentaily user chosen interval then by only storing the key frames this saved json can be piped into the same flow as the other animations which callculates interpolation frames based on follower fps)
   3) Grab key frames. Similar to Record animation however the user moves the follower to a postion then presses grab key frame which then will grab the most recent mqtt leader message and store it as a key frame. This key frame will apear on the side bar like step one and can be modified and adjusted there.

### Try to do
 - Have a nice UI
 - Dont allow the user to do the options involving the actual follower if connection isnt established
 - Have a simple kill switch for the animation loop. This has to be done carefuly so the animaiton loop doesnt persist when a client connection drops or a new animate.html opens

### Design decisions
 - The animation loop runs on the **Leader Pi**, inside `leader.py`'s existing control loop, as a mode switch — not in the browser and not as a new topic for joint frames.
   - Normal mode: reads the physical leader arm and publishes as it does today.
   - Animation mode: skips reading the physical arm, publishes animation frames instead — onto the **same** `.../leader` topic `follower.py` already subscribes to, so `follower.py` needs no changes.
   - This also solves the "physical arm fights the animation" problem: `leader.py`'s idle keepalive would otherwise re-assert the physical arm's pose every ~250ms and stomp the animation.
 - `leader.py` gains a new **control topic** (e.g. `.../animation/control`) for animate.html to send start/load/stop commands. Not retained — a retained "start" would auto-resume looping if `leader.py` restarts.
 - A small **retained status topic** (mirroring how `follower.py` already publishes `set_actual_joint_angles`) reports current animation state (idle / looping which animation), so a freshly opened animate.html tab can see what's already running without replaying commands.
 - Kill switch: use MQTT **Last Will and Testament** on `leader.py`'s connection rather than relying on `beforeunload`/tab-close JS, since LWT fires on ungraceful disconnects (crash, network drop) too.
 - Resuming physical-arm control after a loop stops relies on `follower.py`'s existing `max_relative_target` jump protection to avoid a snap if the physical arm has drifted — no new safety logic needed there.