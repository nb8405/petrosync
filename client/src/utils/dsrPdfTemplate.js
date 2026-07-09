import jsPDF from "jspdf";
import { formatMoney, safe } from "./dsrData";

const sumRecordField = (records, field) =>
  records.reduce((sum, record) => sum + Number(record.form?.[field] || 0), 0);

const formatDate = (date) =>
  date
    ? date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

export default class DSRPdfTemplate {
  constructor({ productTitle, fromDate, toDate, records, productRows, totals }) {
    this.doc = new jsPDF("l", "mm", "a4");
    this.productTitle = productTitle || "Overall";
    this.fromDate = fromDate;
    this.toDate = toDate;
    this.records = records || [];
    this.productRows = productRows || [];
    this.totals = totals || {};
    this.margin = 9;
    this.pageW = this.doc.internal.pageSize.getWidth();
    this.pageH = this.doc.internal.pageSize.getHeight();
    this.y = 10;
    this.cumulativeSales = 0;
  }

  drawCell(x, top, w, h, text, options = {}) {
    const {
      fontSize = 7,
      bold = false,
      fill = null,
      align = "center",
      color = [0, 0, 0],
    } = options;

    if (fill) {
      this.doc.setFillColor(fill[0], fill[1], fill[2]);
      this.doc.rect(x, top, w, h, "F");
    }

    this.doc.setDrawColor(28, 28, 28);
    this.doc.rect(x, top, w, h);
    this.doc.setTextColor(color[0], color[1], color[2]);
    this.doc.setFont("helvetica", bold ? "bold" : "normal");
    this.doc.setFontSize(fontSize);
    this.doc.text(String(text ?? ""), x + w / 2, top + h / 2 + 1.5, {
      align,
      maxWidth: w - 2,
    });
  }

  addPageIfNeeded(nextHeight) {
    if (this.y + nextHeight <= this.pageH - 10) {
      return false;
    }

    this.doc.addPage("a4", "l");
    this.y = 10;
    this.drawHeader();
    return true;
  }

