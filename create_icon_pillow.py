from PIL import Image
from pathlib import Path
path = Path('E:/CustomApp/src-tauri/icons')
path.mkdir(parents=True, exist_ok=True)
img = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
for x in range(32):
    for y in range(32):
        if x < 2 or y < 2 or x >= 30 or y >= 30:
            img.putpixel((x, y), (255, 255, 255, 255))
img.save(path / 'icon.ico', format='ICO', sizes=[(32, 32)])
print('created', path / 'icon.ico', (path / 'icon.ico').stat().st_size)
