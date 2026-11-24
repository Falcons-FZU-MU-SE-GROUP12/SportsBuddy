"""Acceptance coverage for Issue #8 — activity detail page (S5).

Pins down the issue's acceptance criteria:
    - detail loads by id
    - participant list and status visible
    - organiser sees the management entry (check-in code), others do not
"""

from __future__ import annotations


def test_issue8_detail_loads_by_id(client, register, make_activity):
    organizer_headers, _ = register("issue8_det_org")
    activity = make_activity(
        organizer_headers, title="Issue 8 详情验收", capacity=6, hours=30
    )

    detail = client.get(f"/activities/{activity['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["id"] == activity["id"]
    assert body["title"] == "Issue 8 详情验收"
    assert body["sport"] == "篮球"
    assert body["status"] == "open"
    assert body["capacity"] == 6
    assert body["joined_count"] == 0
    assert body["slots_left"] == 6
    assert body["organizer"]["nickname"] == "issue8_det_org-昵称"


def test_issue8_participants_and_counts_visible(client, register, make_activity):
    organizer_headers, _ = register("issue8_part_org")
    joiner_headers, joiner = register("issue8_part_joiner")
    activity = make_activity(organizer_headers, title="Issue 8 名单验收", capacity=4)

    joined = client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    assert joined.status_code == 201, joined.text

    detail = client.get(f"/activities/{activity['id']}").json()
    assert detail["joined_count"] == 1
    assert detail["slots_left"] == 3

    assert len(detail["participants"]) == 1
    participant = detail["participants"][0]
    assert participant["user_id"] == joiner["id"]
    assert participant["nickname"] == "issue8_part_joiner-昵称"
    assert participant["status"] == "registered"


def test_issue8_full_status_reflected_in_detail(client, register, make_activity):
    organizer_headers, _ = register("issue8_full_org")
    joiner_headers, _ = register("issue8_full_j1")
    second_headers, _ = register("issue8_full_j2")
    activity = make_activity(organizer_headers, title="Issue 8 满员验收", capacity=2)

    for headers in (joiner_headers, second_headers):
        joined = client.post(f"/activities/{activity['id']}/join", headers=headers)
        assert joined.status_code == 201, joined.text

    detail = client.get(f"/activities/{activity['id']}").json()
    assert detail["status"] == "full"
    assert detail["joined_count"] == 2
    assert detail["slots_left"] == 0
    assert len(detail["participants"]) == 2


def test_issue8_only_organizer_sees_checkin_code(client, register, make_activity):
    organizer_headers, _ = register("issue8_code_org")
    joiner_headers, _ = register("issue8_code_joiner")
    activity = make_activity(organizer_headers, title="Issue 8 签到码验收")

    organizer_detail = client.get(
        f"/activities/{activity['id']}", headers=organizer_headers
    ).json()
    assert organizer_detail["checkin_code"], "organiser must see the check-in code"

    joiner_detail = client.get(
        f"/activities/{activity['id']}", headers=joiner_headers
    ).json()
    assert joiner_detail["checkin_code"] is None

    anonymous_detail = client.get(f"/activities/{activity['id']}").json()
    assert anonymous_detail["checkin_code"] is None
