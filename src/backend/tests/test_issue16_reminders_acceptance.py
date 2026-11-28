"""Acceptance coverage for Issue #16 — simplified in-app reminders (S13).

Pins down the issue's acceptance criteria:
    - reminder listed for upcoming activities
    - no reminder for cancelled activities
"""

from __future__ import annotations


def test_issue16_lists_upcoming_activities_with_message(client, register, make_activity):
    organizer_headers, _ = register("issue16_org")
    joiner_headers, _ = register("issue16_joiner")
    make_activity(organizer_headers, title="Issue16 我发起的", hours=24)
    joined = make_activity(organizer_headers, title="Issue16 我报名的", hours=8)
    joined_resp = client.post(
        f"/activities/{joined['id']}/join", headers=joiner_headers
    )
    assert joined_resp.status_code == 201, joined_resp.text

    reminders = client.get("/reminders", headers=joiner_headers).json()
    titles = [item["activity"]["title"] for item in reminders]
    assert titles == ["Issue16 我报名的"], "joiner should see only the activity they joined"
    assert reminders[0]["message"]
    assert reminders[0]["starts_in_minutes"] >= 0

    # Organiser sees both, ordered by soonest start first.
    org_reminders = client.get("/reminders", headers=organizer_headers).json()
    org_titles = [item["activity"]["title"] for item in org_reminders]
    assert org_titles == ["Issue16 我报名的", "Issue16 我发起的"]


def test_issue16_excludes_cancelled_activities(client, register, make_activity):
    organizer_headers, _ = register("issue16_cancel_org")
    joiner_headers, _ = register("issue16_cancel_joiner")
    activity = make_activity(organizer_headers, title="Issue16 已取消", hours=24)
    joined_resp = client.post(
        f"/activities/{activity['id']}/join", headers=joiner_headers
    )
    assert joined_resp.status_code == 201, joined_resp.text

    cancelled = client.post(f"/activities/{activity['id']}/cancel", headers=organizer_headers)
    assert cancelled.status_code == 200, cancelled.text

    for headers in (organizer_headers, joiner_headers):
        reminders = client.get("/reminders", headers=headers).json()
        titles = [item["activity"]["title"] for item in reminders]
        assert "Issue16 已取消" not in titles


def test_issue16_requires_authentication(client):
    assert client.get("/reminders").status_code == 401
