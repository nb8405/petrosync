import DSRPdfTemplate from "./dsrPdfTemplate";
import { reportDataFromBackend } from "./dsrData";

export const exportDsrPdf = (reportData) => {
  const template = new DSRPdfTemplate(reportData);
  template.save();
};

export const exportBackendDsrPdf = (report) => {
  exportDsrPdf(reportDataFromBackend(report?.report || report));
};