  drawHeader() {
    const dateLabel =
      formatDate(this.fromDate) === formatDate(this.toDate)
        ? formatDate(this.fromDate)
        : `${formatDate(this.fromDate)} to ${formatDate(this.toDate)}`;
    const monthLabel = this.fromDate
      ? this.fromDate.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
        })
      : "-";

    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text("MAYA FILLING CENTRE [KSK]", this.pageW / 2, this.y, {
      align: "center",
    });
    this.y += 6;

    this.doc.setFontSize(10);
    this.doc.text("INDIAN OIL PETROL PUMP - DAILY SALES REGISTER", this.pageW / 2, this.y, {
      align: "center",
    });
    this.y += 6;

    const meta = [
      ["Pump Name", "MAYA FILLING CENTRE [KSK]"],
      ["Month", monthLabel],
      ["Product Name", this.productTitle === "Overall" ? "All Products" : this.productTitle],
      ["Period", dateLabel],
    ];
    const widths = [34, 92, 34, 92];
    let x = this.margin + 11;

    for (let i = 0; i < meta.length; i += 2) {
      const left = meta[i];
      const right = meta[i + 1];
      this.drawCell(x, this.y, widths[0], 7, left[0], {
        bold: true,
        fill: [232, 238, 247],
      });
      this.drawCell(x + widths[0], this.y, widths[1], 7, left[1]);
      this.drawCell(x + widths[0] + widths[1], this.y, widths[2], 7, right[0], {
        bold: true,
        fill: [232, 238, 247],
      });
      this.drawCell(
        x + widths[0] + widths[1] + widths[2],
        this.y,
        widths[3],
        7,
        right[1]
      );
      this.y += 7;
    }

    this.y += 5;
  }

  drawManualTable() {
    const headers = [
      "Product",
      "Opening Stock",
      "Receipt",
      "Total Stock",
      "Opening Meter",
      "Closing Meter",
      "Testing",
      "Sales",
      "Cumulative Sales",
      "Closing Stock",
      "Rate",
      "Amount",
    ];
    const widths = [30, 22, 20, 22, 24, 24, 18, 20, 24, 22, 20, 28];
    const tableWidth = widths.reduce((sum, width) => sum + width, 0);
    const startX = this.margin + (this.pageW - this.margin * 2 - tableWidth) / 2;

    const drawTableHead = () => {
      let x = startX;
      headers.forEach((header, index) => {
        this.drawCell(x, this.y, widths[index], 8, header, {
          bold: true,
          fill: [0, 58, 143],
          color: [255, 255, 255],
          fontSize: 6.5,
        });
        x += widths[index];
      });
      this.y += 8;
    };

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.text("Manual DSR Product Register", this.margin, this.y);
    this.y += 5;
    drawTableHead();

    this.productRows.forEach((product) => {
      if (this.addPageIfNeeded(11)) {
        drawTableHead();
      }

      const sales = Number(product.sales || 0);
      this.cumulativeSales += sales;
      const totalStock =
        Number(product.opening || 0) + Number(product.receipt || 0);
      const row = [
        product.label,
        safe(product.opening),
        safe(product.receipt),
        totalStock.toFixed(2),
        safe(product.opening),
        safe(product.closing),
        safe(product.testing),
        `${sales.toFixed(2)} L`,
        `${this.cumulativeSales.toFixed(2)} L`,
        safe(product.closingStock || product.tankDip || product.closing),
        formatMoney(product.rate),
        formatMoney(product.amount),
      ];
      let x = startX;

      row.forEach((value, index) => {
        this.drawCell(x, this.y, widths[index], 8, value, {
          fontSize: 6.5,
          fill: index === 8 ? [255, 247, 237] : null,
        });
        x += widths[index];
      });
      this.y += 8;
    });

    const totalRow = [
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      `${Number(this.totals.totalLiters || 0).toFixed(2)} L`,
      `${this.cumulativeSales.toFixed(2)} L`,
      "",
      "",
      formatMoney(this.totals.totalSales),
    ];
    if (this.addPageIfNeeded(10)) {
      drawTableHead();
    }
    let x = startX;
    totalRow.forEach((value, index) => {
      this.drawCell(x, this.y, widths[index], 8, value, {
        bold: true,
        fill: [255, 237, 213],
        fontSize: 6.5,
      });
      x += widths[index];
    });
    this.y += 12;
  }

  drawCashTable() {
    this.addPageIfNeeded(50);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10);
    this.doc.text("Collection, Expense and Closing Cash", this.margin, this.y);
    this.y += 5;

    const headers = ["Collection", "Amount", "Expense", "Amount", "Summary", "Amount"];
    const widths = [42, 36, 48, 36, 42, 36];
    const rows = [
      [
        "Cash",
        formatMoney(sumRecordField(this.records, "cash")),
        "Generator Fuel",
        formatMoney(sumRecordField(this.records, "generator")),
        "Total Sales",
        formatMoney(this.totals.totalSales),
      ],
      [
        "UPI",
        formatMoney(sumRecordField(this.records, "upi")),
        "Staff Expense",
        formatMoney(sumRecordField(this.records, "staff")),
        "Collection",
        formatMoney(this.totals.totalCollection),
      ],
      [
        "Card",
        formatMoney(sumRecordField(this.records, "card")),
        "Cleaning",
        formatMoney(sumRecordField(this.records, "cleaning")),
        "Expenses",
        formatMoney(this.totals.totalExpenses),
      ],
      [
        "Fleet/Credit",
        formatMoney(sumRecordField(this.records, "fleet") + sumRecordField(this.records, "credit")),
        "Maintenance",
        formatMoney(sumRecordField(this.records, "maintenance")),
        "Closing Cash",
        formatMoney(this.totals.closingCash),
      ],
    ];
    let x = this.margin + 28;

    headers.forEach((header, index) => {
      this.drawCell(x, this.y, widths[index], 8, header, {
        bold: true,
        fill: [232, 238, 247],
      });
      x += widths[index];
    });
    this.y += 8;

    rows.forEach((row) => {
      x = this.margin + 28;
      row.forEach((value, index) => {
        this.drawCell(x, this.y, widths[index], 8, value, {
          fontSize: 7,
          fill: index >= 4 ? [255, 247, 237] : null,
        });
        x += widths[index];
      });
      this.y += 8;
    });
  }

  save() {
    this.drawHeader();
    this.drawManualTable();
    this.drawCashTable();

    const dateLabel =
      formatDate(this.fromDate) === formatDate(this.toDate)
        ? formatDate(this.fromDate)
        : `${formatDate(this.fromDate)}-${formatDate(this.toDate)}`;
    const fileProduct = this.productTitle.replace(/\s+/g, "-");
    this.doc.save(`DSR-${fileProduct}-${dateLabel.replace(/\s+/g, "-")}.pdf`);
  }
}
