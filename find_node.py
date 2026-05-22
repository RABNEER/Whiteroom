import os
import sys

print("Python:", sys.version)
print("PATH:", os.environ.get("PATH"))

# Let's search standard directories for Node.exe
search_dirs = [
    os.environ.get("ProgramFiles", "C:\\Program Files"),
    os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)"),
    os.environ.get("LOCALAPPDATA", ""),
    os.environ.get("APPDATA", ""),
]

for s in search_dirs:
    if not s:
        continue
    print(f"Checking in {s}...")
    for root, dirs, files in os.walk(s):
        # limit depth to avoid excessive walking
        depth = root[len(s):].count(os.sep)
        if depth > 4:
            dirs.clear() # don't go deeper
            continue
        if "node.exe" in files:
            print("FOUND NODE.EXE:", os.path.join(root, "node.exe"))
            break
