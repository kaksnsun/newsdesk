"""Private local SearXNG worker; exits if its owning app disappears."""
import argparse
import os
import threading
import time

from search_settings import configure_engines

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--parent', type=int, required=True)
parser.add_argument('--settings', required=True)
args = parser.parse_args()
configure_engines(args.settings)
os.environ['SEARXNG_SETTINGS_PATH'] = args.settings
# Keep engine caches scoped to this app installation.
os.environ['XDG_CACHE_HOME'] = os.path.join(os.path.dirname(args.settings), 'cache')

def watch_parent():
    while True:
        time.sleep(2)
        if os.getppid() != args.parent:
            os._exit(0)

threading.Thread(target=watch_parent, daemon=True).start()
from searx.webapp import app  # noqa: E402
from waitress import serve  # noqa: E402
serve(app, host='127.0.0.1', port=args.port, threads=8, expose_tracebacks=False)
