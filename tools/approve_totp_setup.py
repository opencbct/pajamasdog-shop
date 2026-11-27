#!/usr/bin/env python3
"""11-27 형님: phone code for the CJ approve button.
Makes (once) a secret in ~/.config/pajamasdog/approve_totp.env and a QR picture to scan with Google Authenticator.
The secret is never printed. The QR file is deleted by --clean after scanning.
  python3 tools/approve_totp_setup.py           → make secret (if missing) + QR, open it in Preview
  python3 tools/approve_totp_setup.py --check   → type the 6 digits from the app; says OK / wrong
  python3 tools/approve_totp_setup.py --clean   → delete the QR picture"""
import base64, hashlib, hmac, os, secrets, struct, subprocess, sys, time
ENV = os.path.expanduser('~/.config/pajamasdog/approve_totp.env')
QR = os.path.expanduser('~/.config/pajamasdog/approve_totp_qr.png')

def secret():
    if not os.path.exists(ENV):
        s = base64.b32encode(secrets.token_bytes(20)).decode()
        with open(os.open(ENV, os.O_WRONLY | os.O_CREAT, 0o600), 'w') as f: f.write(f'APPROVE_TOTP_SECRET={s}\n')
    return open(ENV).read().split('=', 1)[1].strip()

def code(s, step):
    h = hmac.new(base64.b32decode(s), struct.pack('>Q', step), hashlib.sha1).digest(); o = h[-1] & 15
    return f'{(struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000:06d}'

if '--clean' in sys.argv:
    if os.path.exists(QR): os.remove(QR)
    print('QR picture deleted')
elif '--check' in sys.argv:
    c = input('6 digits from the app: ').strip(); now = int(time.time() // 30)
    print('OK ✓' if any(code(secret(), now + d) == c for d in (-1, 0, 1)) else 'wrong ✗')
else:
    import qrcode
    uri = f'otpauth://totp/PajamasDog:approve?secret={secret()}&issuer=PajamasDog&digits=6&period=30'
    qrcode.make(uri, box_size=10, border=3).save(QR); os.chmod(QR, 0o600)
    subprocess.run(['open', QR]); print('QR opened in Preview (secret not shown)')
