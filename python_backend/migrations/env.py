from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# Load app config and models so autogenerate can see the metadata
from app.config import settings
from app.db import Base
import app.models.tenant  # noqa: F401
import app.models.volunteer  # noqa: F401
import app.models.event  # noqa: F401
import app.models.sms  # noqa: F401

config = context.config

# Use MIGRATION_DATABASE_URL (superuser) if set, else derive from DATABASE_URL.
# asyncpg cannot execute multi-statement SQL; migrations always use psycopg2.
_migration_url = getattr(settings, "migration_database_url", None)
if _migration_url:
    _sync_url = _migration_url
else:
    _sync_url = (
        settings.database_url
        .replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        .replace("postgresql+asyncpg:", "postgresql+psycopg2:")
    )
config.set_main_option("sqlalchemy.url", _sync_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        transaction_per_migration=False,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(_sync_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            transaction_per_migration=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
