"""Run the FastAPI app with Uvicorn, ensuring the project root is on sys.path.

Usage:
    python run_api.py

This script makes `backend` importable even if you run it from a different CWD.
"""

import os
import sys

# Ensure project root (this file's directory) is first on sys.path
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


def main() -> None:
    import uvicorn

    uvicorn.run("helper_scripts.api:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
