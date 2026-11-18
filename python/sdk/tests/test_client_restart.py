from __future__ import annotations

import sys
import threading
from queue import Queue
from pathlib import Path

import pytest

from deepseek_harness import HarnessClient, HarnessConfig
from deepseek_harness.errors import TransportClosedError


@pytest.mark.parametrize("drain_first_run", [False, True])
def test_restarted_client_only_delivers_current_runtime_messages(
    tmp_path: Path, drain_first_run: bool, monkeypatch: pytest.MonkeyPatch,
) -> None:
    script = tmp_path / "runtime.py"
    counter = tmp_path / "generation.txt"
    script.write_text(
        """
import json
import os
import sys
from pathlib import Path

counter = Path(os.environ["COUNTER"])
generation = int(counter.read_text()) + 1 if counter.exists() else 1
counter.write_text(str(generation))
for line in sys.stdin:
    message = json.loads(line)
    if message.get("method") == "initialize":
        print(json.dumps({"jsonrpc": "2.0", "method": "runtime.ready", "params": {"generation": generation}}), flush=True)
        print(json.dumps({"jsonrpc": "2.0", "id": "approval", "method": "approval/request", "params": {"generation": generation}}), flush=True)
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": {"serverInfo": {"name": "test"}}}), flush=True)
    elif message.get("method") == "shutdown":
        print(json.dumps({"jsonrpc": "2.0", "id": message["id"], "result": {}}), flush=True)
        break
""".strip(),
        encoding="utf-8",
    )
    client = HarnessClient(HarnessConfig(env={"COUNTER": str(counter)}), _launch_args=(sys.executable, str(script)))
    threads: list[threading.Thread] = []
    outcomes: Queue[object] = Queue()
    try:
        client.start()
        client.initialize(cwd=str(tmp_path), provider="fixture", model="fixture")
        if drain_first_run:
            assert client.next_notification().payload["generation"] == 1
            assert client.next_request().payload["generation"] == 1
            for source, operation in ((client._notifications, client.next_notification), (client._requests, client.next_request)):
                ready = threading.Event()
                get = source.get

                def watched_get(*args: object, _get=get, _ready=ready, **kwargs: object) -> object:
                    _ready.set()
                    return _get(*args, **kwargs)

                monkeypatch.setattr(source, "get", watched_get)

                def wait(operation=operation) -> None:
                    try:
                        outcomes.put(operation())
                    except BaseException as error:
                        outcomes.put(error)

                thread = threading.Thread(target=wait, daemon=True)
                threads.append(thread)
                thread.start()
                assert ready.wait(timeout=5)
        client.close()
        for thread in threads:
            thread.join(timeout=5)
            assert not thread.is_alive()
            assert isinstance(outcomes.get_nowait(), TransportClosedError)

        client.start()
        client.initialize(cwd=str(tmp_path), provider="fixture", model="fixture")
        assert client.next_notification().payload["generation"] == 2
        assert client.next_request().payload["generation"] == 2
    finally:
        client.close()
        for thread in threads:
            thread.join(timeout=5)


@pytest.mark.parametrize("thread_attribute", ["_reader_thread", "_stderr_thread"])
def test_restart_refuses_to_overlap_a_previous_runtime_reader(thread_attribute: str) -> None:
    release = threading.Event()
    previous_reader = threading.Thread(target=release.wait, daemon=True)
    previous_reader.start()
    client = HarnessClient()
    setattr(client, thread_attribute, previous_reader)
    try:
        with pytest.raises(TransportClosedError, match="streams are still closing"):
            client.start()
    finally:
        release.set()
        previous_reader.join(timeout=5)
    assert not previous_reader.is_alive()
