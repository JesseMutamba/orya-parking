"""Install release code signed with an ephemeral CI-only key and verify launch UI.

Distribution artifacts remain unsigned for private local signing. The ephemeral
key and emulator installs are never uploaded, and no live account is signed in.
"""
from pathlib import Path
import os, subprocess, time, xml.etree.ElementTree as ET

sdk = Path(os.environ['ANDROID_HOME'])
adb = str(sdk / 'platform-tools/adb')
def run(*args): return subprocess.check_output(args, timeout=45)
deadline = time.monotonic() + 240
while time.monotonic() < deadline:
    try:
        if run(adb, 'shell', 'getprop', 'sys.boot_completed').strip() == b'1': break
    except subprocess.SubprocessError: pass
    time.sleep(3)
else: raise SystemExit('Android emulator did not boot')
run(adb, 'shell', 'input', 'keyevent', '82')
out = Path('beta-evidence'); out.mkdir(exist_ok=True)
key = Path('/tmp/orya-ci-only.p12')
run('keytool', '-genkeypair', '-keystore', str(key), '-alias', 'ci', '-storepass', 'android',
    '-keypass', 'android', '-keyalg', 'RSA', '-validity', '2', '-dname', 'CN=Ephemeral CI Test', '-noprompt')
for role, expected in [('parking', 'Where are you heading?'), ('operations', 'Sign in')]:
    package = 'com.orya.' + role + '.beta'
    apk = '/tmp/orya-' + role + '-ci.apk'
    run('java', '-jar', 'beta-artifacts/apksigner.jar', 'sign', '--ks', str(key),
        '--ks-key-alias', 'ci', '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
        '--out', apk, 'beta-artifacts/orya-' + role + '-unsigned.apk')
    run(adb, 'install', '-r', apk)
    run(adb, 'shell', 'am', 'start', '-W', '-n', package + '/com.orya.mobile.MainActivity')
    deadline = time.monotonic() + 60
    found = False
    while time.monotonic() < deadline:
        run(adb, 'shell', 'uiautomator', 'dump', '/sdcard/orya-window.xml')
        xml = run(adb, 'exec-out', 'cat', '/sdcard/orya-window.xml')
        (out / (role + '.xml')).write_bytes(xml)
        nodes = ET.fromstring(xml).iter('node')
        if any(expected in (e.get('text', '') + e.get('content-desc', '')) for e in nodes):
            found = True; break
        time.sleep(3)
    (out / (role + '.png')).write_bytes(run(adb, 'exec-out', 'screencap', '-p'))
    if not found: raise SystemExit(role + ': expected launch content did not appear')
    print(role + ': installed and loaded live interface', flush=True)
    run(adb, 'shell', 'am', 'force-stop', package)
