import os
import struct
import zlib
import binascii

def png_chunk(chunk_type, data):
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", binascii.crc32(chunk_type + data) & 0xFFFFFFFF)
    )

def create_icon(size, path):
    width = height = size
    raw = bytearray()

    cx = width / 2
    cy = height / 2
    radius = size * 0.34

    for y in range(height):
        raw.append(0)
        for x in range(width):
            dx = x - cx
            dy = y - cy
            inside = dx * dx + dy * dy <= radius * radius

            if inside:
                r, g, b, a = 16, 185, 129, 255
            else:
                r, g, b, a = 9, 9, 11, 255

            raw.extend([r, g, b, a])

    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    )
    png += png_chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += png_chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)

os.makedirs("public", exist_ok=True)

create_icon(192, "public/icon-192.png")
create_icon(512, "public/icon-512.png")
create_icon(180, "public/apple-touch-icon.png")

print("Icons generated successfully.")
