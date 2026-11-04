"""Launch a Release simulator app and preserve a screenshot for visual review."""
import json, os, subprocess, time
from pathlib import Path
def run(*args): return subprocess.check_output(args, timeout=240)
scheme = os.environ['ORYA_SCHEME']
assert scheme in ['OryaParking', 'OryaOperations']
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
runtimes = json.loads(run('xcrun', 'simctl', 'list', 'runtimes', '-j'))['runtimes']
runtime = max((r for r in runtimes if r.get('isAvailable') and r['identifier'] in devices and 'iOS' in r['identifier']), key=lambda r: tuple(map(int, r['version'].split('.'))))
phones = [d for d in devices[runtime['identifier']] if d['name'].startswith('iPhone')]
device = next((d for d in phones if d['name'] == 'iPhone SE (3rd generation)'), phones[0])
print('Testing', runtime['name'], device['name'], flush=True)
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
(out / (scheme + '.json')).write_text(json.dumps({'scheme':scheme, 'simulator':device['name'], 'runtime':runtime['name'], 'bundle_id':bundle, 'launched':True}, indent=2))
log = (out / (scheme + '-navigation.log')).read_text()
assert 'Orya web content process terminated' not in log, 'Web content process terminated; inspect the screenshots and navigation log'
