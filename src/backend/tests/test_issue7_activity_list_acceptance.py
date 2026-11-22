"""Acceptance coverage for Issue #7 activity listing and filters."""


def test_issue7_lists_activities_with_filters_and_pagination(client, register, make_activity):
    headers, _ = register("issue7_lister")
    make_activity(headers, sport="篮球", campus="旗山校区", title="Issue 7 篮球")
    make_activity(headers, sport="羽毛球", campus="铜盘校区", title="Issue 7 羽毛球")

    basketball = client.get("/activities", params={"sport": "篮球"})
    assert basketball.status_code == 200
    assert [item["title"] for item in basketball.json()] == ["Issue 7 篮球"]

    campus = client.get("/activities", params={"campus": "铜盘校区"})
    assert campus.status_code == 200
    assert [item["title"] for item in campus.json()] == ["Issue 7 羽毛球"]

    page = client.get("/activities", params={"limit": 1, "offset": 1})
    assert page.status_code == 200
    assert len(page.json()) == 1


def test_issue7_only_available_excludes_full_activity(client, register, make_activity):
    organizer_headers, _ = register("issue7_full_org")
    joiner_headers, _ = register("issue7_full_joiner")
    second_headers, _ = register("issue7_full_second")
    activity = make_activity(organizer_headers, capacity=2, title="Issue 7 满员")
    assert client.post(f"/activities/{activity['id']}/join", headers=joiner_headers).status_code == 201
    assert client.post(f"/activities/{activity['id']}/join", headers=second_headers).status_code == 201

    available = client.get("/activities", params={"only_available": "true"})
    assert available.status_code == 200
    assert activity["id"] not in {item["id"] for item in available.json()}
