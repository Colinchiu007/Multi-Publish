"""Test configuration — add src to Python path"""
import sys
from pathlib import Path

# Add the src directory to the Python path
SRC_DIR = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(SRC_DIR.resolve()))