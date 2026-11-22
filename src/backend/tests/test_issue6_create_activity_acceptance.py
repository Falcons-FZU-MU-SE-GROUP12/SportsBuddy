"""Acceptance coverage for Issue #6 activity creation."""

from datetime import UTC, datetime, timedelta


def test_issue6_create_activity_returns_created_activity_and_private_code(
    client, register, make_activity
):
    organizer_headers, _ = register("issue6_org")
    visitor_headers, _ = register("issue6_visitor")
    activity = make_activity(organizer_headers, title="Issue 6 验收活动", hours=12)

    assert activity["title"] == "Issue 6 验收活动"
    assert activity["status"] == "open"
    assert activity["capacity"] == 4
    assert activity["slots_left"] == 4

    organizer_detail = client.get(
        f"/activities/{activity['id']}", headers=organizer_headers
    )
    assert organizer_detail.status_code == 200
    assert organizer_detail.json()["checkin_code"]

    visitor_detail = client.get(
        f"/activities/{activity['id']}", headers=visitor_headers
    )
    assert visitor_detail.status_code == 200
    assert visitor_detail.json()["checkin_code"] is None


def test_issue6_rejects_invalid_time_window(client, register):
    headers, _ = register("issue6_validator")
    start = datetime.now(UTC) + timedelta(hours=5)
    end = start - timedelta(hours=2)
    response = client.post(
        "/activities",
        headers=headers,
        json={
            "title": "时间错误活动",
            "sport": "篮球",
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
        },
    )
    assert response.status_code == 422
