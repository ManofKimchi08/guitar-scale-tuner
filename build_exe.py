import os
import sys
import subprocess

def build():
    print("===================================================")
    print("  Building Guitar Scale Tuner Executable Package  ")
    print("===================================================")

    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name", "GuitarScaleTuner",
        "--add-data", "index.html;.",
        "--add-data", "src;src",
        "--add-data", "i18n.js;.",
        "GuitarScaleTuner.py"
    ]

    print("Running command:", " ".join(cmd))
    subprocess.check_call(cmd)
    print("\n✅ Build complete! Executable generated at: dist/GuitarScaleTuner/GuitarScaleTuner.exe")

if __name__ == "__main__":
    build()
