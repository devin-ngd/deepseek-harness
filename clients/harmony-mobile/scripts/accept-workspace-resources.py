"""Verify resource interception only in the independent loopback emulator app; never enumerate or select a phone."""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--build', required=True)
parser.add_argument('--hap')
parser.add_argument('--expect', choices=['positive', 'empty-decoder'], default='positive')
args = parser.parse_args()
client = pathlib.Path(__file__).resolve().parent.parent
build_path = (client / args.build).resolve()
build = json.loads(build_path.read_text(encoding='utf8'))
assert build['exitCode'] == 0 and build['sourceArkTsCompiled']
hap = (client / args.hap).resolve() if args.hap else pathlib.Path(build['artifact']['path'])
assert hap.is_relative_to(client / '.build')
assert hashlib.sha256(hap.read_bytes()).hexdigest() == build['artifact']['sha256']
bundle = 'local.dsh.mobile.workspacecheck'
target = '127.0.0.1:5555'
hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
world = pathlib.Path(tempfile.mkdtemp(prefix='workspace-resources-', dir=client / '.build'))
commands = []
report = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'target': target, 'bundle': bundle,
          'build': str(build_path), 'hapSha256': build['artifact']['sha256'], 'expect': args.expect,
          'world': str(world), 'models': 0, 'externalNetwork': False, 'physicalPhoneAccessed': False,
          'dailyProfileUsed': False, 'sourceArkTsCompiled': True, 'nativeArkWeb': True, 'passed': False}

def call(parts, check=True):
    result = subprocess.run([hdc, '-p', '-s', '127.0.0.1:8710', '-t', target, *parts],
                            capture_output=True, text=True, encoding='utf8', errors='replace', timeout=30)
    commands.append({'args': parts, 'code': result.returncode})
    if check:
        assert result.returncode == 0 and not re.search(r'\[Fail\]|\[Error\]', result.stdout + result.stderr), result.stdout[-800:]
    return result.stdout.strip()

def metadata():
    raw = call(['shell', 'bm', 'dump', '-n', bundle])
    data = json.loads(raw[raw.index('{'):])
    return {'version': data['versionName'], 'uid': data['applicationInfo']['uid']}

def nodes(value):
    result = []
    def visit(node):
        if isinstance(node, dict):
            if 'attributes' in node:
                result.append(node['attributes'])
            for child in node.get('children', []):
                visit(child)
    visit(value)
    return result

def layout(label):
    remote = '/data/local/tmp/dsh-resource-' + uuid.uuid4().hex + '.json'
    path = world / (label + '.json')
    try:
        call(['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote])
        call(['file', 'recv', remote, str(path)])
    finally:
        call(['shell', 'rm', '-f', remote], check=False)
    result = nodes(json.loads(path.read_text(encoding='utf8')))
    if not any(row.get('bundleName') == bundle for row in result):
        return []
    assert all(not row.get('bundleName') or row['bundleName'] == bundle for row in result)
    return result

def text(rows, identity):
    return next((row.get('text', '') for row in rows if row.get('id') == identity), '')

def click(rows, identity):
    matches = [row for row in rows if row.get('id') == identity and row.get('enabled') == 'true' and row.get('visible') != 'false']
    assert len(matches) == 1, 'Expected one enabled owned control: ' + identity
    match = re.fullmatch(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', matches[0]['bounds'])
    assert match
    left, top, right, bottom = map(int, match.groups())
    assert left >= 0 and top >= 0 and right > left and bottom > top
    call(['shell', 'uitest', 'uiInput', 'click', str((left + right) // 2), str((top + bottom) // 2)])

def screenshot(label):
    remote = '/data/local/tmp/dsh-resource-' + uuid.uuid4().hex + '.jpeg'
    try:
        call(['shell', 'snapshot_display', '-f', remote])
        call(['file', 'recv', remote, str(world / (label + '.jpeg'))])
    finally:
        call(['shell', 'rm', '-f', remote], check=False)

try:
    assert call(['shell', 'param', 'get', 'const.product.name']) == 'emulator'
    report['before'] = metadata()
    call(['shell', 'aa', 'force-stop', bundle], check=False)
    installed = call(['install', '-r', str(hap)])
    assert 'success' in installed.lower()
    report['after'] = metadata()
    assert report['before']['uid'] == report['after']['uid']
    call(['shell', 'aa', 'start', '-b', bundle, '-a', 'EntryAbility'])
    deadline, counter, rows = time.monotonic() + 60, 0, []
    while time.monotonic() < deadline:
        rows = layout('resource-' + str(counter)); counter += 1
        inspect = [row for row in rows if row.get('id') == 'workspace-fixture-inspect' and row.get('enabled') == 'true']
        if inspect:
            click(rows, 'workspace-fixture-inspect')
            rows = layout('inspect-' + str(counter))
            if 'RESOURCE_PROBE_PASS' in text(rows, 'workspace-fixture-diagnostic') or 'RESOURCE_PROBE_FAIL' in text(rows, 'workspace-fixture-diagnostic'):
                break
        time.sleep(0.25)
    diagnostic = text(rows, 'workspace-fixture-diagnostic')
    state = text(rows, 'workspace-fixture-state')
    decoded = diagnostic
    while isinstance(decoded, str):
        decoded = json.loads(decoded)
    result = json.loads(decoded['body'].split('\n', 1)[1])
    report.update({'diagnostic': decoded, 'state': state, 'checks': result['checks'],
                   'nativeProbePassed': decoded['title'] == 'RESOURCE_PROBE_PASS' and result['passed']})
    screenshot('resource-result')
    if args.expect == 'positive':
        assert report['nativeProbePassed'] and state.endswith(' / ready'), (state, diagnostic)
        for check in ['emptyFirst', 'emptySecond', 'optionalFailed']:
            assert report['checks'][check] is True
        click(rows, 'workspace-fixture-root-failure')
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            rows = layout('root-' + str(counter)); counter += 1
            if text(rows, 'workspace-fixture-state').endswith(' / failed'):
                break
            time.sleep(0.25)
        report['rootFailureStillFails'] = text(rows, 'workspace-fixture-state').endswith(' / failed')
        assert report['rootFailureStillFails']
        screenshot('root-failure')
    else:
        assert decoded['title'] == 'RESOURCE_PROBE_FAIL' and not report['nativeProbePassed'], (state, diagnostic)
        report['negativeControlRejected'] = True
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    call(['shell', 'aa', 'force-stop', bundle], check=False)
    report['stopped'] = call(['shell', 'pidof', bundle], check=False) == ''
    report['commands'] = commands
    report['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    output = client / 'evidence' / ('workspace-resource-arkweb-' + str(time.time_ns()) + '.json')
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'evidence': str(output), 'passed': report['passed'], 'expected': args.expect, 'nativeProbePassed': report.get('nativeProbePassed'), 'stopped': report['stopped']}, ensure_ascii=False))
