const appConfig = require("../config/appConfig");
const operationsRepository = require("../repositories/operationsRepository");

const pad = (value) => String(value).padStart(6, "0");

const nextNumber = async (sequenceKey, prefix) => {
  const row = await operationsRepository.nextSequenceValue({
    sequenceKey,
    prefix,
  });

  return `${row.prefix}-${pad(row.current_value)}`;
};

const nextDsrNumber = () =>
  nextNumber("dsr_number", appConfig.numbering.dsrPrefix);

const nextReportNumber = () =>
  nextNumber("report_number", appConfig.numbering.reportPrefix);

const nextPrintReference = () =>
  nextNumber("print_reference", appConfig.numbering.printPrefix);

const nextExportReference = () =>
  nextNumber("export_reference", appConfig.numbering.exportPrefix);

const nextBackupNumber = () => nextNumber("backup_number", "BKP");

const nextRestoreNumber = () => nextNumber("restore_number", "RST");

module.exports = {
  nextDsrNumber,
  nextReportNumber,
  nextPrintReference,
  nextExportReference,
  nextBackupNumber,
  nextRestoreNumber,
};
