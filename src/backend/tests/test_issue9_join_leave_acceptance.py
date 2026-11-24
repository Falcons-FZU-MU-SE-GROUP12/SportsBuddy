"""Acceptance coverage for Issue #9 — sign up / cancel sign-up (S6).

Pins down the issue's acceptance criteria:
    - join updates status
    - full activity cannot be joined
    - credit below 60 cannot join
    - cancel works before start
"""

from __future__ import annotations


def test_issue9_join_updates_status_and_slot_counts(client, register, make_activity):
    organizer_headers, _ = register("issue9_join_org")
    joiner_headers, _ = register("issue9_join_user")
    activity = make_activity(organizer_headers, title="Issue 9 报名验收", capacity=4)

    joined = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert joined.status_code == 201, joined.text
    registration = joined.json()
    assert registration["status"] == "registered"
    assert registration["activity_id"] == activity["id"]

    detail = client.get(f"/activities/{activity['id']}").json()
    assert detail["joined_count"] == 1
    assert detail["slots_left"] == 3
    assert detail["status"] == "open"


def test_issue9_duplicate_and_organizer_join_rejected(client, register, make_activity):
    organizer_headers, _ = register("issue9_dup_org")
    joiner_headers, _ = register("issue9_dup_user")
    activity = make_activity(organizer_headers, title="Issue 9 重复报名")

    joined = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert joined.status_code == 201

    again = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert again.status_code == 409
    assert "已经报名" in again.json()["detail"]

    organizer_join = client.post(
        f"/activities/{activity['id']}/join", headers=organizer_headers
    )
    assert organizer_join.status_code == 400
    assert "发起人" in organizer_join.json()["detail"]


def test_issue9_full_activity_cannot_be_joined(client, register, make_activity):
    organizer_headers, _ = register("issue9_full_org")
    first_headers, _ = register("issue9_full_j1")
    second_headers, _ = register("issue9_full_j2")
    late_headers, _ = register("issue9_full_late")
    activity = make_activity(organizer_headers, title="Issue 9 满员拦截", capacity=2)

    for headers in (first_headers, second_headers):
        joined = client.post(f"/activities/{activity['id']}/join", headers=headers)
        assert joined.status_code == 201, joined.text

    blocked = client.post(f"/activities/{activity['id']}/join", headers=late_headers)
    assert blocked.status_code == 409
    assert "满员" in blocked.json()["detail"]

    detail = client.get(f"/activities/{activity['id']}").json()
    assert detail["status"] == "full"
    assert detail["joined_count"] == 2


def test_issue9_low_credit_cannot_join(client, register, make_activity):
    organizer_headers, _ = register("issue9_low_org")
    low_headers, _ = register("issue9_low_user")
    for index in range(3):  # three no-shows: 80 -> 50, below the join threshold
        activity = make_activity(organizer_headers, title=f"Issue 9 爽约局 {index}")
        assert (
            client.post(f"/activities/{activity['id']}/join", headers=low_headers)
            .status_code
            == 201
        )
        marked = client.post(
            f"/activities/{activity['id']}/attendance", headers=organizer_headers, json=[]
        )
        assert marked.status_code == 200, marked.text

    blocked = client.post(
        f"/activities/{make_activity(organizer_headers, title='Issue 9 拦截局')['id']}/join",
        headers=low_headers,
    )
    assert blocked.status_code == 403
    assert "信用分" in blocked.json()["detail"]


def test_issue9_cancel_before_start_frees_slot_and_allows_rejoin(
    client, register, make_activity
):
    organizer_headers, _ = register("issue9_cancel_org")
    joiner_headers, joiner = register("issue9_cancel_user")
    activity = make_activity(organizer_headers, title="Issue 9 取消验收", hours=48)

    joined = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert joined.status_code == 201

    left = client.delete(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert left.status_code == 200, left.text
    registration = left.json()
    assert registration["status"] == "cancelled"
    assert registration["is_late_cancel"] is False  # 48h ahead: no penalty

    detail = client.get(f"/activities/{activity['id']}").json()
    assert detail["joined_count"] == 0
    assert detail["slots_left"] == activity["capacity"]
    assert detail["status"] == "open"

    # Early cancellation is neutral, and the freed slot can be taken again.
    me = client.get("/me", headers=joiner_headers).json()
    assert me["reliability_score"] == 80
    rejoined = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert rejoined.status_code == 201
    assert rejoined.json()["user_id"] == joiner["id"]
