import crypto from "node:crypto";
import fs from "node:fs";

function loadEnv(path) {
  const values = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const env = loadEnv("apps/worker/.env");
const baseUrl = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SECRET_KEY;
const ownerId = env.ADMIN_USER_ID;
if (!baseUrl || !serviceKey || !ownerId) {
  throw new Error("Required local Supabase environment is missing");
}

async function api(path, init = {}) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

function normalize(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(header|footer|nav)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(?:div|p|li|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

const headings = [
  ["companyIntroduction", /^회사\s*소개$/i],
  ["positionIntroduction", /^(?:직무|포지션)\s*소개$/i],
  ["expectations", /^기대\s*모습$/i],
  ["mainResponsibilities", /^(?:주요\s*업무|담당\s*업무|responsibilities)$/i],
  ["requirements", /^(?:자격\s*요건|자격요건|requirements)$/i],
  ["preferred", /^(?:우대\s*사항|우대사항|preferred)$/i],
  ["employmentConditions", /^(?:고용\s*조건|근무\s*조건|employment\s*conditions?)$/i],
  ["process", /^(?:채용\s*절차|전형\s*절차|진행\s*절차|process)$/i],
  ["benefits", /^(?:복리\s*후생|복지|benefits?)$/i],
  ["technologies", /^(?:기술\s*스택|기술스택|사용\s*기술|technologies?)$/i],
  ["traits", /^(?:인재상|traits?)$/i],
  ["deadline", /^(?:마감일|마감|deadline)$/i],
  ["location", /^(?:근무\s*지역|근무지|location)$/i],
];

function extractSections(text) {
  const sections = Object.fromEntries([
    ...headings.map(([key]) => [key, null]),
    ["other", null],
  ]);
  const parts = Object.fromEntries(headings.map(([key]) => [key, []]));
  const other = [];
  let current = null;
  const sectionSafeText = text.replace(
    /(?:회사\s*소개|(?:직무|포지션)\s*소개|기대\s*모습|주요\s*업무|담당\s*업무|자격\s*요건|자격요건|우대\s*사항|우대사항|고용\s*조건|근무\s*조건|채용\s*절차|전형\s*절차|복리\s*후생|기술\s*스택|기술스택|인재상|마감일|근무\s*지역|근무지)/gi,
    "\n$&\n",
  );
  for (const line of sectionSafeText.split("\n")) {
    const candidate = line.replace(/^[\s\-•·▸▶|]+|[\s:：]+$/g, "").trim();
    const heading = headings.find(([, pattern]) => pattern.test(candidate));
    if (heading) {
      current = heading[0];
      continue;
    }
    if (!line.trim()) continue;
    if (current) parts[current].push(line.trim());
    else other.push(line.trim());
  }
  for (const [key] of headings) sections[key] = parts[key].join("\n").trim() || null;
  sections.other = other.join("\n").trim() || null;
  return sections;
}

function bodyFromSections(sections) {
  const labels = {
    companyIntroduction: "회사 소개",
    positionIntroduction: "직무 소개",
    expectations: "기대 모습",
    mainResponsibilities: "주요 업무",
    requirements: "자격요건",
    preferred: "우대사항",
    employmentConditions: "고용조건",
    process: "채용절차",
    benefits: "복리후생",
    technologies: "기술 스택",
    traits: "인재상",
    deadline: "마감일",
    location: "근무지역",
  };
  return headings
    .map(([key]) => sections[key] ? `${labels[key]}\n${sections[key]}` : null)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pick(text, pattern) {
  const match = text.match(pattern);
  return match?.[0]?.slice(0, 500) ?? text.slice(0, 160);
}

const posting = (await api(`job_postings?owner_id=eq.${ownerId}&external_id=eq.353860&select=*`))[0];
if (!posting) throw new Error("Target Wanted posting was not found");
const application = (await api(`applications?owner_id=eq.${ownerId}&job_posting_id=eq.${posting.id}&select=*&order=attempt_number.desc&limit=1`))[0];
if (!application) throw new Error("Target application was not found");
const documents = await api(`document_versions?owner_id=eq.${ownerId}&document_type=in.(resume,portfolio)&extraction_status=eq.ready&select=*&order=created_at.desc`);
const resume = documents.find((item) => item.document_type === "resume");
const portfolio = documents.find((item) => item.document_type === "portfolio");
if (!resume || !portfolio) throw new Error("Ready resume and portfolio are required");

let html;
try {
  const response = await fetch(posting.canonical_url, { redirect: "error" });
  html = response.ok ? await response.text() : "";
} catch {
  html = "";
}
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] ?? html;
const visible = normalize(main);
const sections = extractSections(visible);
const rawContent = bodyFromSections(sections) || visible;
if (rawContent.length < 100) throw new Error("Wanted body fixture is too short");
const normalizedContent = [
  `회사명: ${posting.company_name}`,
  `공고명: ${posting.title}`,
  "",
  rawContent,
].join("\n");
const snapshotHash = hash(normalizedContent);
const snapshotPayload = {
  owner_id: ownerId,
  job_posting_id: posting.id,
  source: "wanted_html",
  raw_content: rawContent.slice(0, 100000),
  normalized_content: normalizedContent.slice(0, 102000),
  content_hash: snapshotHash,
  parser_version: "wanted-visible-body-v2",
  source_metadata: {
    title: posting.title,
    companyName: posting.company_name,
    datePosted: null,
    validThrough: null,
    employmentType: null,
    location: null,
    industry: null,
    occupationalCategory: null,
  },
  sections,
  fetched_at: new Date().toISOString(),
};
const snapshot = (await api(`job_posting_snapshots?owner_id=eq.${ownerId}&job_posting_id=eq.${posting.id}&content_hash=eq.${snapshotHash}&select=*`))[0]
  ?? (await api("job_posting_snapshots", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(snapshotPayload),
  }))[0];

const runId = crypto.randomUUID();
await api("job_posting_collection_runs", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    id: runId,
    owner_id: ownerId,
    job_posting_id: posting.id,
    mode: "automatic",
    status: "succeeded",
    request_id: crypto.randomUUID(),
    retryable: false,
    http_status: 200,
    snapshot_id: snapshot.id,
    final_event_id: crypto.randomUUID(),
    started_at: new Date(Date.now() - 1200).toISOString(),
    finished_at: new Date().toISOString(),
  }),
});

