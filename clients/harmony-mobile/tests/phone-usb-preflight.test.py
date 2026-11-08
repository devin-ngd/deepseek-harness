"""Exercise the field phone entry point with a substituted HDC process."""

from contextlib import redirect_stdout
from hashlib import sha256
from io import StringIO
import json
from pathlib import Path
import runpy
from subprocess import CompletedProcess, TimeoutExpired
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch


PHONE = Path(__file__).resolve().parents[1] / 'handoff/deploy-rc235-20261104/phone.py'
ORIGINAL = 'synthetic-original-usb'
OTHER = 'synthetic-other-usb'
COLLISION = 'synthetic-colliding-usb'
LIST = ['-p', '-s', '127.0.0.1:8710', 'list', 'targets', '-v']


def test_fingerprint(data):
    if data in (ORIGINAL.encode(), COLLISION.encode()):
        return SimpleNamespace(hexdigest=lambda: '54cfb7ac' + '0' * 56)
    return sha256(data)


def result(output, status=0, error=''):
    return CompletedProcess([], status, stdout=output, stderr=error)


class PhoneUsbPreflightTest(unittest.TestCase):
    def invoke(self, args, responses, expected_exception=None):
        stdout = StringIO()
        with (patch.object(sys, 'argv', [str(PHONE), *args]), patch('hashlib.sha256', side_effect=test_fingerprint),
              patch('subprocess.run', side_effect=responses) as hdc, redirect_stdout(stdout)):
            if expected_exception is None:
                runpy.run_path(str(PHONE), run_name='__main__')
                error = None
            else:
                with self.assertRaises(expected_exception) as caught:
                    runpy.run_path(str(PHONE), run_name='__main__')
                error = caught.exception
        output = stdout.getvalue()
        for private in (ORIGINAL, OTHER, COLLISION):
            self.assertNotIn(private, output)
            self.assertNotIn(private, str(error))
        return output, error, hdc.call_args_list

    def assert_preflight(self, response, status):
        output, error, calls = self.invoke(['usb-preflight'], [response], SystemExit)
        ready = status == 'ready'
        self.assertEqual(error.code, 0 if ready else 2)
        self.assertEqual(json.loads(output), {'status': status, 'usbReady': ready})
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].args[0][1:], LIST)
        self.assertEqual(calls[0].kwargs['timeout'], 6)

    def test_original_usb_connected_with_emulator(self):
        self.assert_preflight(result(f'{ORIGINAL}\tUSB\tConnected\tprivate\n{OTHER} USB Offline\n127.0.0.1:5555 TCP Connected'), 'ready')

    def test_original_usb_offline_with_other_connected_targets(self):
        self.assert_preflight(result(f'{ORIGINAL} USB Offline\n{OTHER} USB Connected\n127.0.0.1:5555 TCP Connected'), 'usb-offline')

    def test_original_over_tcp_cannot_qualify(self):
        self.assert_preflight(result(f'{ORIGINAL} TCP Connected'), 'target-missing')

    def test_unrelated_usb_cannot_qualify(self):
        self.assert_preflight(result(f'{OTHER} USB Connected'), 'target-missing')

    def test_empty_hdc_list(self):
        self.assert_preflight(result('[Empty]'), 'target-missing')

    def test_missing_or_malformed_rows(self):
        for output in ('', 'unrecognized', f'{ORIGINAL} USB\n{OTHER} USB Connected'):
            with self.subTest(output=output):
                self.assert_preflight(result(output), 'invalid-target-list')

    def test_multiple_connected_usb_targets(self):
        self.assert_preflight(result(f'{ORIGINAL} USB Connected\n{OTHER} USB Connected'), 'ambiguous-usb')

    def test_colliding_references_are_refused(self):
        self.assert_preflight(result(f'{ORIGINAL} USB Connected\n{COLLISION} USB Offline'), 'ambiguous-usb')

    def test_other_usb_status_cannot_qualify(self):
        self.assert_preflight(result(f'{ORIGINAL} USB Unauthorized'), 'usb-not-ready')

    def test_hdc_failures_are_redacted(self):
        for response in (result(ORIGINAL, 1, OTHER), result(f'{ORIGINAL} USB Connected', error='[Error] ' + OTHER),
                         TimeoutExpired(['hdc'], 6, output=ORIGINAL), FileNotFoundError(ORIGINAL)):
            with self.subTest(error_type=type(response).__name__):
                self.assert_preflight(response, 'hdc-unavailable')

    def test_extra_arguments_never_reach_hdc(self):
        output, error, calls = self.invoke(['usb-preflight', 'extra'], [], SystemExit)
        self.assertEqual(output, '')
        self.assertEqual(error.code, 'usb-preflight takes no arguments')
        self.assertEqual(calls, [])

    def test_field_check_revalidates_the_target_before_any_device_command(self):
        output, error, calls = self.invoke(['check'], [result(f'{ORIGINAL} USB Offline')], AssertionError)
        self.assertEqual(output, '')
        self.assertIn('usb-offline', str(error))
        self.assertEqual([call.args[0][1:] for call in calls], [LIST])

    def test_field_check_uses_the_matched_usb_target(self):
        output, _, calls = self.invoke(['check'], [result(f'{ORIGINAL} USB Connected'), result('CMM-AL10'), result('26'),
                                                  result('{"versionName":"0.0.0-rc2.53","versionCode":2,"applicationInfo":{"uid":20020297}}'), result('8192')])
        self.assertEqual(json.loads(output), {'model': 'CMM-AL10', 'api': '26', 'pid': '8192',
                                             'metadata': {'versionName': '0.0.0-rc2.53', 'versionCode': 2, 'uid': 20020297}})
        self.assertEqual(calls[0].args[0][1:], LIST)
        self.assertEqual(len(calls), 5)
        for call in calls[1:]:
            self.assertEqual(call.args[0][1:6], [*LIST[:3], '-t', ORIGINAL])

    def test_existing_capture_runner_can_load_the_phone_helper(self):
        source, marker, _ = PHONE.read_text(encoding='utf-8').partition('\ncmd=sys.argv[1];args=sys.argv[2:]')
        self.assertTrue(marker)
        namespace = {'__file__': str(PHONE)}
        with (patch.object(sys, 'argv', ['field-capture', 'usb-preflight']), patch('hashlib.sha256', side_effect=test_fingerprint),
              patch('subprocess.run', return_value=result(f'{ORIGINAL} USB Connected')) as hdc):
            exec(compile(source, str(PHONE), 'exec'), namespace)
        self.assertEqual(namespace['serial'], ORIGINAL)
        self.assertTrue(callable(namespace['dev']))
        self.assertEqual([call.args[0][1:] for call in hdc.call_args_list], [LIST])


if __name__ == '__main__':
    unittest.main()
