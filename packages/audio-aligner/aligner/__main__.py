"""允许 python -m audio_aligner 启动 REST 服务器（PORT 默认 8004）。"""
import os

import uvicorn

from .api import app


def main():
    port = int(os.environ.get("PORT", "8004"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