const resumeText = resume.extracted_text;
const portfolioText = portfolio.extracted_text;
const resumeProfile = {
  summary: "프론트엔드 개발과 타입 안정성, 운영 가능한 서비스 구조를 함께 구현해 온 개발자입니다.",
  headline: "실행할 수 없는 코드를 줄이고 운영 경험을 쌓는 프론트엔드 개발자",
  skills: ["TypeScript", "Next.js", "Cloudflare Workers", "n8n", "Docker", "PostgreSQL"],
  experiences: [{
    title: "프론트엔드 개발",
    organization: "개인·팀 프로젝트",
    period: null,
    summary: "웹 서비스의 화면과 API 연동을 구현했습니다.",
    achievements: ["타입 기반 계약과 오류 처리를 적용했습니다."],
    skills: ["TypeScript", "Next.js"],
    evidence: [{ page: null, section: "이력서", excerpt: pick(resumeText, /TypeScript/i) }],
  }],
  projects: [],
  visualHighlights: [],
  strengths: ["문제를 작게 나누고 재현 가능한 방식으로 개선합니다."],
  limitations: ["대규모 조직 인프라 운영 경험은 추가 설명이 필요합니다."],
  warnings: [],
};
const portfolioProfile = {
  summary: "서비스 화면, API Gateway, 자동화 Workflow를 직접 연결한 프로젝트 포트폴리오입니다.",
  headline: "개인 취업 준비 문제를 운영 가능한 자동화 서비스로 전환",
  skills: ["Cloudflare Workers", "n8n", "Docker", "Supabase", "Next.js"],
  experiences: [],
  projects: [{
    name: "Career Ops",
    summary: "채용공고와 개인 문서를 연결해 지원 준비를 돕는 관리자 서비스입니다.",
    role: "설계·개발",
    contributions: ["Worker API Gateway와 n8n Workflow를 분리했습니다."],
    technologies: ["Cloudflare Workers", "n8n", "Docker"],
    outcomes: ["비동기 분석 상태와 실패 복구 흐름을 화면에서 확인할 수 있습니다."],
    visualEvidence: [],
    evidence: [{ page: null, section: "Career Ops", excerpt: pick(portfolioText, /Cloudflare|n8n|Docker/i) }],
  }],
  visualHighlights: [{ page: null, section: "Career Ops", excerpt: "관리자 화면과 Workflow 실행 흐름" }],
  strengths: ["문제 정의부터 운영 흐름까지 연결한 결과물을 제시합니다."],
  limitations: ["실제 AI·Slack 운영 호출은 아직 외부 연동 전입니다."],
  warnings: [],
};

