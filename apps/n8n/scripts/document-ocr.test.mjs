import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assessPdf,
  buildOcrBody,
  readOcrResponse,
  classifyOcrError,
  extractionCallbackCode,
  renderPdfPages,
} from "./document-ocr.mjs";
test("text PDFs skip OCR; empty vector PDFs use it within the page limit", () => {
  assert.equal(
    assessPdf({ text: "개발 경험", numpages: 9 }).ocrRequired,
    false,
  );
  assert.equal(assessPdf({ text: "", numpages: 9 }).ocrRequired, true);
  assert.equal(
    assessPdf({ text: "", numpages: 31 }).extractionError,
    "OCR_PAGE_LIMIT_EXCEEDED",
  );
  assert.equal(
    assessPdf({ text: "" }).extractionError,
    "OCR_PAGE_COUNT_UNKNOWN",
  );
});
const imagePages = (count) =>
  Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    imageUrl: "data:image/png;base64,iVBORw0KGgo=",
  }));
test("OCR receives every complete rendered page, not just embedded PDF images", () => {
  const request = buildOcrBody(imagePages(9));
  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.store, false);
  const images = request.input[1].content.filter(
    (item) => item.type === "input_image",
  );
  assert.equal(images.length, 9);
  assert.ok(images.every((item) => item.detail === "high"));
  assert.ok(
    !request.input[1].content.some((item) => item.type === "input_file"),
  );
  assert.equal(request.text.format.schema.properties.pages.minItems, 9);
  assert.equal(request.text.format.schema.properties.pages.maxItems, 9);
  assert.equal(request.text.format.strict, true);
  assert.throws(() => buildOcrBody(imagePages(31)));
  assert.throws(() =>
    buildOcrBody([{ page: 2, imageUrl: imagePages(1)[0].imageUrl }]),
  );
  assert.throws(() =>
    buildOcrBody([{ page: 1, imageUrl: "https://example.com/image.png" }]),
  );
});
test("renderer checks each page, bounds memory and always frees the parser", async () => {
  let destroyed = 0;
  const requested = [];
  class Parser {
    async getInfo() {
      return {
        total: 2,
        pages: [1, 2].map((pageNumber) => ({
          pageNumber,
          width: 595,
          height: 842,
        })),
      };
    }
    async getScreenshot(options) {
      requested.push(options);
      return {
        pages: [
          {
            pageNumber: options.partial[0],
            dataUrl: imagePages(1)[0].imageUrl,
          },
        ],
      };
    }
    async destroy() {
      destroyed++;
    }
  }
  assert.deepEqual(
    await renderPdfPages(Buffer.from("%PDF-fixture"), 2, Parser),
    imagePages(2),
  );
  assert.deepEqual(
    requested.map((options) => options.partial),
    [[1], [2]],
  );
  assert.equal(destroyed, 1);
  class MissingPage extends Parser {
    async getScreenshot() {
      return { pages: [] };
    }
  }
  await assert.rejects(
    renderPdfPages(Buffer.from("%PDF-fixture"), 2, MissingPage),
    /OCR_INCOMPLETE/,
  );
  assert.equal(destroyed, 2);
  class OversizedImage extends Parser {
    async getScreenshot(options) {
      return {
        pages: [
          {
            pageNumber: options.partial[0],
            dataUrl: "data:image/png;base64," + "A".repeat(4194304),
          },
        ],
      };
    }
  }
  await assert.rejects(
    renderPdfPages(Buffer.from("%PDF-fixture"), 2, OversizedImage),
    /OCR_FAILED/,
  );
  assert.equal(destroyed, 3);
  class WrongCount extends Parser {
    async getInfo() {
      return { total: 31, pages: [] };
    }
  }
  await assert.rejects(
    renderPdfPages(Buffer.from("%PDF-fixture"), 2, WrongCount),
    /OCR_INCOMPLETE/,
  );
  assert.equal(destroyed, 4);
  await assert.rejects(
    renderPdfPages(Buffer.from("not a PDF"), 2, Parser),
    /OCR_FAILED/,
  );
});
const response = (pages) => ({
  status: "completed",
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            pages: pages.map((page) => ({ complete: true, ...page })),
          }),
        },
      ],
    },
  ],
});
test("all pages must be present, and incomplete/empty/refused output must fail", () => {
  assert.equal(
    readOcrResponse(response([{ page: 1, text: "한국어" }]), 1).text,
    "[페이지 1]\n한국어",
  );
  assert.equal(
    readOcrResponse(response([{ page: 1, text: "한국어" }]), 2).extractionError,
    "OCR_INCOMPLETE",
  );
  assert.equal(
    readOcrResponse(response([{ page: 1, text: "" }]), 1).extractionError,
    "OCR_TEXT_EMPTY",
  );
  assert.equal(
    readOcrResponse(response([{ page: 1, text: "[이미지 없음]" }]), 1)
      .extractionError,
    "OCR_INCOMPLETE",
  );
  assert.equal(
    readOcrResponse(
      response([{ page: 1, text: "일부 텍스트", complete: false }]),
      1,
    ).extractionError,
    "OCR_INCOMPLETE",
  );
  assert.equal(
    readOcrResponse({ status: "incomplete" }, 1).extractionError,
    "OCR_INCOMPLETE",
  );
  assert.doesNotThrow(() => readOcrResponse(null, 1));
  assert.equal(
    readOcrResponse(response([null]), 1).extractionError,
    "OCR_INCOMPLETE",
  );
  assert.equal(
    readOcrResponse(
      {
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "null" }] }],
      },
      1,
    ).extractionError,
    "OCR_INCOMPLETE",
  );
  assert.equal(
    readOcrResponse(
      { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
      1,
    ).extractionError,
    "OCR_FAILED",
  );
});
test("only transient failures get one bounded retry; billing/auth failures do not", () => {
  assert.equal(classifyOcrError({ statusCode: 429 }).ocrRetry, true);
  assert.equal(classifyOcrError({ statusCode: 429 }, 1).ocrRetry, false);
  assert.equal(
    classifyOcrError({ statusCode: 429, message: "insufficient_quota" })
      .ocrRetry,
    false,
  );
  assert.equal(classifyOcrError({ statusCode: 401 }).ocrRetry, false);
  assert.equal(
    classifyOcrError({ statusCode: 503, headers: { "retry-after": "120" } })
      .ocrRetry,
    false,
  );
  assert.equal(
    classifyOcrError({ message: "ETIMEDOUT" }).extractionError,
    "OCR_TIMEOUT",
  );
});
test("published workflow uses verified page rendering, callback and 180 second calls", () => {
  const workflow = JSON.parse(
    readFileSync(
      new URL("../workflows/career-analysis.json", import.meta.url),
      "utf8",
    ),
  );
  const nodes = new Map(workflow.nodes.map((node) => [node.name, node]));
  assert.equal(
    nodes.get("PDF 텍스트 추출").parameters.options.keepSource,
    "binary",
  );
  assert.equal(
    nodes.get("문서 추출 결과 구성").parameters.jsCode,
    extractionCallbackCode(),
  );
  assert.equal(nodes.get("문서 OCR 요청 구성").onError, "continueErrorOutput");
  assert.equal(
    nodes.get("문서 PDF 페이지 렌더링").type,
    "CUSTOM.careerPdfPages",
  );
  assert.equal(
    nodes.get("문서 PDF 페이지 렌더링").onError,
    "continueErrorOutput",
  );
  assert.ok(
    nodes
      .get("문서 PDF 페이지 렌더링")
      .parameters.contentHash.includes("payload.document.contentHash"),
  );
  assert.equal(
    workflow.connections["자동 OCR 필요"].main[0][0].node,
    "문서 PDF 페이지 렌더링",
  );
  assert.equal(
    workflow.connections["문서 PDF 페이지 렌더링"].main[1][0].node,
    "문서 OCR 최종 실패",
  );
  assert.equal(
    workflow.connections["문서 OCR 요청 구성"].main[1][0].node,
    "문서 OCR 최종 실패",
  );
  for (const name of ["문서 자동 OCR", "문서 자동 OCR 재시도"]) {
    assert.equal(nodes.get(name).parameters.options.timeout, 180000);
    assert.equal(nodes.get(name).parameters.nodeCredentialType, "openAiApi");
  }
  for (const node of workflow.nodes.filter(
    (node) => node.type === "n8n-nodes-base.code",
  ))
    assert.doesNotThrow(
      () =>
        new Function(
          "$",
          "$input",
          "$env",
          "require",
          `return (async()=>{${node.parameters.jsCode}})();`,
        ),
    );
});
