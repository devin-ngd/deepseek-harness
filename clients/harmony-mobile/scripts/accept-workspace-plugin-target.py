"""Verify actual Index targeting with a local document or isolated standard Host; never operate the physical phone."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--build', required=True)
carrier = parser.add_mutually_exclusive_group()
carrier.add_argument('--host', action='store_true')
carrier.add_argument('--cipher', action='store_true')
carrier.add_argument('--startup-recovery', action='store_true')
args = parser.parse_args()
host = args.host or args.cipher
client = pathlib.Path(__file__).resolve().parent.parent
build_path = (client / args.build).resolve()
assert build_path.is_relative_to(client / 'evidence' / 'native-build')
build = json.loads(build_path.read_text(encoding='utf8'))
assert build['exitCode'] == 0 and build['sourceArkTsCompiled']
hap = pathlib.Path(build['artifact']['path']).resolve()
review_dir = pathlib.Path(build['cwd']).name if args.startup_recovery else 'native-controls-plugin-cipher-review' if args.cipher else 'native-controls-plugin-host-review' if args.host else 'native-controls-plugin-review'
if args.startup_recovery:
    assert re.fullmatch(r'native-controls-workspace-startup-rc2-\d+', review_dir)
assert hap.is_relative_to(client / '.build' / review_dir)
assert hashlib.sha256(hap.read_bytes()).hexdigest() == build['artifact']['sha256']
bundle, target = 'local.dsh.mobile.workspacecheck', '127.0.0.1:5555'
hdc = 'D:/Program Files/HuaWei/DevEco Studio/sdk/default/openharmony/toolchains/hdc.exe'
world = pathlib.Path(tempfile.mkdtemp(prefix='workspace-plugin-target-', dir=client / '.build'))
commands, checks = [], {}
report = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'build': str(build_path),
          'hapSha256': build['artifact']['sha256'], 'target': target, 'bundle': bundle, 'world': str(world),
          'physicalPhoneAccessed': False, 'dailyProfileUsed': False, 'models': 0, 'networkUsed': host,
          'carrier': 'native encrypted frames over HTTP loopback' if args.cipher else 'test-only HTTP loopback' if host else 'local resources', 'encryptedCarrier': False,
          'realStandardPluginExecuted': False, 'actualNativeIndex': True, 'actualDocumentStartBridge': True, 'passed': False}
verified, sequence = False, 0
active, forwarded = None, False
if host:
    active = json.loads((client / 'evidence' / 'workspace-emulator-active.json').read_text(encoding='utf8'))
    assert active['scenario'] == 'plugin-target' and active['app'] == bundle and active['devicePort'] == 18082
    assert (active.get('encryptedCarrier') is True) == args.cipher
    host_world = pathlib.Path(active['world']).resolve()
    assert host_world.is_relative_to(client / '.build') and host_world.name.startswith('workspace-')
    age = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(active['startedAt'].replace('Z', '+00:00'))
    assert 0 <= age.total_seconds() < 300
    assert isinstance(active['panelTargetPackage'], str) and 0 < len(active['panelTargetPackage']) <= 256
    assert isinstance(active['hostPort'], int) and 1024 < active['hostPort'] < 65536
    report['hostWorld'] = str(host_world)
    report['packageName'] = active['panelTargetPackage']
    if args.cipher:
        assert re.fullmatch(r'session-[a-z0-9-]{1,100}', active['sessionId'])
        report['originalSession'] = active['sessionId']

def call(parts, check=True):
    result = subprocess.run([hdc, '-p', '-s', '127.0.0.1:8710', '-t', target, *parts], capture_output=True,
                            text=True, encoding='utf8', errors='replace', timeout=30)
    commands.append({'args': parts, 'code': result.returncode})
    if check:
        assert result.returncode == 0 and not re.search(r'\[Fail\]|\[Error\]', result.stdout + result.stderr), result.stdout[-800:]
    return result.stdout.strip()

def metadata():
    raw = call(['shell', 'bm', 'dump', '-n', bundle])
    value = json.loads(raw[raw.index('{'):])
    return {'uid': value['applicationInfo']['uid'], 'version': value['versionName']}

def layout():
    global sequence
    sequence += 1
    remote = '/data/local/tmp/dsh-plugin-target-' + uuid.uuid4().hex + '.json'
    local = world / ('layout-' + str(sequence) + '.json')
    try:
        call(['shell', 'uitest', 'dumpLayout', '-b', bundle, '-m', 'false', '-p', remote])
        call(['file', 'recv', remote, str(local)])
    finally:
        call(['shell', 'rm', '-f', remote], check=False)
    rows = []
    def visit(node):
        if isinstance(node, dict):
            if 'attributes' in node:
                rows.append(node['attributes'])
            for child in node.get('children', []):
                visit(child)
    visit(json.loads(local.read_text(encoding='utf8')))
    assert all(not row.get('bundleName') or row['bundleName'] == bundle for row in rows)
    return rows

def visible(row):
    return row.get('visible') == 'true' and row.get('enabled') != 'false'

def wait(predicate, label, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        rows = layout()
        if predicate(rows):
            return rows
        time.sleep(0.2)
    raise AssertionError('UI state unavailable: ' + label)

def click(rows, predicate):
    matches = [row for row in rows if predicate(row) and visible(row)]
    assert len(matches) == 1, ('owned target is not unique', len(matches))
    left, top, right, bottom = map(int, re.fullmatch(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', matches[0]['bounds']).groups())
    assert 0 <= left < right and 0 <= top < bottom
    call(['shell', 'uitest', 'uiInput', 'click', str((left + right) // 2), str((top + bottom) // 2)])

def seek_web(predicate, label):
    for attempt in range(25):
        rows = layout()
        webs = [row for row in rows if row.get('type') == 'Web' and visible(row)]
        assert len(webs) == 1, 'one owned workspace Web must be visible'
        left, top, right, bottom = map(int, re.fullmatch(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', webs[0]['bounds']).groups())
        tabs = [row for row in rows if row.get('type') == 'tab' and visible(row)]
        minimum_top = max([top] + [int(re.fullmatch(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', row['bounds']).group(4)) for row in tabs])
        found = []
        for row in rows:
            if not predicate(row) or not visible(row):
                continue
            rectangle = tuple(map(int, re.fullmatch(r'\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]', row.get('origBounds') or row['bounds']).groups()))
            if minimum_top <= rectangle[1] < rectangle[3] <= bottom:
                found.append(row)
        if found:
            assert len(found) == 1, 'one reachable standard control is required: ' + label
            return rows
        if attempt < 24:
            x = str(int(left + (right - left) * 0.72))
            call(['shell', 'uitest', 'uiInput', 'swipe', x, str(int(top + (bottom - top) * 0.65)), x, str(int(top + (bottom - top) * 0.4)), '600'])
    raise AssertionError('standard control is not reachable: ' + label)

def by_id(identity):
    return lambda row: row.get('id') == identity

def screenshot(label):
    remote = '/data/local/tmp/dsh-plugin-target-' + uuid.uuid4().hex + '.jpeg'
    try:
        call(['shell', 'snapshot_display', '-f', remote])
        call(['file', 'recv', remote, str(world / (label + '.jpeg'))])
    finally:
        call(['shell', 'rm', '-f', remote], check=False)

def observed_target(value):
    return wait(lambda rows: any(row.get('text') == 'PLUGIN_TARGET:' + value for row in rows)
                and any(row.get('text') == 'SESSION_TARGET:plugin-target-session' for row in rows), value)

def settings(rows):
    if any(row.get('id') == 'product-chat-back' and visible(row) for row in rows):
        click(rows, by_id('product-chat-back'))
    rows = wait(lambda values: any(by_id('product-nav-device')(row) and visible(row) for row in values), 'native settings entry')
    click(rows, by_id('product-nav-device'))
    return wait(lambda values: any(by_id('product-workspace-plugin-target')(row) and visible(row) for row in values), 'native plugin target')

def replace_native(rows, identity, value):
    click(rows, by_id(identity))
    call(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017'])
    call(['shell', 'uitest', 'uiInput', 'text', value])
    return wait(lambda values: any(by_id(identity)(row) and row.get('text') == value for row in values), identity)

def standard_panel():
    panel = lambda row: row.get('text') == '多模型工具箱' and visible(row)
    notice = lambda row: row.get('type') == 'dialog' and row.get('text') == '预览版说明' and visible(row)
    rows = wait(lambda values: any(panel(row) or notice(row) for row in values), 'standard panel or preview notice', 120 if args.cipher else 45)
    if any(notice(row) for row in rows):
        screenshot('standard-preview-notice')
        click(rows, lambda row: row.get('type') == 'button' and row.get('text') == '继续' and visible(row))
        report['previewNoticeAcknowledged'] = True
        rows = wait(lambda values: any(panel(row) for row in values), 'standard DevFlow settings after preview notice')
    return rows

def startup_recovery():
    session = by_id('product-session-plugin-target-session')
    workspace = by_id('product-chat-workspace')
    composer = by_id('product-composer')
    draft = 'workspace-recovery-draft'
    rows = wait(lambda values: any(session(row) and visible(row) for row in values), 'synthetic native Session')
    click(rows, session)
    rows = wait(lambda values: any(composer(row) and visible(row) for row in values), 'native conversation')
    rows = replace_native(rows, 'product-composer', draft)
    click(rows, workspace)

    def native_draft(values):
        assert not any((row.get('type') == 'Web' or by_id('product-workspace-back')(row)) and visible(row) for row in values), 'retired workspace mounted'
        return any(workspace(row) and visible(row) for row in values) and any(composer(row) and row.get('text') == draft for row in values)

    rows = wait(native_draft, 'native draft after interrupted startup')
    app_pid = call(['shell', 'pidof', bundle]); assert app_pid.isdigit()
    log = call(['shell', 'hilog', '-x', '-P', app_pid])
    for marker in ('WORKSPACE_STARTUP_REPLACEMENT_CANCELLED', 'WORKSPACE_STARTUP_REPLACEMENT_DELIVERED'):
        assert sum(line.endswith(marker) for line in log.splitlines()) == 1, marker
    assert not any(by_id('product-error')(row) and visible(row) for row in rows), 'retired preparation surfaced a native error'
    checks['originalPreparationCancelledAndNativeDraftRetained'] = True
    screenshot('native-after-interrupted-startup')
    click(rows, workspace)
    rows = observed_target('WORKSPACE')
    checks['newConnectionOpenedOneArkWeb'] = sum(row.get('type') == 'Web' and visible(row) for row in rows) == 1
    assert checks['newConnectionOpenedOneArkWeb']
    screenshot('workspace-after-connection-replacement')
    click(rows, by_id('product-workspace-back'))
    wait(native_draft, 'native draft after returning from replacement workspace')
    checks['nativeDraftRestoredAfterReturn'] = True

def host_panel():
    initial = []
    if args.cipher:
        session_row = by_id('product-session-' + active['sessionId'])
        initial = wait(lambda values: any(session_row(row) and visible(row) for row in values), 'original encrypted Session')
        app_pid = call(['shell', 'pidof', bundle]); assert app_pid.isdigit()
        log = call(['shell', 'hilog', '-x', '-P', app_pid])
        assert any(line.endswith('WORKSPACE_CIPHER_NATIVE_AUTHENTICATED') for line in log.splitlines())
        report['encryptedCarrier'] = True
        checks['nativeEncryptedChannelAuthenticated'] = True
        click(initial, session_row)
        initial = wait(lambda values: any(by_id('product-composer')(row) and visible(row) for row in values), 'original native conversation')
        initial = replace_native(initial, 'product-composer', 'plugin-panel-draft')
    rows = settings(initial)
    rows = replace_native(rows, 'product-workspace-plugin-target', active['panelTargetPackage'])
    click(rows, by_id('product-workspace-plugins')); rows = standard_panel()
    report['realStandardPluginExecuted'] = True
    checks['nativePackageOpensStandardDevflowPanel'] = True
    screenshot('standard-plugin-native-entry')
    rows = seek_web(lambda row: row.get('type') == 'comboBoxSelect' and row.get('text') == '编排', 'standard mode selector')
    click(rows, lambda row: row.get('type') == 'comboBoxSelect' and row.get('text') == '编排')
    rows = wait(lambda values: any(row.get('type') == 'Option' and row.get('text') == '启用' and visible(row) for row in values), 'standard auto option')
    click(rows, lambda row: row.get('type') == 'Option' and row.get('text') == '启用')
    rows = seek_web(lambda row: row.get('type') == 'button' and row.get('text') == '保存', 'standard save')
    click(rows, lambda row: row.get('type') == 'button' and row.get('text') == '保存')
    rows = seek_web(lambda row: row.get('type') == 'status' and row.get('text') == '已保存', 'standard saved acknowledgement')
    checks['standardSettingsSaved'] = True; screenshot('standard-plugin-settings-saved')
    click(rows, by_id('product-workspace-back'))
    rows = wait(lambda values: any(by_id('product-composer')(row) and visible(row) for row in values), 'native conversation restored')
    if args.cipher:
        assert any(by_id('product-composer')(row) and row.get('text') == 'plugin-panel-draft' for row in rows)
    else:
        rows = replace_native(rows, 'product-composer', 'plugin-panel-draft')
    rows = settings(rows); click(rows, by_id('product-workspace-plugins')); rows = standard_panel()
    screenshot('standard-plugin-reopened')
    rows = seek_web(lambda row: row.get('type') == 'comboBoxSelect' and row.get('text') == '编排', 'reopened mode selector')
    click(rows, lambda row: row.get('type') == 'comboBoxSelect' and row.get('text') == '编排')
    rows = wait(lambda values: any(row.get('type') == 'Option' and row.get('text') == '启用' and visible(row) for row in values), 'reopened mode options')
    options = [row for row in rows if row.get('type') == 'Option' and visible(row)]
    report['reopenedModeOptions'] = [{'text': row.get('text'), 'selected': row.get('selected'), 'checked': row.get('checked')} for row in options]
    report['uiTestOptionSelectionAvailable'] = any(row.get('selected') == 'true' or row.get('checked') == 'true' for row in options)
    if report['uiTestOptionSelectionAvailable']:
        assert any(row.get('text') == '启用' and (row.get('selected') == 'true' or row.get('checked') == 'true') for row in options), report['reopenedModeOptions']
    else:
        report['optionValueVerification'] = 'Host settingsGet assertion plus separate review of standard-plugin-reopened.jpeg; UITest does not expose the selected option'
    checks['standardSettingsReopened'] = True
    click(rows, lambda row: row.get('type') == 'Option' and row.get('text') == '启用')
    rows = layout()
    click(rows, by_id('product-workspace-back'))
    rows = wait(lambda values: any(by_id('product-composer')(row) and row.get('text') == 'plugin-panel-draft' for row in values), 'native chat draft retained')
    checks['nativeChatDraftRetained'] = True; screenshot('native-chat-draft-retained')

try:
    assert call(['shell', 'param', 'get', 'const.product.name']) == 'emulator'
    verified = True
    report['before'] = metadata()
    call(['shell', 'aa', 'force-stop', bundle], check=False)
    assert 'success' in call(['install', '-r', str(hap)]).lower()
    report['after'] = metadata()
    assert report['before']['uid'] == report['after']['uid']
    if host:
        rule = 'tcp:18082 tcp:' + str(active['hostPort'])
        if args.cipher:
            client_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            try:
                client_http.open('http://127.0.0.1:' + str(active['hostPort']) + '/', timeout=5).close()
            except urllib.error.HTTPError as error:
                assert error.code == 403
                report['unauthenticatedStatus'] = error.code
                error.close()
            else:
                raise AssertionError('The isolated Host accepted an unauthenticated request')
        existing = call(['fport', 'ls'])
        if 'tcp:18082' in existing:
            assert rule in existing, 'Preserve a conflicting emulator forward'
        else:
            call(['rport', 'tcp:18082', 'tcp:' + str(active['hostPort'])]); forwarded = True
        assert rule in call(['fport', 'ls'])
    call(['shell', 'aa', 'start', '-b', bundle, '-a', 'EntryAbility'])
    if host:
        host_panel()
    elif args.startup_recovery:
        startup_recovery()
    else:
        rows = settings([])
        screenshot('native-plugin-input')
        rows = replace_native(rows, 'product-workspace-plugin-target', '@example/standard-plugin')
        click(rows, by_id('product-workspace-plugins'))
        rows = observed_target('@example/standard-plugin'); checks['nativePackageTargetAndSession'] = True
        screenshot('native-package-target')
        click(rows, lambda row: row.get('text') == 'Fail this view' and row.get('type') == 'button')
        rows = wait(lambda values: any(by_id('product-workspace-retry')(row) and visible(row) for row in values), 'controlled failure')
        screenshot('native-plugin-failed'); click(rows, by_id('product-workspace-retry'))
        rows = observed_target('@example/standard-plugin'); checks['retryPreservesTargetAndSession'] = True
        screenshot('native-plugin-retried')
        click(rows, by_id('product-workspace-back')); rows = settings(layout())
        click(rows, by_id('product-workspace-plugin-target'))
        call(['shell', 'uitest', 'uiInput', 'keyEvent', '2072', '2017'])
        call(['shell', 'uitest', 'uiInput', 'keyEvent', '2055'])
        rows = wait(lambda values: any(by_id('product-workspace-plugin-target')(row) and not row.get('text') for row in values), 'cleared target')
        rows = layout(); click(rows, by_id('product-workspace-plugins'))
        rows = observed_target('LIST'); checks['emptyTargetOpensPluginList'] = True
        screenshot('native-plugin-list-target')
        click(rows, by_id('product-workspace-back'))
        rows = wait(lambda values: any(by_id('product-chat-workspace')(row) and visible(row) for row in values), 'native chat restored')
        click(rows, by_id('product-chat-workspace')); observed_target('WORKSPACE')
        checks['normalWorkspaceDropsPluginTarget'] = True
        screenshot('native-normal-workspace')
    report['passed'] = True
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    if verified:
        call(['shell', 'aa', 'force-stop', bundle], check=False)
        report['stopped'] = call(['shell', 'pidof', bundle], check=False) == ''
        report['passed'] = report['passed'] and report['stopped']
    if forwarded:
        removed = call(['fport', 'rm', 'tcp:18082', 'tcp:' + str(active['hostPort'])], check=False)
        report['forwardRemoved'] = not re.search(r'\[Fail\]|\[Error\]', removed) and rule not in call(['fport', 'ls'], check=False)
        report['passed'] = report['passed'] and report['forwardRemoved']
    report.update({'checks': checks, 'commands': commands, 'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()})
    output = client / 'evidence' / ('workspace-plugin-target-native-' + str(time.time_ns()) + '.json')
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    if host:
        finish = host_world / ('finish-next-' + uuid.uuid4().hex + '.json')
        finish.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        os.link(finish, host_world / 'finish.json'); finish.unlink()
    print(json.dumps({'passed': report['passed'], 'evidence': str(output), 'checks': checks, 'stopped': report.get('stopped')}, ensure_ascii=False))
assert report['passed']
