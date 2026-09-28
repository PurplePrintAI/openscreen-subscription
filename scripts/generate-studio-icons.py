"""Regenerate PurplePrint Studio's checked-in app icons (requires Pillow).

The geometry mirrors public/purpleprint-studio.svg. Run only when the mark
changes; normal application and release builds consume the checked-in files.
"""

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ICON_ROOT = ROOT / "icons" / "icons"
PNG_SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)
MASTER_SIZE = 4096


def points(coords: tuple[tuple[float, float], ...]) -> list[tuple[float, float]]:
    scale = MASTER_SIZE / 64
    return [(x * scale, y * scale) for x, y in coords]


def render_master() -> Image.Image:
    image = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, MASTER_SIZE - 1, MASTER_SIZE - 1),
        radius=15 * MASTER_SIZE / 64,
        fill="#8B5CF6",
    )
    draw.polygon(
        points(
            (
                (29.5, 11.5), (33.8, 25), (47.5, 29.3), (33.8, 33.7),
                (29.5, 47.3), (25.1, 33.7), (11.5, 29.3), (25.1, 25),
            )
        ),
        fill="#FFFFFF",
    )
    draw.polygon(
        points(
            (
                (47.5, 39), (49.2, 44.3), (54.5, 46), (49.2, 47.7),
                (47.5, 53), (45.8, 47.7), (40.5, 46), (45.8, 44.3),
            )
        ),
        fill=(255, 255, 255, 230),
    )
    return image


def main() -> None:
    master = render_master()
    png_dir = ICON_ROOT / "png"
    png_dir.mkdir(parents=True, exist_ok=True)
    for size in PNG_SIZES:
        master.resize((size, size), Image.Resampling.LANCZOS).save(
            png_dir / f"{size}x{size}.png", format="PNG"
        )

    icon_1024 = master.resize((1024, 1024), Image.Resampling.LANCZOS)
    win_dir = ICON_ROOT / "win"
    win_dir.mkdir(parents=True, exist_ok=True)
    icon_1024.save(
        win_dir / "icon.ico", format="ICO", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    )

    mac_dir = ICON_ROOT / "mac"
    mac_dir.mkdir(parents=True, exist_ok=True)
    icon_1024.save(mac_dir / "icon.icns", format="ICNS")


if __name__ == "__main__":
    main()
