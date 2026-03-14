from __future__ import annotations

from backend import devbot_ai


def test_collect_repo_files_falls_back_to_git_ls_files(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run_command(command: list[str], timeout: int = 120):
        calls.append(command)
        if command == ["rg", "--files"]:
            return 1, ""
        if command == ["git", "ls-files"]:
            return 0, "backend/devbot_ai.py\nmissing.txt"
        raise AssertionError(f"unexpected command: {command}")

    monkeypatch.setattr(devbot_ai, "run_command", fake_run_command)
    files = devbot_ai._collect_repo_files()

    assert calls[0] == ["rg", "--files"]
    assert calls[1] == ["git", "ls-files"]
    assert "backend/devbot_ai.py" in files
