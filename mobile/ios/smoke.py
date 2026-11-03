"""Launch a Release simulator app and preserve a screenshot for visual review."""
import json, os, subprocess, time
from pathlib import Path
def run(*args): return subprocess.check_output(args, timeout=240)
scheme = os.environ['ORYA_SCHEME']
assert scheme in ['OryaParking', 'OryaOperations']
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
device = next(d for runtime, rows in devices.items() if 'iOS' in runtime for d in rows if d['name'].startswith('iPhone'))
if device['state'] != 'Booted': run('xcrun', 'simctl', 'boot', device['udid'])
run('xcrun', 'simctl', 'bootstatus', device['udid'], '-b')
app = f'simulator/{scheme}/Build/Products/Release-iphonesimulator/{scheme}.app'
run('xcrun', 'simctl', 'install', device['udid'], app)
bundle = 'com.orya.' + ('operations' if scheme == 'OryaOperations' else 'parking') + '.beta'
print(run('xcrun', 'simctl', 'launch', device['udid'], bundle).decode())
time.sleep(20)
out = Path('beta-evidence'); out.mkdir(exist_ok=True)
run('xcrun', 'simctl', 'io', device['udid'], 'screenshot', str(out / (scheme + '-first-launch.png')))
run('xcrun', 'simctl', 'terminate', device['udid'], bundle)
print(run('xcrun', 'simctl', 'launch', device['udid'], bundle).decode())
time.sleep(30)
run('xcrun', 'simctl', 'io', device['udid'], 'screenshot', str(out / (scheme + '.png')))
(out / (scheme + '-navigation.log')).write_bytes(run('xcrun', 'simctl', 'spawn', device['udid'], 'log', 'show', '--style', 'compact', '--last', '3m', '--predicate', 'eventMessage CONTAINS "Orya navigation" OR eventMessage CONTAINS "Orya web content"'))
(out / (scheme + '.json')).write_text(json.dumps({'scheme':scheme, 'simulator':device['name'], 'bundle_id':bundle, 'launched':True}, indent=2))
