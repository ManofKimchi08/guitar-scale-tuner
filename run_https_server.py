import os
import sys
import subprocess
import ssl
import ipaddress
from http.server import SimpleHTTPRequestHandler, HTTPServer

def check_and_install_dependencies():
    try:
        import cryptography
    except ImportError:
        print("[INFO] Installing 'cryptography' library to generate local SSL certificate...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography"])

def generate_self_signed_cert():
    if os.path.exists("cert.pem") and os.path.exists("key.pem"):
        return
        
    print("[INFO] Generating self-signed SSL certificate (cert.pem, key.pem)...")
    check_and_install_dependencies()
    
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization
    import datetime
    
    # Generate private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048
    )
    
    # Generate certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "KR"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Seoul"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Seoul"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "ASIO Guitar Tuner"),
        x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
    ])
    
    cert = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        issuer
    ).public_key(
        private_key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)
    ).not_valid_after(
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650) # 10 years
    ).add_extension(
        x509.SubjectAlternativeName([
            x509.DNSName("localhost"), 
            x509.IPAddress(ipaddress.ip_address("127.0.0.1"))
        ]),
        critical=False,
    ).sign(private_key, hashes.SHA256())
    
    # Write private key
    with open("key.pem", "wb") as f:
        f.write(private_key.private_key_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption()
        ))
        
    # Write certificate
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
        
    print("[INFO] SSL certificate generated successfully!")

def run_server(port=8000):
    generate_self_signed_cert()
    
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, SimpleHTTPRequestHandler)
    
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
    
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
    
    print("\n===================================================")
    print(f"  HTTPS Local Server: https://localhost:{port}")
    print(f"  External Device Access: https://<YOUR_IP>:{port}")
    print("===================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping HTTPS Web Server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