async function upsertProfile(path, conflict, payload) {
  const result = await api(`${path}?on_conflict=${conflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  return result[0];
}

const resumeProfileRow = await upsertProfile(
  "document_analysis_profiles",
  "owner_id,document_version_id,source,input_hash,prompt_version",
  {
    owner_id: ownerId,
    document_version_id: resume.id,
    document_type: "resume",
    source: "fixture",
    status: "succeeded",
    input_hash: resume.content_hash,
    profile: resumeProfile,
    model: "fixture/gpt-5.6-luna",
    reasoning_effort: "medium",
    prompt_version: "fixture-v1",
  },
);
const portfolioProfileRow = await upsertProfile(
  "document_analysis_profiles",
  "owner_id,document_version_id,source,input_hash,prompt_version",
  {
    owner_id: ownerId,
    document_version_id: portfolio.id,
    document_type: "portfolio",
    source: "fixture",
    status: "succeeded",
    input_hash: portfolio.content_hash,
    profile: portfolioProfile,
    model: "fixture/gpt-5.6-luna",
    reasoning_effort: "medium",
    prompt_version: "fixture-v1",
  },
);
const jobProfile = await upsertProfile(
  "job_posting_analysis_profiles",
  "owner_id,snapshot_id,source,input_hash,prompt_version",
  {
    owner_id: ownerId,
    job_posting_id: posting.id,
    snapshot_id: snapshot.id,
    source: "fixture",
    status: "succeeded",
    input_hash: snapshotHash,
    profile: {
      summary: "제품 개발과 자동화 인프라를 연결해 반복 업무를 개선하는 포지션입니다.",
      sections,
      requirements: ["서버리스 API 설계", "자동화 Workflow 운영", "Docker 기반 운영"],
      preferred: ["대규모 서비스 운영", "IaC 경험"],
      technologies: ["Cloudflare Workers", "n8n", "Docker", "PostgreSQL"],
      traits: ["문제를 발견하고 끝까지 개선하는 태도"],
      warnings: ["실제 공고와 분석 결과를 함께 검수해야 합니다."],
    },
    model: "fixture/gpt-5.6-luna",
    reasoning_effort: "medium",
    prompt_version: "fixture-v1",
  },
);

const requirementEvidence = (text, section) => [{
  source: "job_posting",
  sourceVersionId: snapshot.id,
  section,
  excerpt: pick(rawContent, new RegExp(text, "i")),
}];
const profileEvidence = (source, id, text) => [{
  source,
  sourceVersionId: id,
  section: "프로젝트 경험",
  excerpt: pick(source === "resume" ? resumeText : portfolioText, new RegExp(text, "i")),
}];
const requirements = [
  { id: "required-api", kind: "required", text: "안전한 API와 서버리스 환경을 설계한 경험", evidence: requirementEvidence("서버리스|API|Cloudflare", "주요 업무") },
  { id: "required-automation", kind: "required", text: "업무 자동화 Workflow를 구축하고 운영한 경험", evidence: requirementEvidence("n8n|자동화|Workflow", "주요 업무") },
  { id: "required-operations", kind: "required", text: "Docker 기반 서비스 운영 경험", evidence: requirementEvidence("Docker|운영", "자격요건") },
  { id: "preferred-iac", kind: "preferred", text: "Infrastructure as Code 경험", evidence: requirementEvidence("인프라|IaC|Terraform|Cloudflare", "우대사항") },
];
const matches = [
  { requirementId: "required-api", status: "matched", rationale: "Worker API Gateway와 서버리스 경계를 구현한 경험이 확인됩니다.", profileEvidence: profileEvidence("resume", resume.id, "Cloudflare|API|Worker") },
  { requirementId: "required-automation", status: "matched", rationale: "n8n 기반 자동화 Workflow를 프로젝트로 구현했습니다.", profileEvidence: profileEvidence("portfolio", portfolio.id, "n8n|자동화|Workflow") },
  { requirementId: "required-operations", status: "partial", rationale: "Docker 사용 경험은 확인되지만 장기 운영 규모는 추가 확인이 필요합니다.", profileEvidence: profileEvidence("portfolio", portfolio.id, "Docker") },
  { requirementId: "preferred-iac", status: "unknown", rationale: "자료에서 IaC의 실제 운영 범위를 확인하지 못했습니다.", profileEvidence: [] },
];
const gaps = [{
  title: "장기 인프라 운영과 IaC",
  description: "자동화 구조는 확인되지만 대규모 운영과 IaC 적용 범위를 보완할 필요가 있습니다.",
  priority: "high",
  requirementIds: ["required-operations", "preferred-iac"],
  evidence: profileEvidence("portfolio", portfolio.id, "Docker|운영"),
  actions: ["운영 지표와 장애 대응 사례를 기록합니다.", "Wrangler 또는 Terraform 배포 이력을 정리합니다."],
}];
const result = {
  job: {
    title: posting.title,
    companyName: posting.company_name,
    summary: "제품 개발과 자동화 인프라를 연결해 반복 업무를 개선하는 포지션입니다.",
    bodySections: sections,
    requirements,
    technologies: ["Cloudflare Workers", "n8n", "Docker", "PostgreSQL"].map((name) => ({ name, category: null, evidence: requirementEvidence(name, "기술 스택") })),
    traits: [{ text: "문제를 발견하고 끝까지 개선하는 태도", evidence: requirementEvidence("개선|문제", "인재상") }],
    warnings: ["이 결과는 OpenAI 연결 전 개발 검수를 위한 임시 fixture입니다."],
  },
  comparison: {
    summary: "서버리스 API와 자동화 Workflow 경험은 직접 연결되며, 장기 운영·IaC 근거는 보완이 필요합니다.",
    matches,
    gaps,
    interviewQuestions: [
      { category: "API Gateway", question: "Worker와 n8n의 책임을 어떻게 분리했나요?", intent: "경계와 장애 격리 설계를 확인합니다.", priority: "high", requirementIds: ["required-api"] },
      { category: "자동화 운영", question: "Workflow 실패와 중복 실행을 어떻게 처리했나요?", intent: "재시도와 멱등성 설계를 확인합니다.", priority: "high", requirementIds: ["required-automation"] },
    ],
    applicationStrategy: {
      motivationDraft: "반복되는 취업 준비 과정을 실제 서비스로 자동화하며 API Gateway와 Workflow 운영 경계를 구현한 경험을 바탕으로 기여하고 싶습니다.",
      keyMessages: ["실제 문제를 자동화 서비스로 전환", "Worker·n8n 책임 분리", "타입·멱등성·오류 처리 중심 설계"],
      resumeFocus: "TypeScript, Next.js, API Gateway와 오류 처리 경험을 강조합니다.",
      portfolioFocus: "Career Ops의 화면·Worker·n8n 연결 흐름을 시연합니다.",
      warnings: [],
    },
    warnings: ["OpenAI 연결 전 생성한 임시 분석 결과입니다."],
  },
  fitScore: 58,
};

const analysisJobId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const finalEventId = crypto.randomUUID();
const now = new Date().toISOString();
const jobPostingText = normalizedContent.slice(0, 100000);
const resumeInput = resumeText.slice(0, 80100);
const portfolioInput = portfolioText.slice(0, 80100);
await api("analysis_jobs", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    id: analysisJobId,
    owner_id: ownerId,
    application_id: application.id,
    job_posting_id: posting.id,
    job_posting_snapshot_id: snapshot.id,
    resume_version_id: resume.id,
    portfolio_version_id: portfolio.id,
    resume_profile_id: resumeProfileRow.id,
    portfolio_profile_id: portfolioProfileRow.id,
    job_posting_profile_id: jobProfile.id,
    job_posting_text: jobPostingText,
    job_posting_content_hash: hash(jobPostingText),
    resume_text: resumeInput,
    resume_content_hash: hash(resumeInput),
    resume_original_length: resumeText.length,
    resume_truncated: resumeText.length > resumeInput.length,
    portfolio_text: portfolioInput,
    portfolio_content_hash: hash(portfolioInput),
    portfolio_original_length: portfolioText.length,
    portfolio_truncated: portfolioText.length > portfolioInput.length,
    status: "succeeded",
    stage: "saving",
    request_id: requestId,
    attempt_count: 1,
    final_event_id: finalEventId,
    started_at: new Date(Date.now() - 4500).toISOString(),
    finished_at: now,
  }),
});
await api("analysis_results", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    analysis_job_id: analysisJobId,
    owner_id: ownerId,
    schema_version: "1.0.0",
    job_posting_facts: result.job,
    result,
    completed_event_id: finalEventId,
  }),
});
await api("analysis_step_executions", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify([
    { analysis_job_id: analysisJobId, owner_id: ownerId, step: "job_facts", model: "fixture/gpt-5.6-luna", prompt_version: "fixture-v1", response_id: null, input_tokens: 0, output_tokens: 0, latency_ms: 0, attempt_count: 1 },
    { analysis_job_id: analysisJobId, owner_id: ownerId, step: "profile_comparison", model: "fixture/gpt-5.6-luna", prompt_version: "fixture-v1", response_id: null, input_tokens: 0, output_tokens: 0, latency_ms: 0, attempt_count: 1 },
  ]),
});
console.log(JSON.stringify({ analysisJobId, snapshotId: snapshot.id, resumeProfileId: resumeProfileRow.id, portfolioProfileId: portfolioProfileRow.id, jobPostingProfileId: jobProfile.id }));
