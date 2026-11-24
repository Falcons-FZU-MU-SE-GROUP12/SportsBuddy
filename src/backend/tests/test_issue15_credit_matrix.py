"""Acceptance matrix for Issue #15 — credit score rules (Alpha Sprint, tester-side).

Every rule in the issue's acceptance criteria is pinned down by at least one
assertion here, so a future refactor cannot silently change the policy.

Rules under test (config.py):
    RELIABILITY_INITIAL          = 80
    RELIABILITY_COMPLETED_DELTA  = +2   (successful check-in)
    RELIABILITY_LATE_CANCEL_DELTA= -2   (cancel inside the 120-minute window)
    RELIABILITY_NO_SHOW_DELTA    = -10  (organiser attendance marks a no-show)
    range                        = [0, 100]
    RELIABILITY_JOIN_THRESHOLD   = 60   (below this, joining is blocked)
"""

from __future__ import annotations


# --------------------------------------------------------------------------- #
# R1 / R2 — initial value and the +2 for a successful check-in
# --------------------------------------------------------------------------- #
def test_r1_new_account_starts_at_80(client, register):
    _headers, me = register("m15_new")
    assert me["reliability_score"] == 80
    assert me["completed_count"] == 0
    assert me["no_show_count"] == 0


def _checkin(client, make_activity, org_headers, p_headers, title: str, hours: float = 24):
    """One existing player joins an activity and checks in with the organiser's code."""
    activity = make_activity(org_headers, title=title, hours=hours)
    joined = client.post(f"/activities/{activity['id']}/join", headers=p_headers)
    assert joined.status_code == 201, joined.text
    code = client.get(f"/activities/{activity['id']}", headers=org_headers).json()["checkin_code"]
    checked = client.post(
        f"/activities/{activity['id']}/checkin", headers=p_headers, json={"code": code}
    )
    assert checked.status_code == 200, checked.text
    return activity


def test_r2_checkin_adds_two_points(client, register, make_activity):
    org_headers, _org = register("m15_ck_org")
    p_headers, _p = register("m15_ck_p")
    _checkin(client, make_activity, org_headers, p_headers, "签到局")
    me = client.get("/me", headers=p_headers).json()
    assert me["reliability_score"] == 82
    # completed_count tracks *confirmed* attendance (services.py), not a raw check-in.
    assert me["completed_count"] == 0


# --------------------------------------------------------------------------- #
# R3 — attendance confirmation must not re-apply the +2
# --------------------------------------------------------------------------- #
def test_r3_attendance_does_not_double_count_checkin(client, register, make_activity):
    org_headers, _org = register("m15_dc_org")
    p_headers, p = register("m15_dc_p")
    activity = _checkin(client, make_activity, org_headers, p_headers, "重复计分局")
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 82

    attendance = client.post(
        f"/activities/{activity['id']}/attendance", headers=org_headers, json=[p["id"]]
    )
    assert attendance.status_code == 200, attendance.text

    me = client.get("/me", headers=p_headers).json()
    assert me["reliability_score"] == 82, "check-in +2 must be counted once only"
    assert me["completed_count"] == 1


# --------------------------------------------------------------------------- #
# R4 / R5 — cancellation window (120 minutes)
# --------------------------------------------------------------------------- #
def test_r4_late_cancel_costs_two(client, register, make_activity):
    org_headers, _org = register("m15_late_org")
    p_headers, _p = register("m15_late_p")
    # Starts in 30 minutes -> inside the 120-minute window.
    activity = make_activity(org_headers, hours=0.5, duration_hours=1)
    client.post(f"/activities/{activity['id']}/join", headers=p_headers)
    left = client.delete(f"/activities/{activity['id']}/join", headers=p_headers)
    assert left.status_code == 200
    assert left.json()["is_late_cancel"] is True
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 78


def test_r5_early_cancel_costs_nothing(client, register, make_activity):
    org_headers, _org = register("m15_early_org")
    p_headers, _p = register("m15_early_p")
    activity = make_activity(org_headers, hours=48)
    client.post(f"/activities/{activity['id']}/join", headers=p_headers)
    left = client.delete(f"/activities/{activity['id']}/join", headers=p_headers)
    assert left.json()["is_late_cancel"] is False
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 80


# --------------------------------------------------------------------------- #
# R6 / R7 / R8 — no-show penalty and the 60-point join threshold
# --------------------------------------------------------------------------- #
def _force_no_show(client, make_activity, org_headers, p_headers, index: int):
    activity = make_activity(org_headers, title=f"爽约局 {index}")
    assert client.post(f"/activities/{activity['id']}/join", headers=p_headers).status_code == 201
    marked = client.post(f"/activities/{activity['id']}/attendance", headers=org_headers, json=[])
    assert marked.status_code == 200, marked.text


