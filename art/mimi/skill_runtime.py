"""Locate the external pet skill and portable preview fonts.

The skill's implementation is supplied by the installed work-pets plugin. This
project intentionally does not vendor or replace its extraction/validation code.
"""
from pathlib import Path
import os
import re
import sys
import warnings


def _version_key(path):
    return tuple(int(part) for part in re.findall(r"\d+", path.parents[2].name))


def find_skill_scripts():
    """Return an installed scripts directory, or fail with setup instructions."""
    configured = os.environ.get("MIMI_PET_SKILL_SCRIPTS")
    required = ("extract_strip_frames.py", "despill_chroma_edges.py")
    if configured:
        candidate = Path(configured).expanduser().resolve()
        if all((candidate / name).is_file() for name in required):
            return candidate
        raise FileNotFoundError(
            f"MIMI_PET_SKILL_SCRIPTS points to {candidate}, but the required "
            f"work-pets scripts are missing: {', '.join(required)}. "
            "Set it to the installed create-pet/scripts directory."
        )

    codex_root = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    plugin_root = codex_root.expanduser() / "plugins" / "cache" / "openai-curated-remote" / "work-pets"
    candidates = sorted(
        plugin_root.glob("*/skills/create-pet/scripts"),
        key=_version_key,
        reverse=True,
    )
    for candidate in candidates:
        if all((candidate / name).is_file() for name in required):
            return candidate.resolve()
    raise FileNotFoundError(
        "The work-pets create-pet skill scripts were not found. Install the "
        "work-pets plugin, or set MIMI_PET_SKILL_SCRIPTS to its "
        "create-pet/scripts directory. Existing shipped artwork and the "
        "desktop application can be used without this creation dependency."
    )


def enable_skill_scripts():
    scripts = find_skill_scripts()
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    return scripts


def preview_font(size, *, chinese=False):
    """Use a configured/CJK system font; retain a clear fallback on other hosts."""
    from PIL import ImageFont

    configured = os.environ.get("MIMI_PET_FONT")
    if configured:
        try:
            return ImageFont.truetype(str(Path(configured).expanduser()), size)
        except OSError as exc:
            raise OSError(f"Cannot load MIMI_PET_FONT: {configured}") from exc

    candidates = []
    if os.environ.get("WINDIR"):
        fonts = Path(os.environ["WINDIR"]) / "Fonts"
        candidates.extend([fonts / "msyh.ttc", fonts / "simhei.ttf"])
    candidates.extend([
        Path("/System/Library/Fonts/PingFang.ttc"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
    ])
    for candidate in candidates:
        if candidate.is_file():
            try:
                return ImageFont.truetype(str(candidate), size)
            except OSError:
                continue
    if chinese:
        warnings.warn(
            "No Chinese font found; preview captions may contain missing glyphs. "
            "Set MIMI_PET_FONT to a CJK .ttf/.ttc/.otf font to render them fully.",
            RuntimeWarning,
        )
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Older Pillow releases do not accept the size argument.
        return ImageFont.load_default()


if __name__ == "__main__":
    print(find_skill_scripts())
