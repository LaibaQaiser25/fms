# FMS (Factory Management System)

A complete, production-ready Factory Management System with integrated business modules. Built with React, Node.js, Express, and PostgreSQL.

## Recovery

| If… | Read |
|---|---|
| FMS is broken or missing | [`deploy/DISASTER-RECOVERY.md`](deploy/DISASTER-RECOVERY.md) |
| the whole server is gone | the `box-doc-*` release in `hanzla46/vps-backups` |

Data and secrets live in the private repo `hanzla46/vps-backups` as release
assets (`fms_db-*` hourly, `config-*` daily). Nothing needed for a rebuild lives
only on the server.
