from pathlib import Path
path = Path('E:/CustomApp/src-tauri/icons')
path.mkdir(parents=True, exist_ok=True)
icon = bytes([
    0,0,1,0,1,0,
    1,0,1,0,0,0,1,0,32,0,48,0,22,0,0,0,
    40,0,0,0,1,0,0,0,2,0,0,0,1,0,32,0,0,0,0,0,
    4,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,0,0,0,0
])
with open(path / 'icon.ico', 'wb') as f:
    f.write(icon)
print('created', path / 'icon.ico', 'size', len(icon))
