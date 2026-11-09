# Dev server with caching disabled, so a normal refresh always loads the latest game files.
# Run from anywhere:  python3 tools/serve.py   (serves strike-zone/ on http://localhost:8765)
import http.server, functools, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *a):
        pass

http.server.ThreadingHTTPServer(('', 8765), functools.partial(NoCache, directory=ROOT)).serve_forever()
