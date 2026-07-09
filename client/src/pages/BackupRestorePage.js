import React from "react";
import { backendApi } from "../utils/backendApi";
import TrashIcon from "../components/TrashIcon";

const retentionOptions = [7, 30, 90, 365];

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const shortChecksum = (checksum) =>
  checksum ? `${checksum.slice(0, 12)}...${checksum.slice(-8)}` : "-";

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export default function BackupRestorePage({ currentTheme, setCurrentTheme, user }) {
  const [status, setStatus] = React.useState(null);
  const [backups, setBackups] = React.useState([]);
  const [schedule, setSchedule] = React.useState({
    enabled: false,
    frequency: "daily",
    runTime: "02:00",
    retentionCount: 7,
  });
  const [restoreFile, setRestoreFile] = React.useState(null);
  const [restorePassword, setRestorePassword] = React.useState("");
  const [restoreConfirmation, setRestoreConfirmation] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const isOwner = user?.role === "Owner";

  const loadBackups = React.useCallback(async () => {
    const [statusResult, historyResult] = await Promise.all([
      backendApi.backupModuleStatus(),
      backendApi.listBackups(),
    ]);

    setStatus(statusResult);
    setSchedule(statusResult.schedule || schedule);
    setBackups(historyResult.backups || []);
  }, [schedule]);

  React.useEffect(() => {
    let active = true;

    loadBackups().catch((error) => {
      if (active) {
        setMessage(error.message || "Unable to load backup status.");
      }
    });

    return () => {
      active = false;
    };
  }, [loadBackups]);

  const runAction = async (action, successMessage) => {
    setLoading(true);
    setMessage("");

    try {
      const result = await action();
      await loadBackups();
      setMessage(result?.message || successMessage);
      return result;
    } catch (error) {
      setMessage(error.message || "Backup operation failed.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const createBackup = () =>
    runAction(() => backendApi.createBackup(), "Backup created.");

  const verifyBackup = (backup) =>
    runAction(
      () => backendApi.verifyBackup({ id: backup.id }),
      "Backup verification passed."
    );

  const downloadBackup = async (backup) => {
    setLoading(true);
    setMessage("");

    try {
      const result = await backendApi.downloadBackup(backup.id);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName || backup.fileName || "backup.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Backup download started.");
    } catch (error) {
      setMessage(error.message || "Unable to download backup.");
    } finally {
      setLoading(false);
    }
  };

  const deleteBackup = (backup) => {
    if (!window.confirm("Delete this backup? This action cannot be undone.")) {
      return;
    }

    runAction(() => backendApi.deleteBackup(backup.id), "Backup deleted.");
  };

  const saveSchedule = () =>
    runAction(
      () => backendApi.updateBackupSchedule(schedule),
      "Backup schedule updated."
    );

  const restoreBackup = async () => {
    if (!restoreFile) {
      setMessage("Select a backup file before restore.");
      return;
    }

    if (!window.confirm("Restoring a backup will overwrite current system data.")) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const fileBase64 = await fileToBase64(restoreFile);
      const result = await backendApi.restoreBackup({
        uploadFileName: restoreFile.name,
        fileBase64,
        ownerPassword: restorePassword,
        confirmation: restoreConfirmation,
      });
      await loadBackups();
      setRestoreFile(null);
      setRestorePassword("");
      setRestoreConfirmation("");
      setMessage(result.message || "Restore completed successfully.");
    } catch (error) {
      setMessage(error.message || "Restore failed.");
    } finally {
      setLoading(false);
    }
  };

  const restoreEnabled =
    isOwner &&
    restoreFile &&
    restorePassword &&
    restoreConfirmation === "RESTORE MY DATA";

  return (
    <main className="ppm-main settings-page backup-restore-page">
      <header className="ppm-header">
        <div>
          <p className="ppm-kicker">Settings</p>
          <h1>Backup & Restore</h1>
          <p className="ppm-muted">
            Protect DSR, reports, automation mappings, settings and audit history.
          </p>
        </div>

        <select
          value={currentTheme}
          onChange={(e) => setCurrentTheme(e.target.value)}
          className="ppm-theme-select"
        >
          <option value="indianOil">IndianOil Classic</option>
          <option value="neonBlue">Neon Blue</option>
          <option value="emerald">Emerald Green</option>
          <option value="dark">Dark Mode</option>
        </select>
      </header>

      {message && <div className="ppm-status-banner">{message}</div>}

      <section className="backup-grid">
        <article className="ppm-card">
          <div className="ppm-card-title">
            <h2>Backup Status</h2>
            <span>{status?.schemaVersion || "backup.v2"}</span>
          </div>
          <div className="backup-status-grid">
            <div>
              <span>Latest Backup</span>
              <strong>{status?.latestBackup?.backupId || "-"}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{status?.latestBackup?.status || "Not Created"}</strong>
            </div>
            <div>
              <span>Backup Date</span>
              <strong>{formatDateTime(status?.latestBackup?.completedAt)}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{status?.latestBackup?.backupSize || "-"}</strong>
            </div>
          </div>
        </article>

        <article className="ppm-card">
          <div className="ppm-card-title">
            <h2>Manual Backup</h2>
            <span>Owner controlled</span>
          </div>
          <div className="ppm-action-strip">
            <button
              type="button"
              className="ppm-button primary"
              onClick={createBackup}
              disabled={!isOwner || loading}
            >
              Create Backup
            </button>
            <button
              type="button"
              className="ppm-button secondary"
              onClick={() => status?.latestBackup && downloadBackup(status.latestBackup)}
              disabled={!isOwner || loading || !status?.latestBackup}
            >
              Download Backup
            </button>
            <button
              type="button"
              className="ppm-button secondary"
              onClick={() => status?.latestBackup && verifyBackup(status.latestBackup)}
              disabled={!isOwner || loading || !status?.latestBackup}
            >
              Verify Backup
            </button>
          </div>
          {!isOwner && (
            <p className="ppm-muted">Managers and Operators have view-only access.</p>
          )}
        </article>
      </section>

      <section className="backup-grid">
        <article className="ppm-card">
          <div className="ppm-card-title">
            <h2>Scheduled Backup</h2>
            <span>Default daily 02:00 AM</span>
          </div>
          <div className="backup-form-grid">
            <label>
              <span>Enable Scheduled Backup</span>
              <select
                className="ppm-input"
                value={schedule.enabled ? "true" : "false"}
                onChange={(e) =>
                  setSchedule((current) => ({
                    ...current,
                    enabled: e.target.value === "true",
                  }))
                }
                disabled={!isOwner}
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled</option>
              </select>
            </label>
            <label>
              <span>Frequency</span>
              <select
                className="ppm-input"
                value={schedule.frequency}
                onChange={(e) =>
                  setSchedule((current) => ({
                    ...current,
                    frequency: e.target.value,
                  }))
                }
                disabled={!isOwner}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              <span>Run Time</span>
              <input
                className="ppm-input"
                type="time"
                value={schedule.runTime}
                onChange={(e) =>
                  setSchedule((current) => ({
                    ...current,
                    runTime: e.target.value,
                  }))
                }
                disabled={!isOwner}
              />
            </label>
            <label>
              <span>Retention</span>
              <select
                className="ppm-input"
                value={String(schedule.retentionCount)}
                onChange={(e) =>
                  setSchedule((current) => ({
                    ...current,
                    retentionCount: Number(e.target.value),
                  }))
                }
                disabled={!isOwner}
              >
                {retentionOptions.map((value) => (
                  <option key={value} value={value}>
                    Keep {value} backups
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="ppm-button primary"
            onClick={saveSchedule}
            disabled={!isOwner || loading}
          >
            Save Schedule
          </button>
        </article>

        <article className="ppm-card">
          <div className="ppm-card-title">
            <h2>Restore Backup</h2>
            <span>Owner password required</span>
          </div>
          <p className="ppm-danger-note">
            Restoring a backup will overwrite current system data.
          </p>
          <div className="backup-form-grid">
            <label>
              <span>Upload Backup File</span>
              <input
                className="ppm-input"
                type="file"
                accept=".zip"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                disabled={!isOwner}
              />
            </label>
            <label>
              <span>Owner Password Confirmation</span>
              <input
                className="ppm-input"
                type="password"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                disabled={!isOwner}
              />
            </label>
            <label>
              <span>RESTORE CONFIRMATION</span>
              <input
                className="ppm-input"
                placeholder="RESTORE MY DATA"
                value={restoreConfirmation}
                onChange={(e) => setRestoreConfirmation(e.target.value)}
                disabled={!isOwner}
              />
            </label>
          </div>
          <button
            type="button"
            className="ppm-button danger"
            onClick={restoreBackup}
            disabled={!restoreEnabled || loading}
          >
            Restore Backup
          </button>
        </article>
      </section>

      <section className="ppm-card">
        <div className="ppm-card-title">
          <h2>Backup History</h2>
          <span>{backups.length} records</span>
        </div>
        <div className="backup-history-table">
          <div className="backup-history-head">
            <span>Backup ID</span>
            <span>Date</span>
            <span>Created By</span>
            <span>Size</span>
            <span>Checksum</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {backups.map((backup) => (
            <div key={backup.id} className="backup-history-row">
              <strong>{backup.backupId}</strong>
              <span>{formatDateTime(backup.completedAt || backup.startedAt)}</span>
              <span>{backup.createdBy}</span>
              <span>{backup.backupSize}</span>
              <span title={backup.checksum || ""}>{shortChecksum(backup.checksum)}</span>
              <span>{backup.status}</span>
              <div className="backup-history-actions">
                <button
                  type="button"
                  className="ppm-button secondary"
                  onClick={() => downloadBackup(backup)}
                  disabled={!isOwner || loading}
                >
                  Download
                </button>
                <button
                  type="button"
                  className="ppm-button secondary"
                  onClick={() => verifyBackup(backup)}
                  disabled={!isOwner || loading}
                >
                  Verify
                </button>
                {isOwner && (
                  <button
                    type="button"
                    className="ppm-button danger icon-action-button"
                    onClick={() => deleteBackup(backup)}
                    disabled={loading}
                    aria-label={`Delete backup ${backup.backupId}`}
                    title="Delete backup"
                  >
                    <TrashIcon />
                  </button>
                )}
              </div>
            </div>
          ))}
          {backups.length === 0 && (
            <div className="ppm-empty-state">
              <strong>No backups found</strong>
              <span>Create a manual backup to populate history.</span>
            </div>
          )}
        </div>
      </section>

      <section className="ppm-card">
        <div className="ppm-card-title">
          <h2>Disaster Recovery Information</h2>
          <span>Production checklist</span>
        </div>
        <div className="backup-dr-grid">
          <div>
            <strong>Backup Contents</strong>
            <p>
              Users, sessions, DSR records, collections, expenses, reports,
              automation integrations, ATG/ATOS mappings, settings, activity
              logs and audit logs.
            </p>
          </div>
          <div>
            <strong>Validation</strong>
            <p>
              Each package is ZIP compressed, signed, checksum verified and
              schema-version checked before restore.
            </p>
          </div>
          <div>
            <strong>Restore Safety</strong>
            <p>
              Restore creates an automatic pre-restore backup, runs inside a
              database transaction and verifies record counts before commit.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
