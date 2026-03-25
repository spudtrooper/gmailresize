#!/usr/bin/env python3
"""Generate Chrome extension icons for Gmail Resizer."""
import struct
import zlib
import os


def write_png(filename, size, pixels):
    def crc32(data):
        return zlib.crc32(data) & 0xFFFFFFFF

    def chunk(name, data):
        c = name + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc32(c))

    raw = bytearray()
    for y in range(size):
        raw += b"\x00"
        for x in range(size):
            r, g, b, a = pixels[y][x]
            raw += bytes([r & 0xFF, g & 0xFF, b & 0xFF, a & 0xFF])

    data = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )

    with open(filename, "wb") as f:
        f.write(data)
    print(f"Created {filename}")


def make_icon(size):
    """Gmail-red rounded square with a white double-headed horizontal arrow."""
    RED = (234, 67, 53, 255)
    WHITE = (255, 255, 255, 255)
    CLEAR = (0, 0, 0, 0)

    pixels = [[CLEAR] * size for _ in range(size)]

    def sp(x, y, color):
        if 0 <= x < size and 0 <= y < size:
            pixels[y][x] = color

    # --- Rounded rect background ---
    r = max(2, size // 6)
    for y in range(size):
        for x in range(size):
            ix = max(r, min(x, size - 1 - r))
            iy = max(r, min(y, size - 1 - r))
            if (x - ix) ** 2 + (y - iy) ** 2 <= r * r:
                pixels[y][x] = RED

    # --- Double-headed horizontal arrow ---
    pad = max(2, size // 8)
    mid = size // 2
    bar_h = max(1, size // 12)   # half-thickness of bar
    ah = max(2, size // 5)       # arrowhead half-height
    aw = max(2, size // 5)       # arrowhead depth

    lx = pad                     # left tip x
    rx = size - 1 - pad          # right tip x
    bar_lx = lx + aw
    bar_rx = rx - aw

    # Horizontal bar
    for y in range(mid - bar_h, mid + bar_h + 1):
        for x in range(bar_lx, bar_rx + 1):
            sp(x, y, WHITE)

    # Left arrowhead (triangle pointing left)
    for x in range(lx, bar_lx + 1):
        t = (x - lx) / max(1, bar_lx - lx)
        spread = int(t * ah)
        for y in range(mid - spread, mid + spread + 1):
            sp(x, y, WHITE)

    # Right arrowhead (triangle pointing right)
    for x in range(bar_rx, rx + 1):
        t = (rx - x) / max(1, rx - bar_rx)
        spread = int(t * ah)
        for y in range(mid - spread, mid + spread + 1):
            sp(x, y, WHITE)

    return pixels


os.makedirs("icons", exist_ok=True)
for size in [16, 32, 48, 128]:
    write_png(f"icons/icon{size}.png", size, make_icon(size))
