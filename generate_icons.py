import os
from PIL import Image, ImageDraw

def generate_icons():
    source_path = r"d:\Whiteroom\Minimalist_geometric_logo_mark._A_202605201103.jpeg"
    res_dir = r"d:\Whiteroom\apps\mobile\android\app\src\main\res"

    if not os.path.exists(source_path):
        print(f"Error: Source image not found at {source_path}")
        return False

    try:
        img = Image.open(source_path)
    except Exception as e:
        print(f"Error loading image: {e}")
        return False

    # Define the target folders and their corresponding icon sizes
    icon_specs = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192
    }

    for folder, size in icon_specs.items():
        folder_path = os.path.join(res_dir, folder)
        if not os.path.exists(folder_path):
            os.makedirs(folder_path)

        # 1. Generate square/adaptive icon
        square_img = img.resize((size, size), Image.Resampling.LANCZOS)
        square_webp_path = os.path.join(folder_path, "ic_launcher.webp")
        square_img.save(square_webp_path, "WEBP", quality=90)
        print(f"Saved {square_webp_path} ({size}x{size})")

        # 2. Generate round icon (with circular crop)
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)

        round_img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
        round_img.paste(square_img.convert('RGBA'), (0, 0), mask=mask)

        round_webp_path = os.path.join(folder_path, "ic_launcher_round.webp")
        round_img.save(round_webp_path, "WEBP", quality=90)
        print(f"Saved {round_webp_path} ({size}x{size} circular)")

    print("Success: Android launcher icons successfully updated!")
    return True

if __name__ == "__main__":
    generate_icons()
