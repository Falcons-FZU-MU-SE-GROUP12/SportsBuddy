"""Acceptance coverage for Issue #13 — my activities (S10).

Pins down the issue's acceptance criteria:
    - organised / joined are grouped into separate lists
    - status is correct
    - items carry an id the frontend can link to the detail page
"""

from __future__ import annotations


def test_issue13_organized_and_joined_are_grouped(client, register, make_activity):
    organizer_headers, _ = register("issue13_org")
    joiner_headers, _ = register("issue13_joiner")

    mine = make_activity(organizer_headers, title="Issue 13 我发起的", capacity=4)
    theirs = make_activity(joiner_headers, title="Issue 13 我报名的", capacity=4)
    joined = client.post(
        f"/activities/{theirs['id']}/join", headers=organizer_headers
    )
    assert joined.status_code == 201, joined.text

    grouped = client.get("/activities/mine", headers=organizer_headers).json()
    organized_ids = {item["id"] for item in grouped["organized"]}
    joined_ids = {item["id"] for item in grouped["joined"]}

    assert mine["id"] in organized_ids
    assert mine["id"] not in joined_ids
    assert theirs["id"] in joined_ids
    assert theirs["id"] not in organized_ids


def test_issue13_status_and_detail_id_present(client, register, make_activity):
    organizer_headers, _ = register("issue13_status_org")
    joiner_headers, _ = register("issue13_status_joiner")

    mine = make_activity(organizer_headers, title="Issue 13 状态验收", capacity=4)
    assert client.post(f"/activities/{mine['id']}/join", headers=joiner_headers).status_code == 201

    organized = client.get("/activities/mine", headers=organizer_headers).json()["organized"]
    assert organized, "organiser should see their own activity"
    item = organized[0]
    assert item["id"] == mine["id"]      # id is the detail-page link target
    assert item["status"] == "open"
    assert item["joined_count"] == 1

    joined = client.get("/activities/mine", headers=joiner_headers).json()["joined"]
    assert joined[0]["id"] == mine["id"]
    assert joined[0]["title"] == "Issue 13 状态验收"


def test_issue13_requires_authentication(client):
    assert client.get("/activities/mine").status_code == 401
