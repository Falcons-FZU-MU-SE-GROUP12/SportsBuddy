"""Acceptance coverage for Issue #14 — reviews after an activity (S11).

Pins down the issue's acceptance criteria:
    - only participants can review
    - stars and tags are saved
    - duplicate review prevented
"""

from __future__ import annotations


def _finished_activity(client, register, make_activity, prefix: str):
    """Organiser + one attending player + one no-show, attendance already recorded."""
    organizer_headers, organizer = register(f"{prefix}_org")
    a_headers, a = register(f"{prefix}_a")
    b_headers, b = register(f"{prefix}_b")
    activity = make_activity(organizer_headers, title=f"{prefix} 评价验收", capacity=4)

    for headers in (a_headers, b_headers):
        assert client.post(f"/activities/{activity['id']}/join", headers=headers).status_code == 201

    marked = client.post(
        f"/activities/{activity['id']}/attendance",
        headers=organizer_headers,
        json=[a["id"]],
    )
    assert marked.status_code == 200, marked.text
    return organizer_headers, organizer, a_headers, a, b_headers, b, activity


def test_issue14_stars_and_tags_saved(client, register, make_activity):
    (
        _org_headers,
        organizer,
        a_headers,
        _a,
        _b_headers,
        _b,
        activity,
    ) = _finished_activity(client, register, make_activity, "issue14_save")

    review = client.post(
        f"/activities/{activity['id']}/reviews",
        headers=a_headers,
        json={
            "reviewee_id": organizer["id"],
            "score": 5,
            "tags": ["准时", "好相处"],
            "comment": "组织得很到位",
        },
    )
    assert review.status_code == 201, review.text
    body = review.json()
    assert body["score"] == 5
    assert body["tags"] == ["准时", "好相处"]
    assert body["reviewee_id"] == organizer["id"]


def test_issue14_duplicate_review_prevented(client, register, make_activity):
    (
        _org_headers,
        organizer,
        a_headers,
        _a,
        _b_headers,
        _b,
        activity,
    ) = _finished_activity(client, register, make_activity, "issue14_dup")

    first = client.post(
        f"/activities/{activity['id']}/reviews",
        headers=a_headers,
        json={"reviewee_id": organizer["id"], "score": 5},
    )
    assert first.status_code == 201

    again = client.post(
        f"/activities/{activity['id']}/reviews",
        headers=a_headers,
        json={"reviewee_id": organizer["id"], "score": 1},
    )
    assert again.status_code == 409
    assert "已经评价" in again.json()["detail"]


def test_issue14_only_attended_participants_can_review(client, register, make_activity):
    (
        _org_headers,
        organizer,
        _a_headers,
        _a,
        b_headers,
        _b,
        activity,
    ) = _finished_activity(client, register, make_activity, "issue14_only")

    # The no-show player never attended -> cannot review.
    no_show_review = client.post(
        f"/activities/{activity['id']}/reviews",
        headers=b_headers,
        json={"reviewee_id": organizer["id"], "score": 5},
    )
    assert no_show_review.status_code == 403
    assert "到场" in no_show_review.json()["detail"]

    # A total stranger who never joined -> cannot review either.
    stranger_headers, _ = register("issue14_only_stranger")
    stranger_review = client.post(
        f"/activities/{activity['id']}/reviews",
        headers=stranger_headers,
        json={"reviewee_id": organizer["id"], "score": 5},
    )
    assert stranger_review.status_code == 403
