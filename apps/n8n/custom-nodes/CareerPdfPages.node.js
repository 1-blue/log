const { createHash } = require("node:crypto");

class CareerPdfPages {
  description = {
    displayName: "Career Ops PDF Pages",
    name: "careerPdfPages",
    group: ["transform"],
    version: 1,
    description:
      "Render every PDF page for validated OCR without changing the source file",
    defaults: { name: "Career Ops PDF Pages" },
    inputs: ["main"],
    outputs: ["main"],
    properties: [
      {
        displayName: "Binary Property",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
      },
      {
        displayName: "Expected File Size",
        name: "fileSize",
        type: "number",
        default: 0,
      },
      {
        displayName: "Expected SHA-256",
        name: "contentHash",
        type: "string",
        default: "",
      },
    ],
  };

  async execute() {
    const { PDFParse } = require("../node_modules/pdf-parse");
    const { renderPdfPages } = await import("../document-ocr.mjs");
    const items = this.getInputData();
    const results = [];
    for (let index = 0; index < items.length; index++) {
      const key = this.getNodeParameter("binaryPropertyName", index);
      const bytes = await this.helpers.getBinaryDataBuffer(index, key);
      const fileSize = this.getNodeParameter("fileSize", index);
      const expectedHash = this.getNodeParameter("contentHash", index);
      if (
        bytes.length !== fileSize ||
        createHash("sha256").update(bytes).digest("hex") !== expectedHash
      )
        throw new Error("OCR_FAILED");
      const pages = await renderPdfPages(bytes, PDFParse);
      results.push({
        json: { pageCount: pages.length, pages },
        pairedItem: { item: index },
      });
    }
    return [results];
  }
}

module.exports = { CareerPdfPages };
