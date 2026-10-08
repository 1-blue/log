export function readAiTokenUsage(response) {
  const usage = response?.usage;
  if (
    !usage ||
    !Number.isSafeInteger(usage.input_tokens) ||
    usage.input_tokens < 0 ||
    !Number.isSafeInteger(usage.output_tokens) ||
    usage.output_tokens < 0
  )
    return null;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens ?? 0;
  if (
    !Number.isSafeInteger(cachedInputTokens) ||
    cachedInputTokens < 0 ||
    !Number.isSafeInteger(cacheWriteTokens) ||
    cacheWriteTokens < 0 ||
    cachedInputTokens + cacheWriteTokens > usage.input_tokens
  )
    return null;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens,
    cacheWriteTokens,
  };
}

export function usageResponseStatus(response, errorOutput = false) {
  if (errorOutput) return "failed";
  return response?.status === "completed"
    ? "succeeded"
    : ["incomplete", "failed", "cancelled"].includes(response?.status)
      ? "failed"
      : "unknown";
}

export function usageSigningCode() {
  return `const crypto=require('crypto');
const item=$input.first().json;
const body=JSON.stringify(item.callback);
const timestamp=String(Math.floor(Date.now()/1000));
const path='/v1/internal/ai-usage';
const canonical=['v1',timestamp,item.callback.eventId,item.callback.requestId,'POST',path,crypto.createHash('sha256').update(body).digest('hex')].join(${JSON.stringify("\n")});
const base=String($env.WORKER_CALLBACK_URL).replace(/\\/$/,'');
return [{json:{...item,body,callbackUrl:base.endsWith('/v1/internal')?base+'/ai-usage':base+path,headers:{eventId:item.callback.eventId,requestId:item.callback.requestId,timestamp,signature:'v1='+crypto.createHmac('sha256',$env.WORKER_CALLBACK_SECRET).update(canonical).digest('hex')}}}];`;
}

