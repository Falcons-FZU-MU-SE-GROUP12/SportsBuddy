"""Acceptance coverage for Issue #10 database persistence and seed data."""

from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

import db as db_module
from models import Sport, User


def test_issue10_init_db_is_idempotent_and_seeds_sports(tmp_path, monkeypatch):
    database_url = f"sqlite:///{(tmp_path / 'issue10.db').as_posix()}"
    monkeypatch.setattr(db_module, "engine", create_engine(database_url))
    monkeypatch.setattr(
        db_module,
        "SessionLocal",
        sessionmaker(bind=db_module.engine, autoflush=False, expire_on_commit=False),
    )

    db_module.init_db()
    db_module.init_db()

    with Session(db_module.engine) as session:
        sports = session.scalars(select(Sport)).all()
        assert {sport.name for sport in sports} >= {"篮球", "羽毛球", "足球"}
        assert len(sports) == len({sport.name for sport in sports})

    assert Path(tmp_path / "issue10.db").exists()


def test_issue10_file_database_can_reopen_persisted_rows(tmp_path):
    database_url = f"sqlite:///{(tmp_path / 'reopen.db').as_posix()}"
    engine = create_engine(database_url)
    db_module.Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add(
            User(
                username="issue10_persisted",
                password_hash="hash",
                nickname="持久化验收",
            )
        )
        session.commit()

    reopened = create_engine(database_url)
    with Session(reopened) as session:
        user = session.scalar(select(User).where(User.username == "issue10_persisted"))
        assert user is not None
        assert user.nickname == "持久化验收"
