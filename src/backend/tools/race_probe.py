"""Concurrency regression probe for POST /activities/{id}/join (DEF-01).

The "check capacity -> insert" race (DEF-01) is fixed: SQLite transactions now
open with ``BEGIN IMMEDIATE`` and the join re-reads the head count under that
lock, so an activity can no longer be over-subscribed.

The in-process TestClient serialises everything through one SQLite connection,
so it cannot exercise concurrency. This probe therefore starts a real uvicorn
server on a temporary file-backed database and fires N simultaneous sign-ups at
an activity whose capacity is 2 (the API's smallest legal slot count).

Exit code 0  -> capacity held, no over-subscription (fix verified)
Exit code 1  -> OVER-SUBSCRIPTION observed (regression)
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
PORT = 8123
BASE = f"http://{HOST}:{PORT}"
COMPETITORS = 12
CAPACITY = 2   # the API rejects capacity < 2, so 2 is the smallest legal slot count


def wait_for_health(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError("server did not become healthy in time")


def call(method: str, path: str, token: str | None = None, payload=None):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            parsed = json.loads(body or b"{}")
        except json.JSONDecodeError:
            parsed = {"raw": body.decode(errors="replace")}
        return error.code, parsed


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def main() -> int:
    tmpdir = tempfile.mkdtemp(prefix="raceprobe_")
    db_file = Path(tmpdir) / "race.db"
    env = dict(os.environ)
    env["SPORTMATE_DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"

    port = free_port()
    global BASE
    BASE = f"http://{HOST}:{port}"

    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", HOST, "--port", str(port)],
        cwd=BACKEND,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    try:
        wait_for_health()

        organizer = call("POST", "/auth/register", payload={
            "username": "race_org", "password": "secret123", "nickname": "组织者",
        })[1]["access_token"]
        start = (datetime.now(UTC) + timedelta(hours=24)).isoformat()
        end = (datetime.now(UTC) + timedelta(hours=26)).isoformat()
        status, activity = call("POST", "/activities", organizer, {
            "title": "竞态测试局", "sport": "篮球", "campus": "旗山校区",
            "location": "风雨操场", "start_time": start, "end_time": end,
            "capacity": CAPACITY,
        })
        if status != 201:
            print(f"[setup] 创建活动失败: {status} {activity}")
            return 2
        activity_id = activity["id"]

        tokens = []
        for index in range(COMPETITORS):
            token = call("POST", "/auth/register", payload={
                "username": f"race_p{index}", "password": "secret123",
                "nickname": f"抢位者{index}",
            })[1]["access_token"]
            tokens.append(token)

        # Fire all sign-ups at the same instant: a barrier keeps them aligned.
        barrier = __import__("threading").Barrier(COMPETITORS)

        def join(token: str):
            barrier.wait()
            return call("POST", f"/activities/{activity_id}/join", token)[0]

        with ThreadPoolExecutor(max_workers=COMPETITORS) as pool:
            results = list(pool.map(join, tokens))

        created = results.count(201)
        detail = call("GET", f"/activities/{activity_id}")[1]
        print(f"容量 capacity       : {CAPACITY}")
        print(f"并发报名线程数      : {COMPETITORS}")
        print(f"返回 201 的数量     : {created}")
        print(f"接口返回值分布      : {results}")
        print(f"joined_count (实况) : {detail.get('joined_count')}")
        print(f"slots_left   (实况) : {detail.get('slots_left')}")

        if created > CAPACITY or detail.get("joined_count", 0) > CAPACITY:
            print("\n结果: 复现超员 —— 容量被突破，竞态窗口真实存在。")
            return 1
        print("\n结果: 本次未复现超员（容量守住了，但窗口可能只是没被撞到）。")
        return 0
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    raise SystemExit(main())
