"""Acceptance coverage for Issue #12 — manage activity / attendance (S9).

Pins down the issue's acceptance criteria:
    - organiser can tick attendees
    - no-show reduces credit
    - only organiser has access
"""

from __future__ import annotations


def test_issue12_organizer_ticks_attendees(client, register, make_activity):
    organizer_headers, _ = register("issue12_tick_org")
    a_headers, a = register("issue12_tick_a")
    b_headers, b = register("issue12_tick_b")
    activity = make_activity(organizer_headers, title="Issue 12 考勤验收", capacity=4)
    for headers in (a_headers, b_headers):
        assert client.post(f"/activities/{activity['id']}/join", headers=headers).status_code == 201

    result = client.post(
        f"/activities/{activity['id']}/attendance",
        headers=organizer_headers,
        json=[a["id"]],
    )
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["attended"] == [a["id"]]
    assert body["no_show"] == [b["id"]]
    assert body["activity_id"] == activity["id"]


def test_issue12_no_show_reduces_credit(client, register, make_activity):
    organizer_headers, _ = register("issue12_credit_org")
    a_headers, a = register("issue12_credit_a")
    b_headers, _ = register("issue12_credit_b")
    activity = make_activity(organizer_headers, title="Issue 12 扣分验收")
    for headers in (a_headers, b_headers):
        assert client.post(f"/activities/{activity['id']}/join", headers=headers).status_code == 201

    marked = client.post(
        f"/activities/{activity['id']}/attendance",
        headers=organizer_headers,
        json=[a["id"]],
    )
    assert marked.status_code == 200, marked.text

    attended_me = client.get("/me", headers=a_headers).json()
    assert attended_me["reliability_score"] == 82  # 80 + 2
    no_show_me = client.get("/me", headers=b_headers).json()
    assert no_show_me["reliability_score"] == 70  # 80 - 10
    assert no_show_me["no_show_count"] == 1


def test_issue12_only_organizer_has_access(client, register, make_activity):
    organizer_headers, _ = register("issue12_auth_org")
    joiner_headers, joiner = register("issue12_auth_joiner")
    activity = make_activity(organizer_headers, title="Issue 12 权限验收")
    client.post(f"/activities/{activity['id']}/join", headers=joiner_headers)

    forbidden = client.post(
        f"/activities/{activity['id']}/attendance",
        headers=joiner_headers,
        json=[joiner["id"]],
    )
    assert forbidden.status_code == 403
    assert "发起人" in forbidden.json()["detail"]
