-- Reset script for first-run onboarding test
-- WARNING: This deletes ALL data. Only use in development!

TRUNCATE
  app_users,
  user_sessions,
  pump_workspaces,
  workspace_fuels,
  dsr_product_rows,
  dsr_collections,
  dsr_expenses,
  dsr_records,
  export_history,
  report_history,
  print_history,
  backup_history,
  restore_history,
  restore_approvals,
  audit_logs,
  activity_logs,
  automation_sync_logs,
  automation_tank_mappings,
  automation_nozzle_mappings,
  automation_connections,
  device_sync_history,
  device_mappings,
  device_nozzles,
  device_tanks,
  tank_readings,
  tank_alerts,
  device_statuses,
  shift_records,
  forecourt_tanks,
  forecourt_pumps,
  forecourt_nozzles,
  forecourt_islands,
  shift_configs,
  day_end_records,
  alarms,
  dry_stock_movements,
  dry_stock_items,
  attendant_sales,
  attendants,
  station_settings,
  numbering_sequences
RESTART IDENTITY CASCADE;

-- Verify clean state
SELECT 'Users:' as table_name, COUNT(*) as count FROM app_users
UNION ALL
SELECT 'Sessions:', COUNT(*) FROM user_sessions
UNION ALL
SELECT 'Workspaces:', COUNT(*) FROM pump_workspaces
UNION ALL
SELECT 'Workspace fuels:', COUNT(*) FROM workspace_fuels
UNION ALL
SELECT 'DSR records:', COUNT(*) FROM dsr_records;
