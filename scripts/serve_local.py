"""Local test server: suppress URL logs which could contain login codes."""
import argparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8000)
args = parser.parse_args()
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=str(Path(__file__).resolve().parent.parent),**k)
    def log_message(self,*a): pass
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('Referrer-Policy','no-referrer')
        super().end_headers()
print(f'Local app server: http://127.0.0.1:{args.port}/ (request URLs are not logged)',flush=True)
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
