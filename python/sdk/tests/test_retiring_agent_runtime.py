"""Verify late input through the Python SDK and the real SDK profile."""

import json
from pathlib import Path

import pytest

from deepseek_harness import RunResult
from test_commands_runtime import (
    _Completion, _SESSION_ID, _of_type, _read_events, _request_texts, _runtime,
)


@pytest.mark.parametrize("delivery", ["steer", "inject"])
def test_retiring_driver_delivers_late_input_through_python_sdk(tmp_path: Path, delivery: str) -> None:
    patch = tmp_path / "retiring.patch.yml"
    fixture = Path(__file__).with_name("retiring-agent-fixture.mjs").as_uri()
    patch.write_text(json.dumps([{"insert": [{
        "id": "retiring-agent-fixture", "name": fixture, "config": {"delivery": delivery},
    }]}]), encoding="utf-8")
    with _runtime(tmp_path, [_Completion("FIRST_REPLY"), _Completion("SECOND_REPLY")], capture_patch=patch) as runtime:
        session = runtime.harness.start_session(_SESSION_ID)
        result = runtime.call(session.run, "FIRST_INPUT")
        assert isinstance(result, RunResult)
        assert result.final_response == "SECOND_REPLY"
        requests = runtime.model.captured()
        assert len(requests) == 2
        assert "LATE_INPUT" in _request_texts(requests[1])
        assert [event["type"] for event in result.events if event["type"] in ("turn/start", "turn/end")] == [
            "turn/start", "turn/end", "turn/start", "turn/end",
        ]
    events = _read_events(runtime.logs)
    assert _of_type(events, "turn/start") == _of_type(result.events, "turn/start")
    assert _of_type(events, "turn/end") == _of_type(result.events, "turn/end")
