"""Run the API:  python run.py

Port 8765 is used on purpose: 8000 is commonly taken by other dev servers.
Override with AI2LATEX_PORT.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AI2LATEX_PORT", "8765"))
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False)
