"""Acceptance coverage for Issue #4 authentication and token persistence."""


def test_issue4_register_login_me_and_logout(client):
    registered = client.post(
        "/auth/register",
        json={
            "username": "issue4_user",
            "password": "secret123",
            "nickname": "认证验收",
        },
    )
    assert registered.status_code == 201, registered.text
    first_token = registered.json()["access_token"]

    profile = client.get("/me", headers={"Authorization": f"Bearer {first_token}"})
    assert profile.status_code == 200
    assert profile.json()["username"] == "issue4_user"

    logged_in = client.post(
        "/auth/login",
        json={"username": "issue4_user", "password": "secret123"},
    )
    assert logged_in.status_code == 200, logged_in.text
    second_token = logged_in.json()["access_token"]
    assert second_token != first_token

    logout = client.post(
        "/auth/logout", headers={"Authorization": f"Bearer {second_token}"}
    )
    assert logout.status_code == 204
    revoked = client.get("/me", headers={"Authorization": f"Bearer {second_token}"})
    assert revoked.status_code == 401


def test_issue4_duplicate_username_and_wrong_password_are_rejected(client):
    payload = {"username": "issue4_dup", "password": "secret123", "nickname": "重复账号"}
    assert client.post("/auth/register", json=payload).status_code == 201
    duplicate = client.post("/auth/register", json=payload)
    assert duplicate.status_code == 409

    wrong_password = client.post(
        "/auth/login",
        json={"username": "issue4_dup", "password": "wrong-pass"},
    )
    assert wrong_password.status_code == 401
