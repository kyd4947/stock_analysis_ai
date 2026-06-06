from http.server import BaseHTTPRequestHandler
import requests
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 환경 변수에서 API Key를 가져옴 (Vercel 설정에 등록)
        api_key = os.environ.get("DART_API_KEY")
        target_url = f"https://opendart.fss.or.kr/api/list.json?crtfc_key={api_key}&page_count=1"
        
        response = requests.get(target_url)
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(response.content)