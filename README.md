# Tiny Zoom – iOS app (Capacitor)

The Tiny Zoom RC racing web game (`www/`) packaged as an iOS app.
To build it in the cloud and get it onto your iPhone with TestFlight without a Mac, see **[IOS_SETUP.md](IOS_SETUP.md)**.

Quick commands (Node.js 22+):

    npm ci
    npx cap sync ios              # copy www/ into the Xcode project
    python3 tools/smoke_test.py   # headless browser check of the game