// Record BEFORE making a billable call. A crash, lost response, or exhausted
// accounting callback remains visible as a started/unpriced call, never $0.
export function instrumentAiCalls(workflow) {
  const specs = [
    ["OpenAI 공고 원문 보완", "job_posting_extraction", 1],
    ["OpenAI 공고 원문 보완 재시도", "job_posting_extraction", 2],
    ["OpenAI 프로필 비교", "profile_comparison", 1],
    ["OpenAI 프로필 비교 재시도", "profile_comparison", 2],
    ["문서 자동 OCR", "document_ocr", 1],
    ["문서 자동 OCR 재시도", "document_ocr", 2],
  ];
  const codeNode = (name, code, position) => ({
    name,
    id: crypto.randomUUID(),
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position,
    parameters: { jsCode: code },
  });
  const target = (node) => ({ node, type: "main", index: 0 });
  const sendNode = (name, position, optional = false) => ({
    name,
    id: crypto.randomUUID(),
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 1000,
    ...(optional ? { onError: "continueRegularOutput" } : {}),
    parameters: {
      method: "POST",
      url: "={{ $json.callbackUrl }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Content-Type", value: "application/json" },
          ...[
            ["X-Event-Id", "eventId"],
            ["X-Request-Id", "requestId"],
            ["X-Signature-Timestamp", "timestamp"],
            ["X-Signature", "signature"],
          ].map(([name, key]) => ({
            name,
            value: `={{ $json.headers.${key} }}`,
          })),
        ],
      },
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/json",
      body: "={{ $json.body }}",
      options: { timeout: 10000 },
    },
  });
  for (const [name, operation, attempt] of specs) {
    const ai = workflow.nodes.find((node) => node.name === name);
    if (!ai) throw new Error(`AI node missing: ${name}`);
    const prefix = `${name} 사용량`;
    if (workflow.nodes.some((node) => node.name === `${prefix} 시작`)) {
      const start = workflow.nodes.find(
        (node) => node.name === `${prefix} 시작`,
      );
      start.parameters.jsCode = start.parameters.jsCode.replace(
        "return [{json:{callback:",
        "return [{json:{original:$input.first().json,callback:",
      );
      const restoreName = `${prefix} 입력 복원`;
      if (!workflow.nodes.some((node) => node.name === restoreName))
        workflow.nodes.push(
          codeNode(
            restoreName,
            `return [{json:$(${JSON.stringify(`${prefix} 시작`)}).first().json.original}];`,
            [ai.position[0] - 150, ai.position[1]],
          ),
        );
      workflow.connections[`${prefix} 시작 기록`] = {
        main: [[target(restoreName)]],
      };
      workflow.connections[restoreName] = { main: [[target(name)]] };
      const startRecord = workflow.nodes.find(
        (node) => node.name === `${prefix} 시작 기록`,
      );
      startRecord.onError = "continueErrorOutput";
      const failureName = `${prefix} 기록 실패`;
      if (!workflow.nodes.some((node) => node.name === failureName))
        workflow.nodes.push(
          codeNode(
            failureName,
            "return [{json:{error:'ACCOUNTING_RECORD_FAILED'}}];",
            [ai.position[0] - 150, ai.position[1] + 240],
          ),
        );
      workflow.connections[`${prefix} 시작 기록`].main[1] = [
        target(failureName),
      ];
      workflow.connections[failureName] = {
        main: [
          structuredClone(
            workflow.connections[`${prefix} 오류 전달`]?.main[0] ?? [],
          ),
        ],
      };
      for (const node of workflow.nodes.filter((node) =>
        node.name.startsWith(prefix),
      )) {
        if (node.name.includes("서명"))
          node.parameters.jsCode = usageSigningCode();
        const branch = node.name.includes("오류") ? 1 : 0;
        const offset = node.name.includes("시작")
          ? node.name.endsWith("기록")
            ? -300
            : node.name.endsWith("서명")
              ? -450
              : -600
          : node.name.includes("입력 복원") || node.name.includes("기록 실패")
            ? -150
            : node.name.endsWith("전달")
              ? 600
              : node.name.endsWith("기록")
                ? 450
                : node.name.endsWith("서명")
                  ? 300
                  : 150;
        node.position = [
          ai.position[0] + offset,
          ai.position[1] + (offset > 0 ? branch * 240 : 0),
        ];
      }
      continue;
    }
    const original = structuredClone(workflow.connections[name]);
    const startName = `${prefix} 시작`;
    const signedName = `${prefix} 시작 서명`;
    const recordedName = `${prefix} 시작 기록`;
    // Rewire only inbound edges to the AI node; restore success/error routes
    // after independent accounting nodes, without retrying the AI request.
    for (const outputs of Object.values(workflow.connections))
      for (const edges of outputs.main ?? [])
        for (const edge of edges) if (edge.node === name) edge.node = startName;
    const startCode = `const crypto=require('crypto'); const payload=$('HMAC 요청 검증').first().json.payload; const startedAt=new Date().toISOString();
return [{json:{original:$input.first().json,callback:{schemaVersion:'1.0.0',eventId:crypto.randomUUID(),requestId:payload.requestId,callId:crypto.randomUUID(),operation:${JSON.stringify(operation)},resourceId:${operation === "document_ocr" ? "payload.document.id" : operation === "job_posting_extraction" ? "payload.collectionRunId" : "payload.analysisJobId"},model:'gpt-5.6-luna',responseId:null,serviceTier:'default',status:'started',usage:null,latencyMs:null,attempt:${attempt},runAttempt:payload.runAttempt??1,occurredAt:startedAt}}}];`;
    workflow.nodes.push(
      codeNode(startName, startCode, ai.position),
      codeNode(signedName, usageSigningCode(), ai.position),
      sendNode(recordedName, ai.position),
    );
    workflow.connections[startName] = { main: [[target(signedName)]] };
    workflow.connections[signedName] = { main: [[target(recordedName)]] };
    workflow.connections[recordedName] = { main: [[target(name)]] };
    workflow.connections[name] = { main: [] };
    for (let branch = 0; branch < (original?.main?.length ?? 0); branch++) {
      const completedName = `${prefix} ${branch === 0 ? "응답" : "오류"}`;
      const signName = `${completedName} 서명`;
      const sendName = `${completedName} 기록`;
      const restoreName = `${completedName} 전달`;
      const completedCode = `${readAiTokenUsage.toString()}\n${usageResponseStatus.toString()}
const crypto=require('crypto'); const response=$input.first().json; const start=$(${JSON.stringify(startName)}).first().json.callback;
return [{json:{original:response,callback:{...start,eventId:crypto.randomUUID(),status:usageResponseStatus(response,${branch !== 0}),model:response.model??start.model,responseId:typeof response.id==='string'?response.id:null,serviceTier:response.service_tier??'default',usage:readAiTokenUsage(response),latencyMs:Math.max(0,Date.now()-Date.parse(start.occurredAt)),occurredAt:new Date().toISOString()}}}];`;
      workflow.nodes.push(
        codeNode(completedName, completedCode, ai.position),
        codeNode(signName, usageSigningCode(), ai.position),
        sendNode(sendName, ai.position, true),
        codeNode(
          restoreName,
          `return [{json:$(${JSON.stringify(completedName)}).first().json.original}];`,
          ai.position,
        ),
      );
      workflow.connections[name].main[branch] = [target(completedName)];
      workflow.connections[completedName] = { main: [[target(signName)]] };
      workflow.connections[signName] = { main: [[target(sendName)]] };
      workflow.connections[sendName] = { main: [[target(restoreName)]] };
      workflow.connections[restoreName] = { main: [original.main[branch]] };
    }
  }
  // Also updates existing generated nodes, preserving stable IDs and input data.
  if (
    specs.some(
      ([name]) =>
        !workflow.nodes.some(
          (node) => node.name === `${name} 사용량 입력 복원`,
        ),
    )
  )
    return instrumentAiCalls(workflow);
  return workflow;
}
