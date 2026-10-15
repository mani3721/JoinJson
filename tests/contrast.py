"""Test the active warm palette rather than the legacy fallback palette."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('warm-contrast.py')), run_name='__main__')
