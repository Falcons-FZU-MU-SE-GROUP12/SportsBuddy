"""Acceptance coverage for Issue #11 — check-in by code or location (S8).

Pins down the issue's acceptance criteria:
    - code check-in succeeds
    - duplicate / unregistered cases show clear messages
    - location rule enforced
"""

from __future__ import annotations


def test_issue11_code_checkin_succeeds(client, register, make_activity):
    organizer_headers, _ = register("issue11_code_org")
    joiner_headers, _ = register("issue11_code_user")
    activity = make_activity(organizer_headers, title="Issue 11 签到码验收")
    client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)

    code = client.get(
        f"/activities/{activity['id']}", headers=organizer_headers
    ).json()["checkin_code"]

    checked = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=joiner_headers,
        json={"code": code},
    )
    assert checked.status_code == 200, checked.text
    body = checked.json()
    assert body["success"] is True
    assert body["method"] == "code"
    assert body["registration"]["status"] == "checked_in"


def test_issue11_unregistered_checkin_rejected(client, register, make_activity):
    organizer_headers, _ = register("issue11_unreg_org")
    stranger_headers, _ = register("issue11_unreg_stranger")
    activity = make_activity(organizer_headers, title="Issue 11 未报名验收")
    code = client.get(
        f"/activities/{activity['id']}", headers=organizer_headers
    ).json()["checkin_code"]

    checked = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=stranger_headers,
        json={"code": code},
    )
    assert checked.status_code == 404
    assert "还没有报名" in checked.json()["detail"]


def test_issue11_duplicate_checkin_rejected(client, register, make_activity):
    organizer_headers, _ = register("issue11_dup_org")
    joiner_headers, _ = register("issue11_dup_user")
    activity = make_activity(organizer_headers, title="Issue 11 重复签到验收")
    client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)
    code = client.get(
        f"/activities/{activity['id']}", headers=organizer_headers
    ).json()["checkin_code"]

    first = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=joiner_headers,
        json={"code": code},
    )
    assert first.status_code == 200

    again = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=joiner_headers,
        json={"code": code},
    )
    assert again.status_code == 409
    assert "已经签到" in again.json()["detail"]


def test_issue11_location_rule_enforced(client, register, make_activity):
    organizer_headers, _ = register("issue11_geo_org")
    joiner_headers, _ = register("issue11_geo_user")
    activity = make_activity(
        organizer_headers,
        title="Issue 11 定位围栏验收",
        latitude=26.0565,
        longitude=119.1966,
    )
    client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)

    too_far = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=joiner_headers,
        json={"latitude": 26.0700, "longitude": 119.1966},  # ~1.5 km away
    )
    assert too_far.status_code == 403
    assert "超出" in too_far.json()["detail"]

    on_site = client.post(
        f"/activities/{activity['id']}/checkin",
        headers=joiner_headers,
        json={"latitude": 26.0566, "longitude": 119.1967},
    )
    assert on_site.status_code == 200, on_site.text
    assert on_site.json()["method"] == "geo"
    assert on_site.json()["distance_m"] is not None