def test_r6_single_no_show_costs_ten(client, register, make_activity):
    org_headers, _org = register("m15_ns1_org")
    p_headers, _p = register("m15_ns1_p")
    _force_no_show(client, make_activity, org_headers, p_headers, 1)
    me = client.get("/me", headers=p_headers).json()
    assert me["reliability_score"] == 70
    assert me["no_show_count"] == 1


def test_r7_exactly_sixty_can_still_join(client, register, make_activity):
    """60 is the boundary: it is NOT below the threshold, so joining stays allowed."""
    org_headers, _org = register("m15_ns2_org")
    p_headers, _p = register("m15_ns2_p")
    _force_no_show(client, make_activity, org_headers, p_headers, 1)
    _force_no_show(client, make_activity, org_headers, p_headers, 2)
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 60

    fresh = make_activity(org_headers, title="六十分局")
    joined = client.post(f"/activities/{fresh['id']}/join", headers=p_headers)
    assert joined.status_code == 201, "score 60 must still be allowed to join"


def test_r8_below_sixty_blocks_joining(client, register, make_activity):
    org_headers, _org = register("m15_ns3_org")
    p_headers, _p = register("m15_ns3_p")
    for index in range(3):
        _force_no_show(client, make_activity, org_headers, p_headers, index)
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 50

    fresh = make_activity(org_headers, title="五十分局")
    blocked = client.post(f"/activities/{fresh['id']}/join", headers=p_headers)
    assert blocked.status_code == 403
    assert "信用分" in blocked.json()["detail"]


# --------------------------------------------------------------------------- #
# R9 — one attendance call hits every non-attending player
# --------------------------------------------------------------------------- #
def test_r9_attendance_penalises_all_absentees(client, register, make_activity):
    org_headers, _org = register("m15_multi_org")
    a_headers, a = register("m15_multi_a")
    b_headers, _b = register("m15_multi_b")
    c_headers, _c = register("m15_multi_c")
    activity = make_activity(org_headers, capacity=6)
    for headers in (a_headers, b_headers, c_headers):
        assert client.post(f"/activities/{activity['id']}/join", headers=headers).status_code == 201

    client.post(f"/activities/{activity['id']}/attendance", headers=org_headers, json=[a["id"]])
    assert client.get("/me", headers=a_headers).json()["reliability_score"] == 82
    assert client.get("/me", headers=b_headers).json()["reliability_score"] == 70
    assert client.get("/me", headers=c_headers).json()["reliability_score"] == 70


# --------------------------------------------------------------------------- #
# R10 — the score is derived from full history, so repeated reads cannot drift
# --------------------------------------------------------------------------- #
def test_r10_score_is_idempotent_across_reads(client, register, make_activity):
    org_headers, _org = register("m15_idem_org")
    p_headers, _p = register("m15_idem_p")
    _force_no_show(client, make_activity, org_headers, p_headers, 1)

    scores = [client.get("/me", headers=p_headers).json()["reliability_score"] for _ in range(5)]
    assert scores == [70] * 5, "re-reading must not keep subtracting"

    # A later check-in must add exactly +2 on top of the recomputed history.
    _checkin(client, make_activity, org_headers, p_headers, "回升局")
    assert client.get("/me", headers=p_headers).json()["reliability_score"] == 72


# --------------------------------------------------------------------------- #
# R11 — lower clamp: the score never goes negative
# --------------------------------------------------------------------------- #
def test_r11_score_clamps_at_zero(client, register, make_activity):
    org_headers, _org = register("m15_floor_org")
    p_headers, _p = register("m15_floor_p")
    # Join all nine activities while the score is still high: once it drops
    # below 60 the API refuses new sign-ups, so the bookings must be made first.
    activities = [
        make_activity(org_headers, title=f"爽约局 {index}") for index in range(9)
    ]
    for activity in activities:
        joined = client.post(f"/activities/{activity['id']}/join", headers=p_headers)
        assert joined.status_code == 201, joined.text

    for activity in activities:
        marked = client.post(
            f"/activities/{activity['id']}/attendance", headers=org_headers, json=[]
        )
        assert marked.status_code == 200, marked.text

    # 80 - 9 * 10 = -10 -> clamped to 0 instead of a negative score.
    me = client.get("/me", headers=p_headers).json()
    assert me["reliability_score"] == 0
    assert me["no_show_count"] == 9


# --------------------------------------------------------------------------- #
# R12 — upper clamp: the score never exceeds 100
# --------------------------------------------------------------------------- #
def test_r12_score_clamps_at_hundred(client, register, make_activity):
    org_headers, _org = register("m15_ceil_org")
    p_headers, _p = register("m15_ceil_p")
    scores = []
    for index in range(12):
        _checkin(client, make_activity, org_headers, p_headers, f"封顶局 {index}")
        scores.append(client.get("/me", headers=p_headers).json()["reliability_score"])

    assert scores[0] == 82          # 80 + 2
    assert scores[9] == 100         # 80 + 2 * 10
    assert scores[-1] == 100        # clamped, never 102+
