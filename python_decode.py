import base64, sys
# Base64 encoded JS test script
b64 = sys.stdin.read().strip()
js = base64.b64decode(b64).decode("utf-8")
with open(r"D:\Data\projects\Multi-Publish\apps\desktop\tests\e2e-cookies-verify.js", "w", encoding="utf-8") as f:
    f.write(js)
print("Written", len(js), "bytes")
