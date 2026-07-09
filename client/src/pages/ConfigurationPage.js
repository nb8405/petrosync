import React from "react";
import AutomationIntegrationPage from "./AutomationIntegrationPage";
import BackupRestorePage from "./BackupRestorePage";
import { backendApi } from "../utils/backendApi";
import TopTabNavigation from "../components/TopTabNavigation";

const configurationTabs = [
  ["fuels", "Fuel Master"],
  ["backup", "Backup & Restore"],
  ["settings", "Settings"],
];

const fieldCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

function FuelMasterSettings({ user }) {
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState("loading");
  const [message, setMessage] = React.useState("");
  const [newFuel, setNewFuel] = React.useState({ fuelCode: "", fuelName: "" });
  const canManage = user?.role === "Owner";

  const loadRows = React.useCallback(() => {
    setStatus("loading");
    backendApi
      .listWorkspaceFuels()
      .then((result) => {
        setRows(result.rows || []);
        setStatus("loaded");
      })
      .catch((error) => {
        setRows([]);
        setStatus("error");
        setMessage(error.message || "Unable to load fuel master.");
      });
  }, []);

  React.useEffect(() => {
    loadRows();
  }, [loadRows]);

  const addFuel = async () => {
    const fuelCode = fieldCode(newFuel.fuelCode || newFuel.fuelName);
    const fuelName = String(newFuel.fuelName || "").trim();

    if (!fuelCode || !fuelName) {
      setMessage("Fuel code and name are required.");
      return;
    }

    setMessage("");
    const result = await backendApi.createWorkspaceFuel({ fuelCode, fuelName });

    if (!result.ok) {
      setMessage(result.message || "Unable to add fuel.");
      return;
    }

    setNewFuel({ fuelCode: "", fuelName: "" });
    loadRows();
  };

  const updateFuel = async (fuel, payload) => {
    setMessage("");
    const result = await backendApi.updateWorkspaceFuel(fuel.id, payload);

    if (!result.ok) {
      setMessage(result.message || "Unable to update fuel.");
      return;
    }

    loadRows();
  };

  return (
    <section className="ppm-card">
      <div className="ppm-card-title">
        <div>
          <p className="ppm-kicker">Configuration</p>
          <h2>Fuel Master</h2>
          <span>Enable company products and maintain custom fuels.</span>
        </div>
      </div>

      {message && <p className="login-message">{message}</p>}

      {status === "loading" && (
        <div className="ppm-loading-state">
          <span />
          <strong>Loading fuel master</strong>
        </div>
      )}

      {status !== "loading" && (
        <div className="ppm-table-scroll">
          <table className="ppm-table">
            <thead>
              <tr>
                <th>Fuel</th>
                <th>Code</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((fuel) => (
                <tr key={fuel.id}>
                  <td>
                    {fuel.custom && canManage ? (
                      <input
                        className="ppm-input"
                        value={fuel.name}
                        onChange={(event) =>
                          setRows((previous) =>
                            previous.map((row) =>
                              row.id === fuel.id
                                ? { ...row, name: event.target.value }
                                : row
                            )
                          )
                        }
                      />
                    ) : (
                      fuel.name
                    )}
                  </td>
                  <td>{fuel.code}</td>
                  <td>{fuel.custom ? "Custom" : fuel.companyName || "Company"}</td>
                  <td>{fuel.enabled ? "Enabled" : "Disabled"}</td>
                  <td>
                    <div className="ppm-actions">
                      {fuel.custom && canManage && (
                        <button
                          type="button"
                          className="ppm-button secondary"
                          onClick={() => updateFuel(fuel, { fuelName: fuel.name })}
                        >
                          Rename
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="ppm-button secondary"
                          onClick={() =>
                            updateFuel(fuel, {
                              fuelName: fuel.name,
                              enabled: !fuel.enabled,
                            })
                          }
                        >
                          {fuel.enabled ? "Disable" : "Enable"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="5">No fuels configured.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <div className="enterprise-form-grid" style={{ marginTop: 18 }}>
          <label>
            <span>Fuel Code</span>
            <input
              className="ppm-input"
              value={newFuel.fuelCode}
              onChange={(event) =>
                setNewFuel((fuel) => ({ ...fuel, fuelCode: event.target.value }))
              }
              placeholder="BIO_DIESEL"
            />
          </label>
          <label>
            <span>Fuel Name</span>
            <input
              className="ppm-input"
              value={newFuel.fuelName}
              onChange={(event) =>
                setNewFuel((fuel) => ({ ...fuel, fuelName: event.target.value }))
              }
              placeholder="Custom Fuel"
            />
          </label>
          <button type="button" className="ppm-button primary" onClick={addFuel}>
            Add Fuel
          </button>
        </div>
      )}
    </section>
  );
}

const formatUserDate = (value) => {
  if (!value) return "Not available";

  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

function DeleteUserDialog({ targetUser, currentUser, deleting, error, onCancel, onConfirm }) {
  const [confirmation, setConfirmation] = React.useState("");
  const matches = confirmation.trim() === targetUser.username;
  const isSelf = Number(targetUser.id) === Number(currentUser?.id);

  return (
    <div className="ppm-modal-backdrop" role="presentation">
      <section className="ppm-modal delete-user-dialog" role="dialog" aria-modal="true">
        <div className="delete-user-warning" aria-hidden="true">
          !
        </div>
        <div className="ppm-card-title">
          <div>
            <p className="ppm-kicker">Permanent Delete</p>
            <h2>Delete {targetUser.displayName || targetUser.username}?</h2>
            <span>This action removes the user account and stored user information from the database.</span>
          </div>
        </div>

        <div className="delete-user-impact">
          <strong>Warning</strong>
          <p>
            This cannot be undone. PetroSync will delete this user account, remove all active
            sessions, clear user references from operational records, and remove user-specific
            audit/activity entries.
          </p>
          {isSelf && (
            <p>
              You are deleting your own account. After deletion, this browser session will be
              signed out.
            </p>
          )}
        </div>

        <label className="delete-user-confirm-field">
          <span>Type the username to confirm: {targetUser.username}</span>
          <input
            className="ppm-input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoFocus
            disabled={deleting}
          />
        </label>

        {error && <p className="login-message danger">{error}</p>}

        <div className="ppm-action-strip">
          <button
            type="button"
            className="ppm-button danger"
            onClick={() => onConfirm(targetUser)}
            disabled={!matches || deleting}
          >
            {deleting ? "Deleting..." : "Delete User Permanently"}
          </button>
          <button type="button" className="ppm-button neutral" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function UserManagementSettings({ user, onSessionDeleted }) {
  const [users, setUsers] = React.useState([]);
  const [status, setStatus] = React.useState("loading");
  const [message, setMessage] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState(null);
  const [deleteError, setDeleteError] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const loadUsers = React.useCallback(() => {
    setStatus("loading");
    setMessage("");
    backendApi
      .listUsers()
      .then((result) => {
        setUsers(result.users || []);
        setStatus("loaded");
      })
      .catch((error) => {
        setUsers([]);
        setStatus("error");
        setMessage(error.message || "Unable to load users.");
      });
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const confirmDelete = async (targetUser) => {
    setDeleting(true);
    setDeleteError("");

    try {
      const result = await backendApi.deleteUser(targetUser.id, { confirmation: "DELETE" });
      const deletedSelf = Number(targetUser.id) === Number(user?.id);

      setDeleteTarget(null);
      setMessage(result.message || "User deleted permanently.");

      if (deletedSelf) {
        await onSessionDeleted?.();
        return;
      }

      loadUsers();
    } catch (error) {
      setDeleteError(error.message || "Unable to delete user.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="ppm-card user-danger-card">
      <div className="ppm-card-title">
        <div>
          <p className="ppm-kicker">Settings</p>
          <h2>User Deletion</h2>
          <span>Hard-delete an existing user and remove stored user information.</span>
        </div>
        <button type="button" className="ppm-button secondary" onClick={loadUsers}>
          Refresh
        </button>
      </div>

      {message && <p className="login-message info">{message}</p>}

      <div className="delete-user-notice">
        <strong>Deletion is permanent.</strong>
        <span>
          Use this only when the user account and stored user identity data must be removed from
          the database.
        </span>
      </div>

      {status === "loading" && (
        <div className="ppm-loading-state">
          <span />
          <strong>Loading users</strong>
        </div>
      )}

      {status !== "loading" && (
        <div className="ppm-table-scroll">
          <table className="ppm-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Email</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.displayName || row.username}</strong>
                    <span className="ppm-muted"> @{row.username}</span>
                  </td>
                  <td>{row.role}</td>
                  <td>{row.email || "Not configured"}</td>
                  <td>{row.active ? "Active" : "Inactive"}</td>
                  <td>{formatUserDate(row.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="ppm-button danger"
                      onClick={() => {
                        setDeleteError("");
                        setDeleteTarget(row);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="6">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <DeleteUserDialog
          targetUser={deleteTarget}
          currentUser={user}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError("");
          }}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

export default function ConfigurationPage(props) {
  const [activeTab, setActiveTab] = React.useState("fuels");

  const renderTab = () => {
    if (activeTab === "backup") {
      return <BackupRestorePage {...props} />;
    }

    if (activeTab === "fuels") {
      return <FuelMasterSettings user={props.user} />;
    }

    if (activeTab === "settings") {
      if (props.user?.role !== "Owner") {
        return (
          <section className="ppm-card">
            <p className="ppm-kicker">Access Denied</p>
            <h1>Configuration</h1>
            <p className="ppm-muted">
              Owner access is required for automation settings, credentials and mappings.
            </p>
          </section>
        );
      }

      return (
        <>
          <AutomationIntegrationPage {...props} title="Configuration" />
          <UserManagementSettings
            user={props.user}
            onSessionDeleted={props.onSessionDeleted}
          />
        </>
      );
    }

    return <FuelMasterSettings user={props.user} />;
  };

  return (
    <main className="ppm-main configuration-page">
      <header className="ppm-header">
        <div>
          <p className="ppm-kicker">Administration</p>
          <h1>Configuration</h1>
          <p className="ppm-muted">
            Fuel master, backup controls and system settings.
          </p>
        </div>
      </header>

      <TopTabNavigation
        tabs={configurationTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Configuration sections"
      />

      <div className="configuration-tab-panel">{renderTab()}</div>
    </main>
  );
}
