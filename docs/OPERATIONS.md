# Operations

## Backup and restore

Stop Playiku before copying data. Back up the complete `/data` volume, including `app.sqlite`, `app.sqlite-wal`, and `app.sqlite-shm` when present. Record the application image digest with the backup. To restore, stop the service, replace the contents of `/data` from one consistent backup, retain its ownership, and start the same image digest. Confirm `/health/ready`, sign-in, settings, and one saved game before upgrading.

## Upgrade

1. Back up `/data` and record the running image digest.
2. Pull the new immutable version tag and review the changelog.
3. Stop the old container and start the new image against the existing volume.
4. Confirm readiness, sign-in, saved sessions, and statistics.

### Upgrade from 0.1.2 to 0.9

The SQLite schema stays at version 1, so the application performs no irreversible database migration. Theme settings receive backward-compatible defaults for the new gameplay preferences. Older saved game payloads are normalized when opened; normal Daily play never replaces the corresponding standard save. Keep the pre-upgrade backup until one saved game and the statistics page have been checked for every active account.

## Rollback

Stop the new image. If its release notes declare no irreversible schema migration, restart the previous digest against the current volume. Otherwise restore the pre-upgrade volume backup before starting the previous digest. Never downgrade while a newer process is writing the database.

For the 0.9 release, stop the container and restart the recorded `v0.1.2` digest. Because schema version 1 is unchanged, restoring the backup is optional unless an operator wants to discard game activity created while running 0.9.

## First run

Set `ISHIKU_SETUP_SECRET` to at least 32 unique random characters, or mount a file containing the value through `ISHIKU_SETUP_SECRET_FILE`. Open Playiku, enter that setup secret, choose an administrator username and a different password of at least 12 characters. The setup endpoint closes permanently after success; remove or rotate the secret source after creating the account.
