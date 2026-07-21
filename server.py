import http.server
import socketserver
import urllib.request
import json
import base64
import uuid

PORT = 8000
SHOP_ID = "1399769"
SECRET_KEY = "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0"

class PaymentHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/create-payment':
            # Construct Basic Auth
            auth_str = f"{SHOP_ID}:{SECRET_KEY}"
            auth_b64 = base64.b64encode(auth_str.encode()).decode()
            
            # Call YooKassa API
            req = urllib.request.Request(
                'https://api.yookassa.ru/v3/payments',
                data=json.dumps({
                    'amount': {'value': '22990.00', 'currency': 'RUB'},
                    'capture': True,
                    'confirmation': {
                        'type': 'redirect',
                        'return_url': 'https://t.me/ai_hustlers_bot?start=welcome'
                    },
                    'description': 'Тест-драйв системы AI HUSTLERS'
                }).encode(),
                headers={
                    'Authorization': f'Basic {auth_b64}',
                    'Idempotence-Key': str(uuid.uuid4()),
                    'Content-Type': 'application/json'
                },
                method='POST'
            )
            
            try:
                with urllib.request.urlopen(req) as res:
                    response_data = res.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response_data)
            except Exception as e:
                err_msg = str(e)
                if hasattr(e, 'read'):
                    err_msg = e.read().decode()
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({'error': err_msg}).encode())
        else:
            super().do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

with socketserver.TCPServer(("", PORT), PaymentHandler) as httpd:
    print(f"Local Server started at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
