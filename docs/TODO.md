## TODO
Whilst I wait around for tasks to do I think it will be fun to add the previously made animaiton code to the actual robot arm.

Im thinking I can make a new html page called animate.html
This will have its own 3d model of the follower arm, and a sort of Ui on the side where the user can set positions.
Then the user can: 
 - Preview animaiton: show the animation in the local 3d model previewer
 - Send animation: send the current animation configuration to the physical follower
 - Save animation: save the configured animation to a named txt file.
 - Load animation: load a saved animation from its txt file.
 - Start animation loop: loop the currenlty configured animation to the actual follower

### Try to do
 - Have a nice UI
 - Dont allow the user to do the options involving the actual follower if connection isnt established
 - Have a simple kill switch for the animation loop. This has to be done carefuly so the animaiton loop doesnt persist when a client connection drops or a new animate.html opens