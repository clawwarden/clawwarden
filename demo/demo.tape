# Generates demo/demo.gif from the terminal demo.
# Install VHS (https://github.com/charmbracelet/vhs), then run:
#     vhs demo/demo.tape
#
# Run it from the repo root in a virtualenv where `clawwarden` is installed.

Output demo/demo.gif

Set FontSize 15
Set Width 1200
Set Height 740
Set Padding 18
Set Theme "Dracula"

# Install quietly off-camera so the GIF opens straight into the demo.
Hide
Type "pip install -q clawwarden" Enter
Sleep 4s
Show

Type "python demo/demo.py" Enter
Sleep 9s
Sleep 2s
