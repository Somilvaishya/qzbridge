import frappe
import os
import base64
from Cryptodome.Hash import SHA512
from Cryptodome.Signature import pkcs1_15
from Cryptodome.PublicKey import RSA

@frappe.whitelist(allow_guest=True)
def get_qz_certificate():
    """Returns the public certificate to QZ Tray to establish trust."""
    cert_path = frappe.get_app_path('qzbridge', 'qz_cert.pem')
    try:
        with open(cert_path, 'r') as f:
            return f.read()
    except Exception as e:
        frappe.log_error(message=str(e), title="QZ Cert Error")
        return ""

@frappe.whitelist(allow_guest=True)
def sign_qz_message(challenge):
    """Signs the connection challenge from QZ Tray using our private RSA key."""
    key_path = frappe.get_app_path('qzbridge', 'qz_private.pem')
    try:
        with open(key_path, 'r') as f:
            private_key = RSA.import_key(f.read())
        
        hasher = SHA512.new(challenge.encode('utf-8'))
        signature = pkcs1_15.new(private_key).sign(hasher)
        return base64.b64encode(signature).decode('utf-8')
    except Exception as e:
        frappe.log_error(message=str(e), title="QZ Signature Error")
        return ""
