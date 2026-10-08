import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// The canvas layout is deliberately independent of execution routing. Accounting
// stays beside its AI call; retries/errors stay inside the owning branch.
export function layoutWorkflow(workflow) {
  const existingNotes = new Map(
    workflow.nodes
      .filter((node) => node.type === "n8n-nodes-base.stickyNote")
      .map((node) => [node.name, node.id]),
  );
  workflow.nodes = workflow.nodes.filter(
    (node) => node.type !== "n8n-nodes-base.stickyNote",
  );
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  const placed = new Set();
  const groups = [];
  const group = (key, title, purpose, x, y, color) => {
    const members = [];
    const put = (name, column, row) => {
      const node = byName.get(name);
      if (!node) throw new Error(`Layout node missing: ${name}`);
      if (placed.has(name))
        throw new Error(`Layout node placed twice: ${name}`);
      node.position = [x + 220 + column * 440, y + 240 + row * 260];
      placed.add(name);
      members.push(node);
    };
    const ai = (name, column, row) => {
      const prefix = `${name} 사용량`;
      ["시작", "시작 서명", "시작 기록", "입력 복원"].forEach((suffix, index) =>
        put(`${prefix} ${suffix}`, column + index, row),
      );
      put(name, column + 4, row);
      ["응답", "응답 서명", "응답 기록", "응답 전달"].forEach((suffix, index) =>
        put(`${prefix} ${suffix}`, column + 5 + index, row),
      );
      ["오류", "오류 서명", "오류 기록", "오류 전달"].forEach((suffix, index) =>
        put(`${prefix} ${suffix}`, column + 5 + index, row + 1),
      );
      put(`${prefix} 기록 실패`, column + 3, row + 1);
    };
    groups.push({ key, title, purpose, x, y, color, members });
    return { put, ai };
  };
  // Split only the shared document callback transport. This avoids wires from
  // OCR crossing the collection area; signing and retry behavior are unchanged.
  const target = (name) => ({ node: name, type: "main", index: 0 });
  for (const [oldName, name] of [
    ["Callback 서명", "문서 Callback 서명"],
    ["Worker Callback 전송", "문서 Callback 전송"],
  ]) {
    if (!byName.has(name)) {
      const copy = structuredClone(byName.get(oldName));
      copy.id = randomUUID();
      copy.name = name;
      workflow.nodes.push(copy);
      byName.set(name, copy);
    }
  }
  for (const name of ["문서 추출 결과 구성", "문서 추출 실패 구성"])
    workflow.connections[name] = { main: [[target("문서 Callback 서명")]] };
  workflow.connections["문서 Callback 서명"] = {
    main: [[target("문서 Callback 전송")]],
  };

  const receive = group(
    "1",
    "요청 수신 · 인증",
    "Worker 요청의 HMAC 서명과 식별자를 검증합니다.",
    0,
    0,
    5,
  );
  receive.put("수집 요청 수신", 0, 0);
  receive.put("HMAC 요청 검증", 1, 0);
  receive.put("서명 유효 여부", 2, 0);
  receive.put("요청 접수 응답", 3, 0);
  receive.put("서명 오류 응답", 3, 1);
  const dispatch = group(
    "2",
    "요청 종류 분기",
    "공고·문서·적합도 분석·알림 요청을 해당 경로로 보냅니다.",
    0,
    1150,
    4,
  );
  [
    "Slack 알림 요청 여부",
    "문서 추출 요청 여부",
    "분석 요청 여부",
    "AI 원문 보완 요청 여부",
  ].forEach((name, index) => dispatch.put(name, index, index));

  const collection = group(
    "3-1",
    "공고 수집 · AI 구조화",
    "확보한 원문을 공통 공고 형식으로 구조화하고 Worker에 저장합니다.",
    2200,
    0,
    3,
  );
  collection.put("수동 원문 여부", 0, 0);
  collection.put("Wanted HTML 수집", 1, 0);
  collection.put("자동 결과 구성", 2, 0);
  collection.put("수동 결과 구성", 2, 1);
  collection.put("AI 원문 보완 준비", 0, 3);
  collection.ai("OpenAI 공고 원문 보완", 1, 3);
  collection.put("AI 원문 보완 결과 구성", 11, 3);
  collection.put("공고 구조화 오류 분류", 10, 4);
  collection.put("공고 구조화 재시도 여부", 11, 4);
  collection.put("공고 구조화 재시도 대기", 12, 4);
  collection.ai("OpenAI 공고 원문 보완 재시도", 1, 6);
  collection.put("AI 원문 보완 실패 구성", 12, 6);
  collection.put("Callback 서명", 14, 3);
  collection.put("Worker Callback 전송", 15, 3);

  const ocr = group(
    "3-2",
    "문서 AI OCR",
    "이력서·포트폴리오 PDF의 모든 페이지를 읽고 추출 결과를 저장합니다.",
    2200,
    2550,
    6,
  );
  ocr.put("문서 PDF 다운로드", 0, 0);
  ocr.put("문서 PDF 페이지 렌더링", 1, 0);
  ocr.put("문서 OCR 요청 구성", 2, 0);
  ocr.ai("문서 자동 OCR", 3, 0);
  ocr.put("문서 OCR 결과 검증", 12, 0);
  ocr.put("문서 추출 결과 구성", 13, 0);
  ocr.put("문서 Callback 서명", 14, 0);
  ocr.put("문서 Callback 전송", 15, 0);
  ocr.put("문서 추출 실패 구성", 0, 2);
  ocr.put("문서 OCR 오류 분류", 12, 2);
  ocr.put("문서 OCR 재시도 가능", 13, 2);
  ocr.put("문서 OCR 재시도 대기", 14, 2);
  ocr.ai("문서 자동 OCR 재시도", 3, 4);
  ocr.put("문서 OCR 최종 실패", 13, 5);

  const matching = group(
    "3-3",
    "공고 · 개인 자료 적합도 분석",
    "저장된 공고 구조와 문서 자료를 비교해 근거·보완점·면접 준비를 만듭니다.",
    2200,
    4600,
    2,
  );
  matching.put("분석 시작 이벤트 구성", 0, 0);
  matching.put("공고 사실 결과 확정", 1, 0);
  matching.put("프로필 분석 Heartbeat 구성", 2, 0);
  matching.ai("OpenAI 프로필 비교", 3, 2);
  matching.put("분석 결과 구성", 12, 2);
  matching.put("프로필 비교 오류 분류", 12, 3);
  matching.put("프로필 비교 자동 재시도 여부", 13, 3);
  matching.put("프로필 재시도 대기", 1, 5);
  matching.put("프로필 재시도 Heartbeat 구성", 2, 5);
  matching.ai("OpenAI 프로필 비교 재시도", 3, 6);
  matching.put("프로필 재시도 결과 구성", 12, 6);
  matching.put("프로필 재시도 오류 분류", 12, 7);
  matching.put("분석 실패 이벤트 구성", 13, 7);
  matching.put("분석 Callback 서명", 14, 2);
  matching.put("분석 Callback 전송", 15, 2);
  matching.put("분석 Callback 결과 분류", 16, 2);
  matching.put("분석 Callback 성공 여부", 17, 2);
  matching.put("분석 Callback 재시도 여부", 17, 4);
  matching.put("분석 Callback 재시도 대기", 16, 5);
  matching.put("분석 Callback 회차 증가", 15, 5);
  matching.put("분석 Callback 최종 실패", 18, 5);
  [
    "facts_first",
    "profile_first",
    "profile_retry_wait",
    "profile_retry_call",
  ].forEach((name, index) =>
    matching.put(`분석 Callback 후 ${name}`, index + 14, 0),
  );

  const slack = group(
    "3-4",
    "Slack 알림",
    "작업 결과를 전송하고 성공·실패·재시도 상태를 Worker에 기록합니다.",
    2200,
    7350,
    7,
  );
  slack.put("Slack 에러 채널 여부", 0, 0);
  slack.put("Slack Bot 메시지 전송", 1, 0);
  slack.put("Slack 에러 Webhook 전송", 1, 1);
  slack.put("Slack 결과 분류", 2, 0);
  slack.put("Slack 429 재시도 여부", 3, 0);
  slack.put("Slack 재시도 대기", 4, 2);
  slack.put("Slack 재시도 회차 증가", 5, 2);
  slack.put("Slack 재시도 에러 채널 여부", 6, 2);
  slack.put("Slack Bot 메시지 재시도", 7, 2);
  slack.put("Slack 에러 Webhook 재시도", 7, 3);
  slack.put("Slack 재시도 결과 분류", 8, 2);
  slack.put("Slack Callback 구성", 9, 0);
  slack.put("Slack Callback 서명", 10, 0);
  slack.put("Slack Callback 전송", 11, 0);

  for (const name of byName.keys())
    if (!placed.has(name)) throw new Error(`Unassigned layout node: ${name}`);
  for (const section of groups) {
    const right =
      Math.max(...section.members.map((node) => node.position[0])) + 420;
    const bottom =
      Math.max(...section.members.map((node) => node.position[1])) + 230;
    const name = `GROUP ${section.key} · ${section.title}`;
    workflow.nodes.push({
      id: existingNotes.get(name) ?? randomUUID(),
      name,
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [section.x, section.y],
      parameters: {
        content: `## ${section.key}. ${section.title}\n${section.purpose}`,
        width: right - section.x,
        height: bottom - section.y,
        color: section.color,
      },
    });
  }
  workflow.meta = { ...workflow.meta, careerOpsLayoutVersion: "branches-v2" };
  return workflow;
}
if (process.argv[1]?.endsWith("layout-workflow.mjs")) {
  const path = new URL("../workflows/career-analysis.json", import.meta.url);
  writeFileSync(
    path,
    `${JSON.stringify(layoutWorkflow(JSON.parse(readFileSync(path, "utf8"))), null, 2)}\n`,
  );
}
