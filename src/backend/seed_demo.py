"""Seed a small demo dataset so the defence demo is not empty.

Idempotent: running it more than once does not duplicate accounts or
activities. Run it once before starting the server:

    python seed_demo.py

Demo accounts (password for all three is ``demo123456``):

    demo_org   张三  旗山校区  发起三个演示活动
    demo_lisi  李四  旗山校区  已报名「今晚篮球半场 3v3」
    demo_wangwu 王五 铜盘校区  已报名「周末羽毛球双打」
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

import db
import security
import services
from models import Activity, Registration, User
from schemas import ActivityCreate

DEMO_PASSWORD = "demo123456"

DEMO_USERS = [
    {"username": "demo_org", "nickname": "张三", "campus": "旗山校区"},
    {"username": "demo_lisi", "nickname": "李四", "campus": "旗山校区"},
    {"username": "demo_wangwu", "nickname": "王五", "campus": "铜盘校区"},
]

DEMO_ACTIVITIES = [
    {
        "title": "今晚篮球半场 3v3",
        "sport": "篮球",
        "campus": "旗山校区",
        "location": "风雨操场",
        "hours": 20,
        "capacity": 6,
    },
    {
        "title": "周末羽毛球双打",
        "sport": "羽毛球",
        "campus": "铜盘校区",
        "location": "羽毛球馆",
        "hours": 48,
        "capacity": 4,
    },
    {
        "title": "明早晨跑 5 公里",
        "sport": "跑步",
        "campus": "旗山校区",
        "location": "田径场",
        "hours": 12,
        "capacity": 8,
    },
]


def _future(hours: float) -> datetime:
    return datetime.now(UTC) + timedelta(hours=hours)


def _ensure_user(session, username: str, nickname: str, campus: str) -> User:
    user = session.scalars(select(User).where(User.username == username)).first()
    if user is None:
        user = User(
            username=username,
            password_hash=security.hash_password(DEMO_PASSWORD),
            nickname=nickname,
            campus=campus,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def main() -> int:
    db.init_db()  # create tables and the sport catalogue (idempotent)

    with db.SessionLocal() as session:
        users = {
            spec["username"]: _ensure_user(
                session, spec["username"], spec["nickname"], spec["campus"]
            )
            for spec in DEMO_USERS
        }

        activities: dict[str, Activity] = {}
        for spec in DEMO_ACTIVITIES:
            existing = session.scalars(
                select(Activity).where(Activity.title == spec["title"])
            ).first()
            if existing is not None:
                activities[spec["title"]] = existing
                continue
            payload = ActivityCreate(
                title=spec["title"],
                sport=spec["sport"],
                campus=spec["campus"],
                location=spec["location"],
                start_time=_future(spec["hours"]),
                end_time=_future(spec["hours"] + 2),
                capacity=spec["capacity"],
            )
            activities[spec["title"]] = services.create_activity(
                session, users["demo_org"], payload
            )

        # A couple of sign-ups so the participant list is populated.
        joins = [
            ("今晚篮球半场 3v3", "demo_lisi"),
            ("周末羽毛球双打", "demo_wangwu"),
        ]
        for title, username in joins:
            activity = activities[title]
            already = session.scalars(
                select(Registration).where(
                    Registration.activity_id == activity.id,
                    Registration.user_id == users[username].id,
                )
            ).first()
            if already is None:
                services.join_activity(session, activity, users[username])

    print("演示数据就绪。登录账号（密码均为 demo123456）：")
    for spec in DEMO_USERS:
        print(f"  {spec['username']:<14} {spec['nickname']}（{spec['campus']}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
